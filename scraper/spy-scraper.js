const https = require('https');
const fs = require('fs');
const path = require('path');

const LIST_BASE = 'https://spyleiloes.com.br/imoveis-leilao/rj/rio-de-janeiro';
const MODALIDADE = 'judicial';
const MAX_IMAGES = 15;
const CONCURRENCY = Math.min(parseInt(process.env.CONCURRENCY || '6', 10), 12);

function httpGet(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(httpGet(next, redirects + 1));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, finalUrl: res.url || url }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function clean(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// "R$ 55.100,00" ou "R$ 55.100" -> { texto: "R$ 55.100,00", valor: 55100 }
function parseMoney(str) {
  if (!str) return { texto: '', valor: null };
  const m = String(str).replace(/\s+/g, '').match(/R\$\s*([\d.,]+)/i);
  if (!m) return { texto: clean(str), valor: null };
  const raw = m[1];
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let numStr = raw.replace(/\./g, '');
  if (hasComma) numStr = numStr.replace(',', '.');
  else if (!hasDot && hasComma) numStr = raw.replace(',', '.');
  const num = parseFloat(numStr);
  return { texto: 'R$ ' + raw, valor: isNaN(num) ? null : num };
}

// Retorna a primeira URL de foto real (jpg/jpeg/png/webp) de qualquer domínio.
// Ignora ícones de UI, logos, placeholders de "sem foto" e arquivos .pdf.
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

const isPhotoUrl = u => /\.(jpe?g|png|webp)(\?|$)/i.test(u || '') && !/\/icons\//i.test(u || '') && !/semFoto|logo|\.svg|arrow|heart|location|anner/i.test(u || '');

function extractCards(html) {
  const items = [];
  const lis = html.split('<li class="BroadSearch_auctionItem').slice(1);
  for (const li of lis) {
    const hrefMatch = li.match(/href="(\/leilao\/(\d+)\/[^"]+)"/);
    if (!hrefMatch) continue;
    const id = hrefMatch[2];
    const slug = hrefMatch[1];

    const img = extractPhoto(li);

    const lanceMatch = li.match(/<span class="styles_h4LanceInicial[^"]*">([^<]*)<\/span>/);
    const lance = parseMoney(lanceMatch ? lanceMatch[1] : '');

    const titleMatch = li.match(/<h2 class="styles_h5[^"]*">([^<]*)<\/h2>/);
    const title = titleMatch ? clean(titleMatch[1]) : '';

    const addrMatch = li.match(/<p class="styles_adress[^"]*">([^<]*)<\/p>/);
    let endereco = addrMatch ? clean(addrMatch[1]) : '';

    const typeMatch = li.match(/styles_typeIcon[\s\S]*?<span>([^<]*)<\/span>/);
    const tipo = typeMatch ? clean(typeMatch[1]) : '';

    if (!title && !id) continue;
    items.push({ id, slug, img, lance, title, endereco, tipo });
  }
  return items;
}

