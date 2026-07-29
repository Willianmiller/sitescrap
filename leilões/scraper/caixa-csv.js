const https = require('https');
const http = require('http');
const { upsertProperties } = require('./supabase');

const CSV_URL = 'https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_RJ.csv';

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (char === '\r' && !inQuotes) {
    } else {
      current += char;
    }
  }
  if (current) lines.push(current);

  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map(v => v.trim());
    if (values.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    results.push(obj);
  }
  return results;
}

function mapToProperty(row) {
  const marketStr = (row['valor de avaliacao'] || row['valor de avaliação'] || '0').replace(/[^\d,]/g, '').replace(',', '.');
  const auctionStr = (row['valor minimo de venda'] || row['valor mínimo de venda'] || row['preco de venda'] || '0').replace(/[^\d,]/g, '').replace(',', '.');
  const market = parseFloat(marketStr) || 0;
  const auction = parseFloat(auctionStr) || 0;
  const discount = market > 0 ? Math.round((1 - auction / market) * 100) : 0;
  const cidadeRaw = row['municipio'] || row['cidade'] || '';
  const tipo = row['tipo de imovel'] || row['tipo'] || '';
  const index = row['sequencial do imovel'] || row['sequencial'] || Date.now().toString();
  const link = row['link de detalhamento'] || row['link'] || '';

  return {
    source: 'caixa',
    source_id: `caixa-${index}`,
    title: `Imóvel Caixa em ${cidadeRaw} - ${tipo}`,
    city: cidadeRaw,
    state: 'RJ',
    property_type: mapPropertyType(tipo),
    sale_type: 'venda_direta',
    market_value: market,
    auction_value: auction,
    discount_pct: discount,
    bedrooms: parseInt(row['qt quartos'] || row['quartos'] || '0') || null,
    area: row['area privativa'] || row['area'] || '',
    address: `${row['logradouro'] || ''}, ${row['bairro'] || ''}`.trim().replace(/^,\s*/, ''),
    image_url: row['url da foto'] || row['foto'] || '',
    details_url: link,
    badge: 'Caixa',
    status: 'active',
    auction_date: row['data do leilao'] || row['data leilão'] || null
  };
}

function mapPropertyType(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('apartamento')) return 'Apartamento';
  if (t.includes('casa')) return 'Casa';
  if (t.includes('terreno') || t.includes('lote')) return 'Terreno';
  if (t.includes('comercial') || t.includes('sala') || t.includes('loja')) return 'Comercial';
  if (t.includes('rural') || t.includes('fazenda') || t.includes('sitio') || t.includes('sítio') || t.includes('chácara') || t.includes('chacara')) return 'Rural';
  if (t.includes('garagem') || t.includes('vaga')) return 'Garagem';
  if (t.includes('galpao') || t.includes('galpão') || t.includes('deposito') || t.includes('depósito')) return 'Galpão';
  return 'Outros';
}

async function scrape() {
  console.log('Baixando CSV da Caixa (RJ)...');
  const csvText = await fetchCSV(CSV_URL);
  const rows = parseCSV(csvText);
  console.log(`${rows.length} linhas encontradas no CSV`);

  const properties = rows.map(mapToProperty).filter(p => p.auction_value > 0);
  console.log(`${properties.length} imóveis válidos (com valor de venda)`);

  await upsertProperties(properties);
  console.log('Scrape Caixa concluído!');
}

scrape().catch(err => {
  console.error('Erro no scraper Caixa:', err);
  process.exit(1);
});
