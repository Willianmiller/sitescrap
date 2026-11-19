const fs = require('fs');
const path = require('path');

// Mesma regra de identidade usada no scraper e no painel: matrícula ou título+endereço+data
function propertyKey(p) {
  if (p.matricula) return 'M|' + String(p.matricula).replace(/\s+/g, '').toLowerCase();
  return 'T|' + (p.title || '').toLowerCase().trim() + '|' + (p.endereco || '').toLowerCase().trim() + '|' + (p.leilao_data || '');
}

const n = (v, def) => {
  const x = parseInt(v, 10);
  return isNaN(x) ? def : x;
};

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

    const {
      state, city, type, status = 'active', source, id, q,
      limit = 200, offset = 0
    } = req.query;

    // Anúncios excluídos no painel nunca aparecem (mesmo com status=all)
    if (deletedIds.length || deletedKeys.length) {
      properties = properties.filter(p => !deletedIds.includes(String(p.listing_id)) && !deletedKeys.includes(propertyKey(p)));
    }

    if (status !== 'all') properties = properties.filter(p => p.status === status);
    if (state) properties = properties.filter(p => p.estado?.toUpperCase() === state.toUpperCase());
    if (city) properties = properties.filter(p => p.cidade?.toLowerCase().includes(city.toLowerCase()));
    if (source && source !== 'all') properties = properties.filter(p => p.source === source);
    if (id) properties = properties.filter(p => String(p.listing_id) === String(id));
    if (q) {
      const term = String(q).toLowerCase();
      properties = properties.filter(p =>
        [p.title, p.endereco, p.bairro, p.cidade, p.leiloeiro, p.matricula]
          .join(' ').toLowerCase().includes(term)
      );
    }
    if (type && type !== 'all') {
      if (type === 'judicial' || type === 'extrajudicial') {
        properties = properties.filter(p => p.leilao_tipo === type);
      }
    }

    const total = properties.length;
    const lim = Math.max(1, Math.min(n(limit, 200), 5000));
    const off = Math.max(0, n(offset, 0));
    properties = properties.slice(off, off + lim);

    return res.json({
      properties,
      count: total,
      limit: lim,
      offset: off,
      sources: data.sources || {},
      sourceStatus: data.sourceStatus || {},
      lastUpdate: data.updatedAt || null,
      deletedIds,
      deletedKeys
    });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
