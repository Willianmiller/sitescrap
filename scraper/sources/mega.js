// Fonte: Mega Leilões
// Lista os imóveis do RJ (/imoveis/rj) e busca o detalhe de cada lote.
// Mantém apenas leilões judiciais e extrajudiciais.

const { httpGet, pool, sleep } = require('../lib/http');
const { clean, parseMoney, parseNumber, titleCaseCity } = require('../lib/property');

const BASE = 'https://www.megaleiloes.com.br';
const LIST_URL = `${BASE}/imoveis/rj`;
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || '12', 10);
const CONCURRENCY = Math.min(parseInt(process.env.MEGA_CONCURRENCY || '6', 10), 10);

const TYPE_FROM_URL = {
  'casas': 'Casa',
  'apartamentos': 'Apartamento',
  'imoveis-comerciais': 'Comercial',
  'terrenos-e-lotes': 'Terreno',
  'terrenos-para-incorporacao': 'Terreno',
  'casa-em-terreno-para-incorporacoes': 'Casa',
  'galpoes': 'Galpão',
  'galpoes--industriais': 'Galpão',
  'imoveis-rurais': 'Rural',
  'glebas': 'Gleba',
  'hoteis': 'Hotel',
  'hospitais': 'Hospital',
  'resorts': 'Resort',
  'deposito-de-garagem': 'Garagem',
  'vagas-de-garagem': 'Garagem',
  'outros': 'Outros'
};

