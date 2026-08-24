const { ApifyClient } = require('apify-client');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'fatihtahta/leilao-imovel-scraper';

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

    const { items: runsList } = await client.actor(ACTOR_ID).lastRuns({ limit: 5 });
    const successfulRun = (runsList || []).find(r => r.status === 'SUCCEEDED');
    if (!successfulRun) {
      return res.json({ properties: [], count: 0, lastUpdate: null });
    }

    const datasetId = successfulRun.defaultDatasetId;
    const { items } = await client.dataset(datasetId).listItems({ clean: true });

    let properties = items;

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
