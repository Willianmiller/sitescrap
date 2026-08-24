const https = require('https');
const fs = require('fs');
const path = require('path');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const VEHICLE_KEYWORDS = [
  'veículo', 'veiculos', 'veículo', 'carro', 'carros', 'motocicleta', 'motocicletas',
  'sucata', 'sucatas', 'automóvel', 'automovel', 'fiat', 'honda', 'toyota',
  'chevrolet', 'vw ', 'volkswagen', 'hyundai', 'renault', 'peugeot', 'citroen',
  'ford ', 'jeep ', 'nissan', 'mitsubishi', 'kia ', 'suzuki', 'berlingo',
  'saveiro', 'corsa', 'onix', 'hb20', 'mobi', 'pulse', 'fastback',
  'veic', 'moto ', 'motos', 'caminhão', 'caminhao', 'caminhonete',
  'lote de carro', 'lote de moto', 'recuperáveis', 'recuperaveis'
];

function isVehicle(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  return VEHICLE_KEYWORDS.some(kw => text.includes(kw));
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function extractListings(html) {
  const listings = [];
  const cardRegex = /<div class="card h-100\s+box-leilao">([\s\S]*?)(?=<div class="card h-100\s+box-leilao">|<div class="row mt-4")/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[1];

    const hrefMatch = block.match(/href="(https:\/\/www\.rjleiloes\.com\.br\/leilao\/(\d+)\/lotes)"/);
    const url = hrefMatch ? hrefMatch[1] : '';
    const id = hrefMatch ? hrefMatch[2] : '';

    const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
    const img = imgMatch ? imgMatch[1] : '';

    const titleMatch = block.match(/<h6 class="card-title[^"]*">([\s\S]*?)<\/h6>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const dateMatch = block.match(/<strong>Data:<\/strong>\s*([\s\S]*?)<\/p>/);
    const dateStr = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const lotTimeMatch = block.match(/<strong>Primeiro lote a partir das:<\/strong>\s*([\s\S]*?)<\/p>/);
    const lotTime = lotTimeMatch ? lotTimeMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const proposalMatch = block.match(/Envie sua proposta até:\s*([\s\S]*?)<\/p>/);
    const proposalDate = proposalMatch ? proposalMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    let descText = '';
    const descMatch = block.match(/<div class="card-text[\s\S]*?<\/div>/);
    if (descMatch) {
      descText = descMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const badges = [];
    const badgeRegex = /<span class="badge[^"]*">([\s\S]*?)<\/span>/g;
    let badgeMatch;
    while ((badgeMatch = badgeRegex.exec(block)) !== null) {
      badges.push(badgeMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    listings.push({
      id, url, img, title, dateStr, lotTime, proposalDate, descText, badges
    });
  }

  return listings;
}

async function scrape() {
  console.log('Scraping rjleiloes.com.br (imóveis)...');
  const { body: html } = await httpGet('https://www.rjleiloes.com.br/leiloes?categoria=Im%C3%B3veis');
  console.log(`HTML: ${html.length} bytes`);

  const all = extractListings(html);
  console.log(`Total cards found: ${all.length}`);

  const properties = all.filter(item => !isVehicle(item.title, item.descText));
  console.log(`After vehicle filter: ${properties.length}`);

  const mapped = properties.map(item => {
    const saleType = item.badges.find(b => /judicial/i.test(b)) ? 'judicial'
      : item.badges.find(b => /extrajudicial/i.test(b)) ? 'extrajudicial'
      : item.badges.find(b => /proposta/i.test(b)) ? 'proposta'
      : 'leilao';

    const status = item.badges.find(b => /em andamento/i.test(b)) ? 'Em Andamento'
      : item.badges.find(b => /em loteamento/i.test(b)) ? 'Em Loteamento'
      : item.badges.find(b => /proposta/i.test(b)) ? 'Proposta'
      : item.badges.find(b => /encerrad/i.test(b)) ? 'Encerrado'
      : 'Ativo';

    const cityMatch = item.title.match(/-?\s*([A-Z][A-Z\/]+(?:\/[A-Z]{2})?)\s*$/);
    let city = '', state = '';
    if (cityMatch) {
      const parts = cityMatch[1].split('/');
      city = parts[0] || '';
      state = parts[1] || '';
    }

    const auctionDate = item.dateStr ? parseDate(item.dateStr) : null;
    const proposalDeadline = item.proposalDate ? parseDate(item.proposalDate) : null;

    return {
      source: 'rjleiloes',
      source_id: `rjleiloes-${item.id}`,
      listing_id: item.id,
      title: item.title,
      description: item.descText.substring(0, 500),
      cidade: city,
      estado: state,
      url: item.url,
      img_url: item.img,
      leilao_tipo: saleType,
      leilao_data: auctionDate,
      proposta_ate: proposalDeadline,
      horario_lote: item.lotTime,
      status: status === 'Encerrado' ? 'inactive' : 'active',
      badges: item.badges,
      updated_at: new Date().toISOString()
    };
  });

  const outPath = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');
  fs.writeFileSync(outPath, JSON.stringify({ properties: mapped, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`Saved ${mapped.length} properties to ${outPath}`);

  return mapped;
}

scrape().catch(err => { console.error('Scraper error:', err); process.exit(1); });
