const https = require('https');
const fs = require('fs');
const path = require('path');

const LIST_BASE = 'https://spyleiloes.com.br/imoveis-leilao/rj/rio-de-janeiro';
const MODALIDADE = 'judicial';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('timeout')); });
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

function extractCards(html) {
  const items = [];
  const lis = html.split('<li class="BroadSearch_auctionItem').slice(1);
  for (const li of lis) {
    const hrefMatch = li.match(/href="(\/leilao\/(\d+)\/[^"]+)"/);
    if (!hrefMatch) continue;
    const id = hrefMatch[2];
    const slug = hrefMatch[1];

    // imagem real do imóvel (qualquer domínio; ignora ícones/logos/semFoto/pdf)
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

// Retorna true se o imóvel está no município do Rio de Janeiro
function isRioMunicipio(item) {
  const text = ((item.title || '') + ' ' + (item.endereco || '') + ' ' + (item.cidade || '')).toLowerCase();
  if (!text.includes('rio de janeiro') && !/rj/i.test(text)) return false;
  for (const c of OTHER_RJ_CITIES) {
    if (text.includes(c)) return false;
  }
  return true;
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
    await new Promise(r => setTimeout(r, 400));
  }

  const mapped = properties.map(item => ({
    source: 'spyleiloes',
    source_id: `spy-${item.id}`,
    listing_id: item.id,
    title: item.title,
    description: '',
    cidade: extractCity(item.endereco),
    estado: 'RJ',
    url: 'https://spyleiloes.com.br' + item.slug,
    img_url: item.img,
    lance_minimo: item.lance.texto,
    lance_minimo_valor: item.lance.valor,
    lance_segundo_leilao: '',
    endereco: item.endereco,
    leilao_tipo: 'judicial',
    leilao_data: null,
    proposta_ate: null,
    horario_lote: '',
    modalidade: 'Judicial',
    status_label: 'Leilão Judicial',
    status: 'active',
    updated_at: new Date().toISOString()
  })).filter(p => p.title);

  const outPath = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');
  const filtered = mapped.filter(isRioMunicipio);
  fs.writeFileSync(outPath, JSON.stringify({ properties: filtered, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`Saved ${filtered.length} properties (de ${mapped.length}) to ${outPath}`);
  return filtered;
}

scrape().catch(err => { console.error('Scraper error:', err); process.exit(1); });
