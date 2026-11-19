// Fonte: Spy Leilões (agregador de leiloeiros)
// Lista todo o estado do RJ, modalidades judicial e extrajudicial.

const { httpGet, pool } = require('../lib/http');
const { clean, parseMoney, titleCaseCity } = require('../lib/property');

const LIST_BASE = 'https://spyleiloes.com.br/imoveis-leilao/rj';
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || '12', 10);
const CONCURRENCY = Math.min(parseInt(process.env.SPY_CONCURRENCY || '8', 10), 12);
const MODALIDADES = ['judicial', 'extrajudicial'];

// ---- parsing da listagem ----

function extractPhoto(li) {
  const re = /<img[^>]*?src="([^"]*?)"/g;
  let m;
  const urls = [];
  while ((m = re.exec(li)) !== null) urls.push(m[1]);
  for (const u of urls) {
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
    if (/\/icons\//i.test(u) || /semFoto|logo|\.svg|arrow|heart|location/i.test(u)) continue;
    return u;
  }
  return '';
}

const isPhotoUrl = u => /\.(jpe?g|png|webp)(\?|$)/i.test(u || '') &&
  !/\/icons\//i.test(u || '') && !/semFoto|logo|\.svg|arrow|heart|location|anner/i.test(u || '');

function extractCards(html) {
  const items = [];
  const listMatch = html.match(/<ul[^>]*aria-label="Lista de imóveis em leilão"[^>]*>([\s\S]*?)<\/ul>/);
  if (!listMatch) {
    console.log('[spy] listar: container ul "Lista de imóveis em leilão" não encontrado');
    return items;
  }
  const content = listMatch[1];
  const lis = [...content.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  for (const li of lis) {
    const hrefMatch = li.match(/href="(\/leilao\/(\d+)\/[^"]+)"/);
    if (!hrefMatch) continue;
    const id = hrefMatch[2];
    const slug = hrefMatch[1];

    const imgMatch = li.match(/<img src="([^"]+)"/);
    const img = imgMatch ? imgMatch[1] : '';
    const typeMatch = li.match(/class="[^"]*styles_typeIcon[^"]*"[^>]*>([^<]*)<\/span>/);
    const tipo = typeMatch ? clean(typeMatch[1]) : '';
    const dateMatch = li.match(/Encerra em:\s*(\d{2}\/\d{2}\/\d{4})/);
    const data = dateMatch ? clean(dateMatch[1]) : null;
    const titleMatch = li.match(/<h2[^>]*>([^<]*)<\/h2>/);
    const title = titleMatch ? clean(titleMatch[1]) : '';
    const addrMatch = li.match(/<p[^>]*>([^<]*)<\/p>/);
    const endereco = addrMatch ? clean(addrMatch[1]) : '';

    if (!title && !id) continue;
    items.push({ id, slug, img, tipo, data, title, endereco });
  }
  return items;
}

