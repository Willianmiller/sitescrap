const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function upsertProperties(properties) {
  if (properties.length === 0) return;
  const { data, error } = await supabase
    .from('properties')
    .upsert(properties, {
      onConflict: 'source,source_id',
      ignoreDuplicates: false
    });
  if (error) {
    console.error('Erro ao inserir no Supabase:', error.message);
    return;
  }
  console.log(`${properties.length} imóveis inseridos/atualizados`);
}

async function getExistingSourceIds(source) {
  const { data, error } = await supabase
    .from('properties')
    .select('source_id')
    .eq('source', source);
  if (error) {
    console.error('Erro ao buscar IDs existentes:', error.message);
    return new Set();
  }
  return new Set(data.map(d => d.source_id));
}

module.exports = { supabase, upsertProperties, getExistingSourceIds };
