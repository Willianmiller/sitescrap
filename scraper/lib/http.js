const https = require('https');
const http = require('http');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function httpGet(url, options) {
  options = options || {};
  const redirects = options.redirects || 0;
  const timeout = options.timeout || 30000;
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, {
      headers: Object.assign({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }, options.headers || {})
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(httpGet(next, { redirects: redirects + 1, timeout, headers: options.headers }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        finalUrl: res.url || url,
        headers: res.headers
      }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout: ' + url)); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Roda fn sobre items com no máximo `concurrency` em paralelo, preservando a ordem.
async function pool(items, concurrency, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        results[i] = null;
        console.error(`  [pool] erro no item ${i} (${items[i] && items[i].url ? items[i].url : ''}): ${e.message}`);
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  const workers = [];
  for (let w = 0; w < Math.max(1, concurrency); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

module.exports = { UA, httpGet, sleep, pool };
