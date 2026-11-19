// Orquestrador multi-fonte: roda todos os scrapers, deduplica, aplica exclusões
// do painel e grava api/rjleiloes-data.json.

const fs = require('fs');
const path = require('path');
const { propertyKey, dedupeByProperty, dateRank } = require('./lib/property');

const OUT_PATH = path.join(__dirname, '..', 'api', 'rjleiloes-data.json');

const ALL_SOURCES = [
  require('./sources/spy'),
  require('./sources/mega')
];

function loadPrevious() {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    return {
      properties: prev.properties || [],
      deletedIds: new Set((prev.deletedIds || []).map(String)),
      deletedKeys: new Set(prev.deletedKeys || []),
      sources: prev.sources || {}
    };
  } catch (e) {
    return { properties: [], deletedIds: new Set(), deletedKeys: new Set(), sources: {} };
  }
}

function selectSources() {
  const arg = process.argv.find(a => a.startsWith('--only='));
  const only = arg ? arg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null;
  const env = process.env.SOURCES ? process.env.SOURCES.split(',').map(s => s.trim()).filter(Boolean) : null;
  const wanted = only || env;
  if (!wanted) return ALL_SOURCES;
  const aliases = { spy: 'spyleiloes', mega: 'megaleiloes' };
  const normalized = wanted.map(w => aliases[w] || w);
  return ALL_SOURCES.filter(s => normalized.includes(s.name));
}

async function runSource(source, previous, opts) {
  const started = Date.now();
  try {
    const properties = await source.fetchAll(opts);
    console.log(`[build] ${source.label}: ${properties.length} imóveis em ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { name: source.name, label: source.label, properties, status: 'ok', error: null };
  } catch (err) {
    console.error(`[build] FALHA em ${source.label}: ${err.message}`);
    // Mantém os dados da execução anterior para não derrubar a vitrine inteira
    const fallback = previous.properties.filter(p => p.source === source.name);
    console.error(`[build] ${source.label}: mantendo ${fallback.length} imóveis da execução anterior`);
    return { name: source.name, label: source.label, properties: fallback, status: fallback.length ? 'fallback' : 'error', error: err.message };
  }
}

function sortForDisplay(list) {
  const now = Date.now();
  const buckets = { future: [], unknown: [], past: [] };
  for (const p of list) {
    const t = dateRank(p.leilao_data);
    if (t === null) buckets.unknown.push(p);
    else if (t >= now - 24 * 60 * 60 * 1000) buckets.future.push(p);
    else buckets.past.push(p);
  }
  buckets.future.sort((a, b) => dateRank(a.leilao_data) - dateRank(b.leilao_data));
  buckets.past.sort((a, b) => dateRank(b.leilao_data) - dateRank(a.leilao_data));
  return buckets.future.concat(buckets.unknown, buckets.past);
}

async function build() {
  const previous = loadPrevious();
  const sources = selectSources();
  if (!sources.length) throw new Error('Nenhuma fonte selecionada');

  console.log(`[build] fontes: ${sources.map(s => s.name).join(', ')}`);
  console.log(`[build] execução anterior: ${previous.properties.length} imóveis | ${previous.deletedIds.size} ids e ${previous.deletedKeys.size} chaves excluídos`);

  const results = [];
  for (const source of sources) {
    results.push(await runSource(source, previous, {}));
  }

  const collected = results.flatMap(r => r.properties);
  console.log(`[build] coletados: ${collected.length}`);

  const deletedIds = previous.deletedIds;
  const deletedKeys = previous.deletedKeys;

  const notDeleted = collected.filter(p => !deletedIds.has(String(p.listing_id)) && !deletedKeys.has(propertyKey(p)));
  const excluded = collected.length - notDeleted.length;

  // Filtra imóveis fora de leilão (encerrados/realizados/ocultos ou com todas as datas passadas).
  // Mantém margem de 1 dia para não excluir imóveis que leiloam hoje.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now() - ONE_DAY_MS;
  function isAuctionEnded(p) {
    const st = String(p.status || '').toLowerCase();
    if (st === 'hidden' || st === 'realizado' || st === 'ended' || st === 'closed' || st === 'cancelado') return true;
    const dates = [p.leilao_data, p.leilao_data_2, p.leilao_data_3].filter(Boolean);
    if (!dates.length) return false;
    const parsed = dates.map(dateRank).filter(t => t !== null);
    if (!parsed.length) return false;
    return Math.max(...parsed) < now;
  }

  const available = notDeleted.filter(p => !isAuctionEnded(p));
  const excludedUnavailable = notDeleted.length - available.length;

  const deduped = dedupeByProperty(available);
  const duplicates = available.length - deduped.length;

  const sorted = sortForDisplay(deduped);

  const counts = {};
  for (const p of sorted) counts[p.source] = (counts[p.source] || 0) + 1;

  const sourceStatus = {};
  for (const r of results) sourceStatus[r.name] = r.status;

  const withDesc = sorted.filter(p => p.description).length;
  const withPhotos = sorted.filter(p => (p.photos || []).length > 1).length;
  const withMetragem = sorted.filter(p => p.metragem).length;

  const output = {
    properties: sorted,
    sources: counts,
    sourceStatus,
    deletedIds: [...deletedIds],
    deletedKeys: [...deletedKeys],
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  const mb = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`[build] gravado: ${sorted.length} imóveis (${mb} MB)`);
  console.log(`[build] fontes: ${JSON.stringify(counts)} | status: ${JSON.stringify(sourceStatus)}`);
  console.log(`[build] ${excluded} excluídos no painel, ${excludedUnavailable} encerrados/fora de leilão, ${duplicates} duplicados entre fontes`);
  console.log(`[build] com descrição: ${withDesc} | com galeria: ${withPhotos} | com metragem: ${withMetragem}`);
  console.log(`[build] arquivo: ${OUT_PATH}`);

  if (sorted.length === 0) process.exitCode = 1;
  return output;
}

if (require.main === module) {
  build().catch(err => { console.error('[build] erro fatal:', err); process.exit(1); });
}

module.exports = { build, loadPrevious, sortForDisplay };
