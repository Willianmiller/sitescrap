// ATENÇÃO: este arquivo é mantido apenas por compatibilidade.
//
// Antes ele era o scraper exclusivo do Spy Leilões e gravava
// api/rjleiloes-data.json sozinho — o que apagava os imóveis das outras fontes.
// Agora ele delega para o orquestrador multi-fonte (scraper/build.js).
//
// Uso normal: npm run scrape
// Só Spy:    node scraper/spy-scraper.js --only=spy

const { build } = require('./build');

build().catch(err => {
  console.error('[spy-scraper] erro fatal:', err);
  process.exit(1);
});
