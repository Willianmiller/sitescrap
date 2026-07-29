const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE — admin apenas
  if (req.method === 'DELETE') {
    const token = req.headers.authorization;
    if (!token || token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const {
      state = 'RJ',
      city,
      type,
      source,
      status = 'active',
      limit = 50,
      offset = 0,
      latest
    } = req.query;

    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (status !== 'all') query = query.eq('status', status);

    if (state) query = query.eq('estado', state.toUpperCase());
    if (city) query = query.ilike('cidade', `%${city}%`);
    if (type && type !== 'all') {
      if (type === 'judicial' || type === 'extrajudicial') {
        query = query.eq('sale_type', type);
      } else {
        query = query.ilike('property_type', `%${type}%`);
      }
    }
    if (source) query = query.eq('source', source);

    if (latest) {
      const { data, error } = await supabase
        .from('properties')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return res.json({ lastUpdate: data[0]?.updated_at || null });
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      properties: data || [],
      count: count || 0,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
