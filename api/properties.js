const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');

const APIFY_TOKEN = process.env.APIFY_TOKEN;

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`;
  return str;
}

function mapProperty(item) {
  return {
    source: 'leilaoimovel',
    source_id: `leilaoimovel-${item.listing?.listing_id || item.record_id}`,
    cidade: item.location?.city?.replace('Leilão no ', '') || '',
    estado: item.location?.state || 'RJ',
    endereco: item.location?.full_address || '',
    property_type: item.property?.property_type || null,
    sale_type: 'judicial',
    valor_avaliacao: item.pricing?.appraisal_price || null,
    valor_lance_inicial: item.pricing?.price || 0,
    descontos_pct: item.pricing?.discount_percent ? `${item.pricing.discount_percent}%` : null,
    leilao_tipo: item.listing?.categories?.[0] || 'Judicial',
    img_urls: (item.media?.main_image_url && !item.media.main_image_url.includes('sem-foto'))
      ? [item.media.main_image_url] : null,
    url: item.entity?.url || '',
    description: item.entity?.title || '',
    status: 'active',
    leilao_data: parseDate(item.listing?.auction?.closing_date),
    updated_at: new Date().toISOString()
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!APIFY_TOKEN) {
    return res.status(500).json({ error: 'APIFY_TOKEN não configurado' });
  }

  try {
    const client = new ApifyClient({ token: APIFY_TOKEN });

    let datasetId;
    try {
      const configPath = path.join(__dirname, 'dataset-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      datasetId = config.datasetId;
    } catch (e) {
      return res.status(500).json({ error: 'dataset-config.json não encontrado' });
    }

    if (!datasetId) {
      return res.json({ properties: [], count: 0, lastUpdate: null });
    }

    const { items: rawItems } = await client.dataset(datasetId).listItems({ clean: true });

    let properties = rawItems.map(mapProperty).filter(p => p.valor_lance_inicial > 0);

    const {
      state,
      city,
      type,
      status = 'active',
      limit = 200,
      offset = 0,
      latest
    } = req.query;

    if (latest) {
      const sorted = [...properties].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return res.json({ lastUpdate: sorted[0]?.updated_at || null });
    }

    if (status !== 'all') properties = properties.filter(p => p.status === status);
    if (state) properties = properties.filter(p => p.estado?.toUpperCase() === state.toUpperCase());
    if (city) properties = properties.filter(p => p.cidade?.toLowerCase().includes(city.toLowerCase()));
    if (type && type !== 'all') {
      if (type === 'judicial' || type === 'extrajudicial') {
        properties = properties.filter(p => p.sale_type === type);
      } else {
        properties = properties.filter(p => p.property_type?.toLowerCase().includes(type.toLowerCase()));
      }
    }

    const total = properties.length;
    properties = properties.slice(Number(offset), Number(offset) + Number(limit));

    return res.json({
      properties,
      count: total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
