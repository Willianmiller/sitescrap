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

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function extractCityState(title, desc) {
  const text = title + ' ' + (desc || '');
  const m1 = text.match(/[-–]\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]+?)\s*[-–]\s*([A-Z]{2})\b/);
  if (m1) return { cidade: m1[1].trim(), estado: m1[2].trim() };
  const m2 = text.match(/\bEM\s+([A-Z][A-Z\s]+?)\/([A-Z]{2})\b/);
  if (m2) return { cidade: m2[1].trim(), estado: m2[2].trim() };
  const m3 = text.match(/\b([A-ZÀ-Ú][a-záàãâéêíóôõúçA-ZÀ-Ú\s]+?)\/([A-Z]{2})\b/);
  if (m3 && m3[1].trim().length < 30 && m3[1].trim().length > 2) {
    const city = m3[1].trim().replace(/\s+/g, ' ');
    if (!/LEILÃO|EDITAL|COMARCA|VARA/i.test(city)) return { cidade: city, estado: m3[2].trim() };
  }
  return { cidade: '', estado: '' };
}

function extractListings(html) {
  const listings = [];
  const parts = html.split('box-leilao');

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    const hrefMatch = block.match(/href="(https:\/\/www\.rjleiloes\.com\.br\/leilao\/(\d+)\/lotes)"/);
    const url = hrefMatch ? hrefMatch[1] : '';
    const id = hrefMatch ? hrefMatch[2] : '';
    if (!id) continue;

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
    const descMatch = block.match(/<div class="card-text mb-auto">([\s\S]*?)<\/div>\s*<\/div>/);
    if (descMatch) {
      descText = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const categoryMatch = block.match(/<div class="card-text">([A-Z\s]+)<\/div>/);
    const category = categoryMatch ? categoryMatch[1].trim() : '';

    const statusMatch = block.match(/label_leilao'>\s*([^<]+)/);
    const status = statusMatch ? statusMatch[1].trim() : '';

    const modalityMatch = block.match(/<h6 class="mb-1">([^<]+)<\/h6>/);
    const modality = modalityMatch ? modalityMatch[1].trim() : '';

    listings.push({
      id, url, img, title, dateStr, lotTime, proposalDate, descText,
      category, status, modality
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
    const saleType = /judicial/i.test(item.category) ? 'judicial'
      : /extrajudicial/i.test(item.category) ? 'extrajudicial'
      : /proposta/i.test(item.status) ? 'proposta'
      : /público|administrativo/i.test(item.category) ? 'administrativo'
      : 'leilao';

    const active = /encerrad/i.test(item.status) ? 'inactive' : 'active';
    const { cidade, estado } = extractCityState(item.title, item.descText);

    const auctionDate = item.dateStr ? parseDate(item.dateStr) : null;
    const proposalDeadline = item.proposalDate ? parseDate(item.proposalDate) : null;

    return {
      source: 'rjleiloes',
      source_id: `rjleiloes-${item.id}`,
      listing_id: item.id,
      title: item.title,
      description: item.descText.substring(0, 500),
      cidade: cidade,
      estado: estado,
      url: item.url,
      img_url: item.img,
      leilao_tipo: saleType,
      leilao_data: auctionDate,
      proposta_ate: proposalDeadline,
      horario_lote: item.lotTime,
      modalidade: item.modality,
      status_label: item.status,
      status: active,
      updated_at: new Date().toISOString()
    };
  });

  const outPath = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');
  fs.writeFileSync(outPath, JSON.stringify({ properties: mapped, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`Saved ${mapped.length} properties to ${outPath}`);
  return mapped;
}

scrape().catch(err => { console.error('Scraper error:', err); process.exit(1); });