function extractTotalPages(html) {
  const text = html.replace(/<!-- -->/g, ' ');
  const m = text.match(/Página\s*\d+\s*de\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ---- parsing da página de detalhe ----

function balancedArray(text, fromIdx) {
  let depth = 0, inStr = false, end = -1;
  for (let j = fromIdx; j < text.length; j++) {
    const c = text[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  return end === -1 ? null : text.slice(fromIdx, end);
}

// Extrai o objeto "auction" do payload RSC (footage, images, description, etc.)
function extractAuction(html) {
  const chunks = [];
  let pos = 0;
  while (pos < html.length) {
    const p = html.indexOf('self.__next_f.push(', pos);
    if (p === -1) break;
    const ob = html.indexOf('[', p);
    const at = balancedArray(html, ob);
    if (at) {
      try { JSON.parse(at).forEach(el => { if (typeof el === 'string') chunks.push(el); }); } catch (e) { }
    }
    pos = p + 21;
  }
  const rsc = chunks.join('');
  let idx = rsc.indexOf('avaliacaoAuctioneerValue');
  if (idx === -1) idx = rsc.indexOf('firstAuctionPrice');
  if (idx === -1) return null;
  const start = rsc.lastIndexOf('{', idx);
  let depth = 0, inStr = false, end = -1;
  for (let j = start; j < rsc.length; j++) {
    const c = rsc[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end === -1) return null;
  try { return JSON.parse(rsc.slice(start, end)); } catch (e) { return null; }
}

function extractListingDesc(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && obj['@type'] === 'RealEstateListing' && obj.description) return obj.description;
    } catch (e) { }
  }
  return '';
}

function isRscRef(s) {
  return typeof s === 'string' && s.length > 0 && s.length < 8 && /^\$[\w]+$/.test(s);
}

function formatDateDMY(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatMoney(n) {
  if (n === null || n === undefined || n === 0) return '';
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- normalização de cidade ----

function cityFromAddress(endereco) {
  const s = String(endereco || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/,\s*([^,]+?)\s*-\s*(?:RJ|Rio De Janeiro)\b/i);
  if (m) return titleCaseCity(m[1]);
  const noCep = s.split(/CEP/i)[0].replace(/,\s*$/, '').trim();
  const parts = noCep.split(' - ').map(x => x.trim()).filter(Boolean);
  return titleCaseCity(parts[parts.length - 1] || '') || 'Rio de Janeiro';
}

async function enrichDetail(item) {
  const url = 'https://spyleiloes.com.br' + item.slug;
  try {
    const r = await httpGet(url);
    if (r.status !== 200) return null;
    const auction = extractAuction(r.body) || {};
    const ldDesc = extractListingDesc(r.body);

    const desc = (auction.description && !isRscRef(auction.description) ? auction.description : '') || ldDesc || '';

    const photos = [];
    if (item.img && isPhotoUrl(item.img)) photos.push(item.img);
    const gallery = Array.isArray(auction.images)
      ? auction.images.map(i => i.imageUrl || i.src || '').filter(isPhotoUrl)
      : [];
    for (const p of gallery) {
      if (photos.length >= MAX_IMAGES) break;
      if (!photos.includes(p)) photos.push(p);
    }

    const endereco = clean(auction.address || item.endereco || '');
    return {
      auction,
      desc,
      photos,
      endereco,
      city: auction.city ? titleCaseCity(auction.city) : '',
      uf: (auction.state && auction.state.uf) || 'RJ',
      bairro: clean(auction.bairroAddress || ''),
      footage: auction.footage || null,
      bedrooms: auction.bedrooms || null,
      bathrooms: auction.bathrooms || null,
      parkingSpots: auction.parkingSpots || null,
      auctioneer: clean(auction.auctioneer || ''),
      matricula: auction.numeroMatricula || '',
      avaliacao: auction.avaliacaoAuctioneerValue || null,
      typeBem: auction.typeBem || '',
      tipo: (auction.type || '').toLowerCase(),
      lei1o: formatDateDMY(auction.firstAuction),
      lei2o: formatDateDMY(auction.secondAuction),
      lei3o: formatDateDMY(auction.thirdAuction),
      lance2: formatMoney(auction.secondAuctionPrice),
      aceitaFin: auction.aceitaFinanciamento,
      aceitaParc: auction.aceitaParcelamento,
      aceitaFgts: auction.aceitaFgts,
      dividasCondo: auction.dividasCondominio,
      dividasIptu: auction.dividasIptu,
      debitoFid: auction.debitoFiduciario
    };
  } catch (e) {
    return null;
  }
}

// ---- API da fonte ----

function mapProperty(item, detail, modalidade) {
  const d = detail || {};
  const tipo = d.tipo === 'judicial' || d.tipo === 'extrajudicial' ? d.tipo : modalidade;
  const photos = d.photos || (item.img ? [item.img] : []);
  return {
    source: 'spyleiloes',
    source_id: `spy-${item.id}`,
    listing_id: item.id,
    title: clean(d.auction && d.auction.title || item.title),
    description: (d.desc || '').slice(0, 4000),
    cidade: d.city || cityFromAddress(d.endereco || item.endereco),
    estado: d.uf || 'RJ',
    bairro: d.bairro || '',
    endereco: d.endereco || item.endereco,
    url: 'https://spyleiloes.com.br' + item.slug,
    img_url: item.img,
    photos,
    lance_minimo: item.lance ? item.lance.texto : '',
    lance_minimo_valor: item.lance ? item.lance.valor : null,
    lance_segundo_leilao: d.lance2 || '',
    leilao_tipo: tipo,
    tipo_imovel: d.typeBem || item.tipo || '',
    metragem: d.footage,
    quartos: d.bedrooms,
    banheiros: d.bathrooms,
    vagas: d.parkingSpots,
    leiloeiro: d.auctioneer || '',
    matricula: d.matricula || '',
    avaliacao: d.avaliacao,
    aceita_financiamento: d.aceitaFin,
    aceita_parcelamento: d.aceitaParc,
    aceita_fgts: d.aceitaFgts,
    dividas_condominio: d.dividasCondo,
    dividas_iptu: d.dividasIptu,
    debito_fiduciario: d.debitoFid,
    leilao_data: d.lei1o || null,
    leilao_data_2: d.lei2o || null,
    leilao_data_3: d.lei3o || null,
    proposta_ate: null,
    horario_lote: '',
    modalidade: tipo === 'judicial' ? 'Judicial' : 'Extrajudicial',
    status_label: tipo === 'judicial' ? 'Leilão Judicial' : 'Leilão Extrajudicial',
    status: 'active',
    updated_at: new Date().toISOString()
  };
}

async function fetchAll(opts) {
  opts = opts || {};
  const modalidades = opts.modalidades || MODALIDADES;
  const maxPages = opts.maxPages || parseInt(process.env.MAX_PAGES || '0', 10) || 0;
  const concurrency = opts.concurrency || CONCURRENCY;

  const collected = [];
  const seen = new Set();

  for (const modalidade of modalidades) {
    const first = await httpGet(`${LIST_BASE}?modalidade=${modalidade}&page=1`);
    if (first.status !== 200) throw new Error(`Spy ${modalidade}: status ${first.status}`);
    const totalPages = extractTotalPages(first.body) || 1;
    const pages = maxPages ? Math.min(maxPages, totalPages) : totalPages;
    console.log(`[spy] ${modalidade}: ${totalPages} páginas${maxPages ? ` (limitado a ${pages})` : ''}`);

    for (let page = 1; page <= pages; page++) {
      let body = first.body;
      if (page > 1) {
        const r = await httpGet(`${LIST_BASE}?modalidade=${modalidade}&page=${page}`);
        if (r.status !== 200) { console.log(`[spy] ${modalidade} página ${page}: status ${r.status}, pulando`); continue; }
        body = r.body;
      }
      const cards = extractCards(body);
      let added = 0;
      for (const c of cards) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        collected.push({ ...c, modalidade });
        added++;
      }
      console.log(`[spy] ${modalidade} página ${page}: ${cards.length} cards (+${added}, total ${collected.length})`);
      if (cards.length === 0) break;
      if (page < pages) await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log(`[spy] buscando detalhes de ${collected.length} imóveis (concorrência ${concurrency})...`);
  let done = 0;
  const details = await pool(collected, concurrency, item => enrichDetail(item), (n, total) => {
    done = n;
    if (n % 50 === 0 || n === total) console.log(`[spy] detalhes ${n}/${total}`);
  });

  const mapped = collected
    .map((item, i) => mapProperty(item, details[i], item.modalidade))
    .filter(p => p.title && p.listing_id);

  console.log(`[spy] ${mapped.length} imóveis mapeados`);
  return mapped;
}

module.exports = { name: 'spyleiloes', label: 'Spy Leilões', fetchAll };