function extractListCards(html) {
  return html.split(/<div class="col-sm-6 col-md-4 col-lg-3"\s+data-key="/).slice(1).map(b => {
    const id = (b.match(/^(\d+)/) || [])[1];
    if (!id) return null;
    const href = (b.match(/class="card-title"\s+href="([^"]+)"/) || [])[1] || '';
    const title = clean((b.match(/class="card-title"[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const locality = clean((b.match(/class="card-locality"[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const priceText = clean((b.match(/class="card-price">([\s\S]*?)<\/div>/) || [])[1]);
    const modality = clean((b.match(/class="card-instance-title"><a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const lot = clean((b.match(/class="card-batch-number">([\s\S]*?)<\/div>/) || [])[1]);
    const status = clean((b.match(/class="card-status">([\s\S]*?)<\/div>/) || [])[1]);
    const dates = [...b.matchAll(/class="card-first-instance-date"><b>([^<]*)<\/b>\s*([^<]*)<\/span>/g)]
      .map(m => ({ label: clean(m[1]).replace(':', ''), value: clean(m[2]) }));
    const values = [...b.matchAll(/class="card-instance-value">([\s\S]*?)<\/span>/g)].map(m => clean(m[1]));
    const img = (b.match(/data-bg="([^"]+)"/) || [])[1] || (b.match(/<img[^>]+src="(https:\/\/cdn[^"]+)"/) || [])[1] || '';
    return {
      id,
      url: href.split('?')[0],
      title,
      locality,
      priceText,
      modality,
      lot,
      status,
      dates,
      values,
      img
    };
  }).filter(Boolean);
}

function lastPage(html) {
  const m = html.match(/<link href="([^"]+)" rel="last">/);
  if (!m) return 1;
  const p = m[1].match(/pagina=(\d+)/);
  return p ? parseInt(p[1], 10) : 1;
}

function splitDate(s) {
  const m = String(s || '').match(/(\d{2}\/\d{2}\/\d{4})(?:\s*(?:às|as)\s*(\d{2}:\d{2}))?/i);
  return m ? { date: m[1], time: m[2] || '' } : { date: '', time: '' };
}

function blockValue(html, label) {
  const i = html.indexOf('>' + label + '<');
  if (i === -1) return '';
  const rest = html.slice(i, i + 1500);
  const m = rest.match(/class="value">([\s\S]*?)<\/div>/);
  return m ? clean(m[1]) : '';
}

function parseDetail(html) {
  const title = clean((html.match(/<h1[^>]*class="section-header"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);

  let desc = '';
  const descMatch = html.match(/id="tab-description"[\s\S]*?<div class="content">([\s\S]*?)<\/div>/);
  if (descMatch) {
    desc = descMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  const localizacao = blockValue(html, 'Localização');
  const comitente = blockValue(html, 'Comitente');
  const leiloeiroFull = blockValue(html, 'Leiloeiro');
  const leiloeiro = leiloeiroFull.split(/\s+JUC[A-Z]{2,}/)[0].trim();
  const avaliacaoTexto = blockValue(html, 'Valor de Avaliação');
  const avaliacao = parseMoney(avaliacaoTexto).valor;

  const areaMatch = html.match(/<b>Área<\/b><br>\s*([^<]+)/i);
  let metragem = areaMatch ? parseNumber(areaMatch[1]) : null;
  if (!metragem && title) {
    const tm = title.match(/(\d[\d.,]*)\s*m²/i);
    if (tm) metragem = parseNumber(tm[1]);
  }

  const matriculaMatch = desc.match(/Matr[íi]cula\(s\):\s*([0-9][0-9.\-\/]*)/i);
  const matricula = matriculaMatch ? matriculaMatch[1].replace(/[.\-\/]+$/, '').trim() : '';

  const batchType = clean((html.match(/class="batch-type">([\s\S]*?)<\/div>/) || [])[1]);
  const statusText = clean((html.match(/class="instance-text">([\s\S]*?)<\/div>/) || [])[1]);

  const photos = [];
  const galleryRe = /data-mfp-src="([^"]+)"/g;
  let gm;
  while ((gm = galleryRe.exec(html)) !== null) {
    const u = gm[1];
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
    if (!photos.includes(u)) photos.push(u);
    if (photos.length >= MAX_IMAGES) break;
  }
  if (!photos.length) {
    const og = (html.match(/property="og:image"[^>]+content="([^"]+)"/) || [])[1];
    if (og) photos.push(og);
  }

  // Blocos de praças: cada .instance tem uma ou mais datas e um valor
  const instances = [];
  const instRe = /<div\s+class="instance(?:\s+active)?">([\s\S]*?)<\/div>/g;
  let im;
  while ((im = instRe.exec(html)) !== null) {
    const block = im[1];
    const dates = [...block.matchAll(/class="card-first-instance-date">\s*<b>([^<]*)<\/b>\s*([^<]*)<\/span>/g)]
      .map(m => ({ label: clean(m[1]).replace(':', ''), value: clean(m[2]) }));
    const value = clean((block.match(/class="card-instance-value">([\s\S]*?)<\/span>/) || [])[1]);
    instances.push({ dates, value });
  }

  const auctionDates = [];
  let firstPrice = '';
  for (const inst of instances) {
    for (const d of inst.dates) {
      if (!d.value) continue;
      const parsed = splitDate(d.value);
      if (!parsed.date) continue;
      if (d.label.toLowerCase().startsWith('data')) auctionDates.push(parsed);
    }
    if (!firstPrice && inst.value) firstPrice = inst.value;
  }

  return {
    title,
    desc,
    localizacao,
    comitente,
    leiloeiro,
    avaliacao,
    avaliacaoTexto,
    metragem,
    matricula,
    batchType,
    statusText,
    photos,
    auctionDates,
    firstPrice
  };
}

function cityFromLocality(locality, endereco) {
  if (locality) {
    const m = locality.match(/^(.*?),\s*RJ$/i);
    if (m) return titleCaseCity(m[1]);
  }
  const e = String(endereco || '');
  const parts = e.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2 && /^RJ$/i.test(parts[parts.length - 1])) return titleCaseCity(parts[parts.length - 2]);
  return '';
}

function bairroFromEndereco(endereco) {
  const parts = String(endereco || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 4 && /^RJ$/i.test(parts[parts.length - 1])) return parts[parts.length - 3];
  return '';
}

function tipoFromUrl(url) {
  const m = String(url || '').match(/\/imoveis\/([^/]+)\/rj\//i);
  if (!m) return '';
  return TYPE_FROM_URL[m[1]] || '';
}

async function fetchDetail(card) {
  if (!card.url) return null;
  try {
    const r = await httpGet(card.url);
    if (r.status !== 200) return null;
    return parseDetail(r.body);
  } catch (e) {
    return null;
  }
}

function mapProperty(card, detail) {
  const d = detail || {};
  const tipo = (d.batchType || card.modality || '').toLowerCase();
  const modality = tipo === 'judicial' ? 'Judicial' : 'Extrajudicial';
  const dates = (d.auctionDates && d.auctionDates.length)
    ? d.auctionDates
    : card.dates.filter(x => x.label.toLowerCase().startsWith('data')).map(x => splitDate(x.value)).filter(x => x.date);

  const photos = (d.photos && d.photos.length) ? d.photos.slice() : (card.img ? [card.img] : []);
  if (card.img && !photos.includes(card.img) && !photos.length) photos.push(card.img);

  const price = parseMoney(d.firstPrice || card.priceText);
  const endereco = d.localizacao || '';
  const cidade = cityFromLocality(card.locality, endereco);

  return {
    source: 'megaleiloes',
    source_id: `mega-${card.id}`,
    listing_id: 'M' + card.id,
    title: d.title || card.title,
    description: (d.desc || '').slice(0, 4000),
    cidade: cidade || '',
    estado: 'RJ',
    bairro: bairroFromEndereco(endereco),
    endereco,
    url: card.url,
    img_url: photos[0] || card.img || '',
    photos,
    lance_minimo: price.texto,
    lance_minimo_valor: price.valor,
    lance_segundo_leilao: '',
    leilao_tipo: tipo === 'judicial' ? 'judicial' : 'extrajudicial',
    tipo_imovel: tipoFromUrl(card.url),
    metragem: d.metragem || null,
    quartos: null,
    banheiros: null,
    vagas: null,
    leiloeiro: d.leiloeiro || '',
    matricula: d.matricula || '',
    avaliacao: d.avaliacao || null,
    aceita_financiamento: null,
    aceita_parcelamento: null,
    aceita_fgts: null,
    dividas_condominio: null,
    dividas_iptu: null,
    debito_fiduciario: null,
    leilao_data: dates[0] ? dates[0].date : null,
    leilao_data_2: dates[1] ? dates[1].date : null,
    leilao_data_3: dates[2] ? dates[2].date : null,
    proposta_ate: null,
    horario_lote: dates[0] ? dates[0].time : '',
    modalidade: modality,
    status_label: modality === 'Judicial' ? 'Leilão Judicial' : 'Leilão Extrajudicial',
    status: 'active',
    updated_at: new Date().toISOString()
  };
}

async function fetchAll(opts) {
  opts = opts || {};
  const maxPages = opts.maxPages || parseInt(process.env.MAX_PAGES || '0', 10) || 0;
  const concurrency = opts.concurrency || CONCURRENCY;

  const first = await httpGet(LIST_URL);
  if (first.status !== 200) throw new Error(`Mega: status ${first.status}`);
  const totalPages = lastPage(first.body);
  const pages = maxPages ? Math.min(maxPages, totalPages) : totalPages;
  console.log(`[mega] ${totalPages} páginas${maxPages ? ` (limitado a ${pages})` : ''}`);

  const cards = [];
  const seen = new Set();

  for (let page = 1; page <= pages; page++) {
    let body = first.body;
    if (page > 1) {
      const r = await httpGet(`${LIST_URL}?pagina=${page}`);
      if (r.status !== 200) { console.log(`[mega] página ${page}: status ${r.status}, pulando`); continue; }
      body = r.body;
    }
    const pageCards = extractListCards(body);
    let added = 0;
    for (const c of pageCards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cards.push(c);
      added++;
    }
    console.log(`[mega] página ${page}: ${pageCards.length} cards (+${added}, total ${cards.length})`);
    if (!pageCards.length) break;
    if (page < pages) await sleep(250);
  }

  // Mantém apenas leilões judiciais/extrajudiciais
  const leiloes = cards.filter(c => /judicial|extrajudicial/i.test(c.modality) && !/realizado/i.test(c.status));
  console.log(`[mega] ${leiloes.length} lotes judiciais/extrajudiciais de ${cards.length} listados`);

  console.log(`[mega] buscando detalhes de ${leiloes.length} imóveis (concorrência ${concurrency})...`);
  const details = await pool(leiloes, concurrency, c => fetchDetail(c), (n, total) => {
    if (n % 20 === 0 || n === total) console.log(`[mega] detalhes ${n}/${total}`);
  });

  const mapped = leiloes.map((c, i) => mapProperty(c, details[i])).filter(p => p.title && p.listing_id);
  console.log(`[mega] ${mapped.length} imóveis mapeados`);
  return mapped;
}

module.exports = { name: 'megaleiloes', label: 'Mega Leilões', fetchAll };
