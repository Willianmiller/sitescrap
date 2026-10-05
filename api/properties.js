const fs = require('fs');
const path = require('path');

// Mesma regra de identidade usada no scraper e no painel: matrícula ou título+endereço+data
function propertyKey(p) {
  if (p.matricula) return 'M|' + String(p.matricula).replace(/\s+/g, '').toLowerCase();
  return 'T|' + (p.title || '').toLowerCase().trim() + '|' + (p.endereco || '').toLowerCase().trim() + '|' + (p.leilao_data || '');
}

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
    const deletedIds = (data.deletedIds || []).map(String);
    const deletedKeys = data.deletedKeys || [];

    const { state, city, type, status = 'active', limit = 200, offset = 0 } = req.query;

    // Anúncios excluídos no painel nunca aparecem (mesmo com status=all)
    if (deletedIds.length || deletedKeys.length) {
      properties = properties.filter(p => !deletedIds.includes(String(p.listing_id)) && !deletedKeys.includes(propertyKey(p)));
    }

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
      lastUpdate: data.updatedAt || null,
      deletedIds,
      deletedKeys
    });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
