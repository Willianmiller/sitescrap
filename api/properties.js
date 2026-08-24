const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const dataPath = path.join(__dirname, 'rjleiloes-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    let properties = data.properties || [];

    const { state, city, type, status = 'active', limit = 200, offset = 0 } = req.query;

    if (status !== 'all') properties = properties.filter(p => p.status === status);
    if (state) properties = properties.filter(p => p.estado?.toUpperCase() === state.toUpperCase());
    if (city) properties = properties.filter(p => p.cidade?.toLowerCase().includes(city.toLowerCase()));
    if (type && type !== 'all') {
      if (type === 'judicial' || type === 'extrajudicial') {
        properties = properties.filter(p => p.leilao_tipo === type);
      }
    }

    const total = properties.length;
    properties = properties.slice(Number(offset), Number(offset) + Number(limit));

    return res.json({
      properties,
      count: total,
      limit: Number(limit),
      offset: Number(offset),
      lastUpdate: data.updatedAt || null
    });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
