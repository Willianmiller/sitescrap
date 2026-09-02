const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.rjleiloes.com.br';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(httpGet(next));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const VEHICLE_KEYWORDS = [
  'veículo', 'veiculos', 'carro', 'carros', 'motocicleta', 'motocicletas',
  'sucata', 'sucatas', 'automóvel', 'automovel', 'fiat', 'honda', 'toyota',
  'chevrolet', 'vw ', 'volkswagen', 'hyundai', 'renault', 'peugeot', 'citroen',
  'ford ', 'jeep ', 'nissan', 'mitsubishi', 'kia ', 'suzuki',
  'veic', 'moto ', 'motos', 'caminhão', 'caminhao', 'caminhonete',
  'lote de carro', 'lote de moto', 'recuperáveis', 'recuperaveis'
];

function isVehicle(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  return VEHICLE_KEYWORDS.some(kw => text.includes(kw));
}

function clean(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Converte "R$334.286,00" -> { texto: "R$ 334.286,00", valor: 334286 }
function parseMoney(str) {
  if (!str) return { texto: '', valor: null };
  const m = String(str).replace(/\s+/g, '').match(/R\$\s*([\d.,]+)/i);
  if (!m) return { texto: clean(str), valor: null };
  const raw = m[1];
  const num = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  return { texto: 'R$ ' + raw, valor: isNaN(num) ? null : num };
}

function fieldValue(block, label) {
  const re = new RegExp('<b>' + label + ':</b>\\s*', 'i');
  const idx = block.search(re);
  if (idx === -1) return '';
  const after = block.slice(idx + block.match(re)[0].length);
  const endMatch = after.match(/<br\s*\/?>|<b>/i);
  const chunk = endMatch ? after.slice(0, endMatch.index) : after;
  return clean(chunk);
}

function extractListings(html) {
  const listings = [];
  const cards = html.split('card shadow-sm').slice(1);

  for (const card of cards) {
    const hrefMatch = card.match(/href="([^"]*\/item\/(\d+)\/detalhes[^"]*)"/);
    const url = hrefMatch ? (hrefMatch[1].startsWith('http') ? hrefMatch[1] : BASE + hrefMatch[1]) : '';
    const id = hrefMatch ? hrefMatch[2] : '';
    if (!id) continue;

    const imgMatch = card.match(/background:\s*url\('([^']+)'\)/);
    const img = imgMatch ? imgMatch[1] : '';

    const titleMatch = card.match(/<h5>([\s\S]*?)<\/h5>/);
    const title = titleMatch ? clean(titleMatch[1]) : '';

    // Lance Inicial (bloco central)
    const lanceMatch = card.match(/<h5>Lance Inicial<\/h5>\s*<h4 class="mb-0">([^<]+)<\/h4>/);
    const lanceParcial = card.match(/Lance Inicial 2° Leilão:<\/b>\s*([^<]+)/);
    const lanceMin = parseMoney(lanceMatch ? lanceMatch[1] : (lanceParcial ? lanceParcial[1] : ''));
    const lanceSegundo = parseMoney(lanceParcial ? lanceParcial[1] : '');

    const statusMatch = card.match(/label_lote[^>]*>([^<]+)</);
    const status = statusMatch ? statusMatch[1].trim() : '';

    const cidadeRaw = fieldValue(card, 'Cidade');
    const endereco = fieldValue(card, 'Endereço');
    const processo = fieldValue(card, 'Processo');
    const vara = fieldValue(card, 'Vara');

    let state = '';
    let city = '';
    const cm = cidadeRaw.match(/^([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)*)\s*\/\s*([A-Z]{2})$/);
    if (cm) { city = cm[1].trim(); state = cm[2].toUpperCase(); }

    const descHTML = card.match(/<b>Descrição:?\s*<\/b>([\s\S]*?)<\/div>/i);
    const description = descHTML ? clean(descHTML[1]) : '';

    listings.push({
      id, url, img, title, status,
      cidade: city, estado: state, cidade_raw: cidadeRaw, endereco,
      lance_minimo: lanceMin.texto,
      lance_minimo_valor: lanceMin.valor,
      lance_segundo_leilao: lanceSegundo.texto,
      descricao: description,
      processo, vara
    });
  }

  return listings;
}

async function scrape() {
  console.log('Scraping rjleiloes.com.br (imóveis)...');
  const properties = [];
  const seen = new Set();

  // Pagina 1 a 5 de imóveis
  for (let page = 1; page <= 6; page++) {
    const u = `${BASE}/lotes/search?tipo=imovel&categoria_id=1&page=${page}`;
    const { status, body } = await httpGet(u);
    console.log(`page ${page}: status ${status}, ${body.length} bytes`);
    const found = extractListings(body);
    if (found.length === 0) break;
    let added = 0;
    for (const it of found) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      if (isVehicle(it.title, it.descricao)) continue;
      properties.push(it);
      added++;
    }
    console.log(`  +${added} novos (total ${properties.length})`);
    if (added === 0 || found.length < 15) break;
    await new Promise(r => setTimeout(r, 800));
  }

  const mapped = properties.map(item => {
    const tipo = /proposta/i.test(item.status) ? 'proposta'
      : /extrajudicial/i.test(item.status + ' ' + item.title) ? 'extrajudicial'
      : 'judicial';
    return {
      source: 'rjleiloes',
      source_id: `rjleiloes-${item.id}`,
      listing_id: item.id,
      title: item.title,
      description: item.descricao.substring(0, 500),
      cidade: item.cidade,
      estado: item.estado,
      url: item.url,
      img_url: item.img,
      lance_minimo: item.lance_minimo,
      lance_minimo_valor: item.lance_minimo_valor,
      lance_segundo_leilao: item.lance_segundo_leilao,
      endereco: item.endereco,
      leilao_tipo: tipo,
      leilao_data: null,
      proposta_ate: null,
      horario_lote: '',
      modalidade: 'Online',
      status_label: item.status,
      status: 'active',
      updated_at: new Date().toISOString()
    };
  });

  const outPath = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');
  fs.writeFileSync(outPath, JSON.stringify({ properties: mapped, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`Saved ${mapped.length} properties to ${outPath}`);
  return mapped;
}

scrape().catch(err => { console.error('Scraper error:', err); process.exit(1); });
