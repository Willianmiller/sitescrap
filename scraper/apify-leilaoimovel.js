const { ApifyClient } = require('apify-client');
const { upsertProperties } = require('./supabase');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS || '200', 10);

if (!APIFY_TOKEN) {
  console.error('APIFY_TOKEN é obrigatório');
  process.exit(1);
}

async function scrape() {
  console.log(`Iniciando Apify scraper (max: ${MAX_ITEMS} imóveis)...`);

  const client = new ApifyClient({ token: APIFY_TOKEN });

  const input = {
    location_state: 'RJ',
    sale_modality: ['Judicial Auction'],
    limit: MAX_ITEMS,
    enrich_data: false
  };

  console.log('Chamando Ator leilaoimovel-scraper...');
  const run = await client.actor('fatihtahta/leilao-imovel-scraper').call(input, { waitSecs: 45 });

  if (run.status !== 'SUCCEEDED') {
    throw new Error(`Ator falhou: ${run.status}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`${items.length} imóveis retornados pelo Ator`);

  function parseDate(str) {
    if (!str) return null;
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`;
    return str;
  }

  const properties = items.map(item => ({
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
    leilao_tipo: 'Judicial',
    img_urls: (item.media?.main_image_url && !item.media.main_image_url.includes('sem-foto'))
      ? [item.media.main_image_url] : null,
    url: item.entity?.url || '',
    description: item.entity?.title || '',
    status: 'active',
    leilao_data: parseDate(item.listing?.auction?.closing_date)
  })).filter(p => p.valor_lance_inicial > 0 && p.img_urls);

  console.log(`${properties.length} imóveis mapeados para inserir`);
  await upsertProperties(properties);
  console.log('Apify scraper concluído!');
}

scrape().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});