function extractTotalPages(html) {
  const text = html.replace(/<!-- -->/g, ' ');
  const m = text.match(/Página\s*\d+\s*de\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractCity(endereco) {
  if (endereco && /rio de janeiro/i.test(endereco)) return 'Rio de Janeiro';
  const noCep = (endereco || '').split(/CEP/i)[0];
  const parts = noCep.split(' - ');
  const last = (parts[parts.length - 1] || '').trim().replace(/\/RJ$/i, '').replace(/,$/, '').trim();
  return last || 'Rio de Janeiro';
}

// Cidades do RJ que NÃO são o município do Rio de Janeiro (para descartar)
const OTHER_RJ_CITIES = [
  'niterói', 'niteroi', 'são gonçalo', 'sao goncalo', 'duque de caxias',
  'nova iguaçu', 'nova iguacu', 'belford roxo', 'petrópolis', 'petropolis',
  'campos dos goytacazes', 'campos dos g', 'volta redonda', 'teresópolis',
  'teresopolis', 'magé', 'mage', 'maricá', 'marica', 'itaboraí', 'itaborai',
  'paracambi', 'japeri', 'queimados', 'nilópolis', 'nilopolis', 'mesquita',
  'são joão de meriti', 'sao joao de meriti', 'angra dos reis', 'arraial',
  'cabo frio', 'macae', 'macaé', 'rio das ostras', 'saquarema', 'guapimirim',
  'cachoeiras de macacu', 'tanguá', 'tangua', 'silva jardim', 'ape', 'ape',
  'são pedro da aldeia', 'sao pedro da aldeia', 'araruama', 'itatiaia', 'resende', 'barra mansa'
];

function isRioMunicipio(item) {
  const text = ((item.title || '') + ' ' + (item.endereco || '') + ' ' + (item.cidade || '')).toLowerCase();
  if (!text.includes('rio de janeiro') && !/rj/i.test(text)) return false;
  for (const c of OTHER_RJ_CITIES) {
    if (text.includes(c)) return false;
  }
  return true;
}

// ---- Início: parsing da página de detalhe ----

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

// Extrai o objeto "auction" do payload RSC (contém footage, images, description, etc.)
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

// Extrai a descrição do bloco schema.org RealEstateListing (sempre presente no HTML renderizado)
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

function enrichDetail(item) {
  const url = 'https://spyleiloes.com.br' + item.slug;
  return httpGet(url).then(r => {
    if (r.status !== 200) return null;
    const auction = extractAuction(r.body) || {};
    const ldDesc = extractListingDesc(r.body);

    const desc = (auction.description && !isRscRef(auction.description) ? auction.description : '') || ldDesc || '';

    const photos = [];
    if (item.img && isPhotoUrl(item.img)) photos.push(item.img);
    const gallery = Array.isArray(auction.images) ? auction.images.map(i => i.imageUrl || i.src || '').filter(isPhotoUrl) : [];
    for (const p of gallery) {
      if (photos.length >= MAX_IMAGES) break;
      if (!photos.includes(p)) photos.push(p);
    }

    const endereco = (auction.address || item.endereco || '').replace(/\s+/g, ' ').trim();

    return {
      id: item.id,
      slug: item.slug,
      title: auction.title || item.title,
      endereco,
      desc,
      photos,
      footage: auction.footage || null,
      bedrooms: auction.bedrooms || null,
      bathrooms: auction.bathrooms || null,
      parkingSpots: auction.parkingSpots || null,
      auctioneer: auction.auctioneer || '',
      numeroMatricula: auction.numeroMatricula || '',
      avaliacao: auction.avaliacaoAuctioneerValue || null,
      typeBem: auction.typeBem || '',
      bairro: auction.bairroAddress || '',
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
  }).catch(() => null);
}

async function runDetailPool(items) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const d = await enrichDetail(item);
      results[i] = d;
      if ((i + 1) % 25 === 0) console.log(`  detalhes: ${i + 1}/${items.length}`);
    }
  }
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ---- Fim: parsing da página de detalhe ----

// Chave de identidade do imóvel: matrícula quando existir; fallback título+endereço+data
function propertyKey(p) {
  if (p.matricula) return 'M|' + String(p.matricula).replace(/\s+/g, '').toLowerCase();
  return 'T|' + (p.title || '').toLowerCase().trim() + '|' + (p.endereco || '').toLowerCase().trim() + '|' + (p.leilao_data || '');
}

function dateRank(dmy) {
  const m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

// Mantém apenas um anúncio por imóvel. Prioridade: galeria (>=2 fotos) > nº de fotos > data mais próxima > maior avaliação > menor id.
function dedupeByProperty(arr) {
  const best = {};
  for (const p of arr) {
    const k = propertyKey(p);
    const cur = best[k];
    if (!cur) { best[k] = p; continue; }
    const rank = x => [
      (x.photos || []).length >= 2 ? 1 : 0,
      (x.photos || []).length,
      dateRank(x.leilao_data) ?? Number.MAX_SAFE_INTEGER,
      x.avaliacao || -1,
      -parseInt(x.listing_id, 10) || 0
    ];
    const a = rank(p), b = rank(cur);
    let win = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { win = a[i] > b[i]; break; }
    }
    if (win) best[k] = p;
  }
  return Object.values(best);
}

async function scrape() {
  console.log(`Scraping Spy Leilões — ${MODALIDADE} / RJ`);
  const first = await httpGet(`${LIST_BASE}?modalidade=${MODALIDADE}&page=1`);
  if (first.status !== 200) throw new Error('Página inicial retornou status ' + first.status);
  const totalPages = extractTotalPages(first.body) || 1;
  console.log('Total de páginas:', totalPages);

  const seen = new Set();
  const properties = [];
  const pagesToScrape = process.env.MAX_PAGES ? Math.min(parseInt(process.env.MAX_PAGES, 10), totalPages) : totalPages;

  for (let page = 1; page <= pagesToScrape; page++) {
    let body = first.body;
    if (page > 1) {
      const r = await httpGet(`${LIST_BASE}?modalidade=${MODALIDADE}&page=${page}`);
      if (r.status !== 200) { console.log(`page ${page}: status ${r.status}, pular`); continue; }
      body = r.body;
    }
    const cards = extractCards(body);
    console.log(`page ${page}: ${cards.length} cards`);
    let added = 0;
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      properties.push(c);
      added++;
    }
    console.log(`  +${added} novos (total ${properties.length})`);
    if (cards.length === 0) break;
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Buscando detalhes de ${properties.length} imóveis...`);
  const details = await runDetailPool(properties);

  const mapped = properties.map((item, i) => {
    const d = details[i] || {};
    const photos = d.photos || (item.img ? [item.img] : []);
    return {
      source: 'spyleiloes',
      source_id: `spy-${item.id}`,
      listing_id: item.id,
      title: d.title || item.title,
      description: d.desc || '',
      cidade: extractCity(d.endereco || item.endereco),
      estado: 'RJ',
      bairro: d.bairro || '',
      endereco: d.endereco || item.endereco,
      url: 'https://spyleiloes.com.br' + item.slug,
      img_url: item.img,
      photos: photos,
      lance_minimo: item.lance.texto,
      lance_minimo_valor: item.lance.valor,
      lance_segundo_leilao: d.lance2 || '',
      leilao_tipo: 'judicial',
      tipo_imovel: d.typeBem || '',
      metragem: d.footage,
      quartos: d.bedrooms,
      banheiros: d.bathrooms,
      vagas: d.parkingSpots,
      leiloeiro: d.auctioneer || '',
      matricula: d.numeroMatricula || '',
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
      modalidade: 'Judicial',
      status_label: 'Leilão Judicial',
      status: 'active',
      updated_at: new Date().toISOString()
    };
  }).filter(p => p.title);

  const outPath = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');
  const filtered = mapped.filter(isRioMunicipio);
  const deduped = dedupeByProperty(filtered);
  const withDesc = deduped.filter(p => p.description).length;
  const withPhotos = deduped.filter(p => (p.photos || []).length > 1).length;
  const withMetragem = deduped.filter(p => p.metragem).length;
  console.log(`Saved ${deduped.length} properties (de ${mapped.length} coletados, ${filtered.length} após filtro RJ, ${filtered.length - deduped.length} duplicados)`);
  console.log(`  com descrição: ${withDesc} | com galeria: ${withPhotos} | com metragem: ${withMetragem}`);
  fs.writeFileSync(outPath, JSON.stringify({ properties: deduped, updatedAt: new Date().toISOString() }, null, 2));
  console.log('Arquivo:', outPath);
  return deduped;
}

scrape().catch(err => { console.error('Scraper error:', err); process.exit(1); });