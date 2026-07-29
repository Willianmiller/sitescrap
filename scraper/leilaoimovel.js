const { chromium } = require('playwright');
const { upsertProperties } = require('./supabase');

const BASE_URL = 'https://www.leilaoimovel.com.br';
const SEARCH_URL = `${BASE_URL}/encontre-seu-imovel?ordem=dt_insert_d`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function extractCityFromUrl(url) {
  const parts = url.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'imovel' && i + 1 < parts.length) {
      const city = parts[i + 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return city;
    }
  }
  return '';
}

function extractStateFromUrl(url) {
  const parts = url.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'imovel' && i + 1 < parts.length) {
      return (parts[i + 2] || '').toUpperCase();
    }
  }
  return 'RJ';
}

async function scrape() {
  console.log('Iniciando Playwright scraper...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    geolocation: { latitude: -22.9068, longitude: -43.1729 },
    permissions: ['geolocation']
  });

  const page = await context.newPage();

  try {
    console.log('Acessando página de busca...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);

    const currentUrl = page.url();
    console.log('URL atual:', currentUrl);

    await sleep(2000);

    let allProperties = [];
    let maxPages = 5;
    let currentPage = 0;
    let hasNextPage = true;

    while (hasNextPage && currentPage < maxPages) {
      currentPage++;
      console.log(`Processando página ${currentPage}...`);

      await page.waitForSelector('a[href*="/imovel/"]', { timeout: 15000 }).catch(() => {});
      await sleep(2000);

      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('a[href*="/imovel/rj/"], a[href*="/imovel/"][class*="card"], [class*="property-card"], [class*="listing-card"]');
        const results = [];

        cards.forEach(card => {
          const link = card.href || card.getAttribute('href') || '';
          if (!link || results.some(r => r.url === link)) return;
          if (!link.includes('/imovel/')) return;

          const img = card.querySelector('img');
          const titleEl = card.querySelector('[class*="title"], [class*="titulo"], h2, h3');
          const priceEl = card.querySelector('[class*="price"], [class*="preco"], [class*="valor"]');
          const discountEl = card.querySelector('[class*="discount"], [class*="desconto"]');
          const descEl = card.querySelector('[class*="description"], [class*="descricao"], p');
          const badgeEl = card.querySelector('[class*="badge"], [class*="tag"]');

          results.push({
            url: link.startsWith('http') ? link : `https://www.leilaoimovel.com.br${link}`,
            image: img ? (img.src || img.getAttribute('data-src') || '') : '',
            title: titleEl ? titleEl.textContent.trim() : '',
            price: priceEl ? priceEl.textContent.trim() : '',
            discount: discountEl ? discountEl.textContent.trim() : '',
            description: descEl ? descEl.textContent.trim() : '',
            badge: badgeEl ? badgeEl.textContent.trim() : ''
          });
        });
        return results;
      });

      console.log(`  ${items.length} imóveis encontrados na página`);

      for (const item of items) {
        if (allProperties.some(p => p.url === item.url)) continue;
        allProperties.push(item);
      }

      const nextBtn = await page.$('a[rel="next"], a:has-text("Próximo"), a:has-text("Proximo"), a:has-text("›"), a[aria-label="Next"]');
      if (nextBtn) {
        const isDisabled = await nextBtn.evaluate(el => el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true');
        if (isDisabled) {
          hasNextPage = false;
        } else {
          await nextBtn.click();
          await sleep(3000);
        }
      } else {
        hasNextPage = false;
      }
    }

    console.log(`Total de ${allProperties.length} imóveis coletados`);

    const properties = allProperties.map((item, idx) => {
      const priceMatch = item.price.match(/R?\$?[\s]*([\d.\.,]+)/);
      const priceValue = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0 : 0;

      let city = extractCityFromUrl(item.url);
      if (!city) {
        const urlParts = item.url.split('/');
        const cidadeIdx = urlParts.indexOf('imovel');
        if (cidadeIdx >= 0 && urlParts.length > cidadeIdx + 1) {
          city = urlParts[cidadeIdx + 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }

      const saleType = item.badge.toLowerCase().includes('judicial') ? 'judicial' :
        item.badge.toLowerCase().includes('extrajudicial') ? 'extrajudicial' : 'venda_direta';

      const state = 'RJ';

      return {
        source: 'leilaoimovel',
        source_id: `leilaoimovel-${idx}-${Date.now()}`,
        cidade: city || 'Rio de Janeiro',
        estado: state,
        endereco: item.title || '',
        sale_type: saleType,
        property_type: 'Outros',
        valor_avaliacao: Math.round(priceValue * 1.4),
        valor_lance_inicial: priceValue,
        descontos_pct: null,
        leilao_tipo: item.badge || 'Leilão',
        img_urls: item.image ? [item.image] : null,
        url: item.url,
        description: item.description || item.title || '',
        status: 'active'
      };
    }).filter(p => p.valor_lance_inicial > 0);

    // Filtra apenas leilões judiciais do RJ
    const filtered = properties.filter(p => p.sale_type === 'judicial');
    console.log(`${filtered.length} imóveis judiciais do RJ prontos para inserir`);
    await upsertProperties(filtered);

  } catch (err) {
    console.error('Erro durante scraping:', err.message);
  } finally {
    await browser.close();
    console.log('Playwright scraper concluído!');
  }
}

scrape();
