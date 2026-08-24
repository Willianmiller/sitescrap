const https = require('https');
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {headers:{'User-Agent':'Mozilla/5.0'}}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      let data=''; res.on('data', c => data+=c); res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}
(async () => {
  const html = await httpGet('https://www.rjleiloes.com.br/leiloes?categoria=Im%C3%B3veis');
  // Find card-text elements after the hr
  const cardTextMatches = html.match(/<div class="card-text">[^<]+<\/div>/g);
  console.log('card-text matches:', cardTextMatches ? cardTextMatches.slice(0, 10) : 'none');

  // Find label_leilao
  const labelMatches = html.match(/label_leilao[^"']*["'][^>]*>[^<]+/g);
  console.log('label_leilao:', labelMatches ? labelMatches.slice(0, 5) : 'none');

  // Find all h6.mb-1
  const h6Matches = html.match(/<h6 class="mb-1">[^<]+<\/h6>/g);
  console.log('h6.mb-1:', h6Matches ? h6Matches.slice(0, 10) : 'none');

  // Find ativo/inativo labels
  const ativoMatches = html.match(/(ativo|inativo)[^"']*["'][^>]*>[^<]+/g);
  console.log('ativo:', ativoMatches ? ativoMatches.slice(0, 5) : 'none');

  // Look at the complete structure of one card
  const firstCard = html.indexOf('box-leilao');
  const secondCard = html.indexOf('box-leilao', firstCard + 1);
  console.log('\n--- FULL CARD ---');
  console.log(html.substring(firstCard - 50, secondCard > 0 ? secondCard - 50 : firstCard + 2000));
})();
