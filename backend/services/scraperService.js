// Force puppeteer-extra to use puppeteer-core
const { addExtra } = require('puppeteer-extra');
const puppeteerCore = require('puppeteer-core');
const puppeteer = addExtra(puppeteerCore);

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');

puppeteer.use(StealthPlugin());

/* ================================================================
   STRUCTURED LOGGER
   - JSON format for CloudWatch Logs Insights queries
   - Every log includes store, productId (short hash), and timing
   ================================================================ */

function log(level, store, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    store,
    message,
    ...meta,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Extract a short product identifier from a URL for readable logs.
 * Amazon: ASIN, Others: last path segment.
 */
function shortId(url) {
  try {
    const parsed = new URL(url);
    // Amazon ASIN
    const asinMatch = parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (asinMatch) return asinMatch[1];
    // Last meaningful path segment
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1]?.slice(0, 20) || parsed.hostname;
  } catch {
    return url.slice(0, 30);
  }
}

/* ================================================================
   BROWSER LAUNCH
   ================================================================ */

async function launchBrowser(options = {}) {
  const isLambda = process.env.AWS_EXECUTION_ENV !== undefined;

  let browser;

  if (isLambda) {
    // ✅ AWS Lambda
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ...options,
    });
  } else {
    // ✅ Local (Windows)
    browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: null,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled'
      ],
      ...options,
    });
  }

  const page = await browser.newPage();

  // Hide automation
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  return { browser, page };
}

module.exports = { launchBrowser };

// Set user agent and block unnecessary resources
async function setUserAgentAndBlockResources(page) {
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

/* ================================================================
   AMAZON SCRAPER
   - Sets delivery pincode to normalize location-based pricing
   - Filters out struck-through MRP prices
   - Logs exactly which selector matched
   ================================================================ */

const scrapeAmazon = async (url) => {
  const store = 'Amazon';
  const pid = shortId(url);
  const startTime = Date.now();
  let browser, page;

  try {
    const browserInstance = await launchBrowser();
    browser = browserInstance.browser;
    page = browserInstance.page;

    log('INFO', store, 'Browser launched', { pid });

    // 1. Force a strict Desktop environment
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 2. Block unnecessary resources
    await setUserAgentAndBlockResources(page);

    // 3. Navigate
    const navStart = Date.now();
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    log('INFO', store, 'Page loaded', { pid, loadTimeMs: Date.now() - navStart });

    // 4. Set delivery pincode to normalize location-based pricing
    try {
      // Click the delivery location widget
      const locationWidget = await page.$('#glow-ingress-block, #nav-global-location-popover-link');
      if (locationWidget) {
        await locationWidget.click();
        await new Promise(r => setTimeout(r, 1500));

        // Type pincode
        const pincodeInput = await page.$('#GLUXZipUpdateInput');
        if (pincodeInput) {
          await pincodeInput.click({ clickCount: 3 }); // Select existing text
          await pincodeInput.type('110001', { delay: 50 });
          
          // Click Apply
          const applyBtn = await page.$('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate .a-button-input');
          if (applyBtn) {
            await applyBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            log('INFO', store, 'Pincode set to 110001', { pid });
          }
        }
        
        // Close any remaining popover
        const closeBtn = await page.$('.a-popover-footer button, #GLUXConfirmClose');
        if (closeBtn) await closeBtn.click();
        
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (pinErr) {
      log('WARN', store, 'Could not set pincode (non-fatal)', { pid, error: pinErr.message });
    }

    // 5. Wait for dynamic content to load in the Buy Box
    await new Promise(r => setTimeout(r, 3000));

    // 6. Debugging: Grab the title
    const title = await page.evaluate(() => {
      const titleEl = document.querySelector('#productTitle');
      return titleEl ? titleEl.innerText.trim() : 'Unknown Title';
    });
    log('INFO', store, 'Product identified', { pid, title: title.slice(0, 80) });

    // 7. Extract the SELLING price (not MRP) using refined selectors
    const priceResult = await page.evaluate(() => {
      /**
       * Helper: Check if an element or its parent has a strikethrough
       * (indicating it's the old MRP, not the selling price)
       */
      function isStrikethrough(el) {
        let current = el;
        for (let i = 0; i < 4; i++) { // Walk up 4 levels max
          if (!current) break;
          const style = window.getComputedStyle(current);
          if (style.textDecoration.includes('line-through') || 
              style.textDecorationLine.includes('line-through')) {
            return true;
          }
          // Also check for Amazon's explicit "a-text-strike" class
          if (current.classList && current.classList.contains('a-text-strike')) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }

      /**
       * Try a selector, but only return it if it's NOT struck through.
       * Returns { price, selector } or null.
       */
      function trySelector(selector, label) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el && el.innerText && el.innerText.trim() && !isStrikethrough(el)) {
            return { price: el.innerText.trim(), selector: label };
          }
        }
        return null;
      }

      // Priority order — strict desktop Buy Box selectors only
      const selectors = [
        ['#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-price-whole', 'corePriceDisplay_desktop (non-MRP)'],
        ['#corePriceDisplay_desktop_feature_div .a-price-whole', 'corePriceDisplay_desktop'],
        ['#apex_desktop .a-price:not(.a-text-price) .a-price-whole', 'apex_desktop (non-MRP)'],
        ['#apex_desktop .a-price-whole', 'apex_desktop'],
        ['#centerCol .a-price:not(.a-text-price) .a-price-whole', 'centerCol (non-MRP)'],
        ['#rightCol .a-price:not(.a-text-price) .a-price-whole', 'rightCol (non-MRP)'],
        ['#priceblock_dealprice', 'priceblock_dealprice'],
        ['#priceblock_ourprice', 'priceblock_ourprice'],
      ];

      for (const [sel, label] of selectors) {
        const result = trySelector(sel, label);
        if (result) return result;
      }

      return null;
    });

    const elapsed = Date.now() - startTime;

    if (!priceResult) {
      log('WARN', store, 'No price found', { pid, title: title.slice(0, 50), elapsedMs: elapsed });
      return null;
    }

    log('INFO', store, 'Price extracted', {
      pid,
      price: priceResult.price,
      selector: priceResult.selector,
      title: title.slice(0, 50),
      elapsedMs: elapsed,
    });

    return priceResult.price;

  } catch (error) {
    log('ERROR', store, 'Scrape failed', { pid, error: error.message, elapsedMs: Date.now() - startTime });
    return null;
  } finally {
    if (browser) await browser.close();
  }
};

/* ================================================================
   SNAPDEAL SCRAPER
   ================================================================ */

async function scrapeSnapdeal(url) {
  const store = 'Snapdeal';
  const pid = shortId(url);
  const startTime = Date.now();
  let browser, page;

  try {
    const browserInstance = await launchBrowser();
    browser = browserInstance.browser;
    page = browserInstance.page;

    log('INFO', store, 'Browser launched', { pid });

    await setUserAgentAndBlockResources(page);
    
    const navStart = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log('INFO', store, 'Page loaded', { pid, loadTimeMs: Date.now() - navStart });

    await new Promise(r => setTimeout(r, 2000)); // Human delay

    const priceResult = await page.evaluate(() => {
      // Priority 1: Snapdeal's standard price class
      const el = document.querySelector('.payBlkBig');
      if (el && el.textContent) return { price: el.textContent.trim(), selector: '.payBlkBig' };

      // Priority 2: Smart Search Fallback
      const elements = Array.from(document.querySelectorAll('span, div'));
      const priceRegex = /^(?:Rs\.?|INR|₹)\s?(\d{1,3}(?:,\d{2,3})*)/i; 
      
      for (let el of elements) {
        if (el.children.length === 0 && el.textContent && priceRegex.test(el.textContent.trim())) {
           return { price: el.textContent.trim(), selector: 'regex-fallback' };
        }
      }
      return null;
    });

    const elapsed = Date.now() - startTime;

    if (!priceResult) {
      log('WARN', store, 'No price found', { pid, elapsedMs: elapsed });
      return null;
    }

    log('INFO', store, 'Price extracted', { pid, price: priceResult.price, selector: priceResult.selector, elapsedMs: elapsed });
    return priceResult.price;

  } catch (error) {
    log('ERROR', store, 'Scrape failed', { pid, error: error.message, elapsedMs: Date.now() - startTime });
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/* ================================================================
   RELIANCE DIGITAL SCRAPER
   ================================================================ */

async function scrapeRelianceDigital(url) {
  const store = 'RelianceDigital';
  const pid = shortId(url);
  const startTime = Date.now();
  let browser, page;

  try {
    const browserInstance = await launchBrowser();
    browser = browserInstance.browser;
    page = browserInstance.page;

    log('INFO', store, 'Browser launched', { pid });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Aggressive blocking: Stop images, fonts, media, and websockets. Allow only essentials.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const blocked = ['image', 'media', 'font', 'websocket', 'manifest'];
      if (blocked.includes(req.resourceType())) {
        req.abort(); 
      } else {
        req.continue(); 
      }
    });
    
    // Try to load, but ignore timeouts
    const navStart = Date.now();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log('INFO', store, 'Page loaded', { pid, loadTimeMs: Date.now() - navStart });
    } catch (e) {
      log('WARN', store, 'page.goto timed out, proceeding anyway', { pid, loadTimeMs: Date.now() - navStart });
    }

    // Give Vue.js a few seconds to inject the price into the HTML
    await new Promise(r => setTimeout(r, 3000));

    try {
      await page.waitForSelector('.product-price', { timeout: 10000 });
    } catch (e) {
      log('WARN', store, 'Timed out waiting for .product-price selector', { pid });
    }

    const priceResult = await page.evaluate(() => {
      // Priority 1: The exact class from the Vue.js frontend
      const semanticSelectors = [
        ['.product-price', '.product-price'],
        ['.pdp__priceSection__priceListText', '.pdp__priceSection__priceListText'], 
        ['.pdp__priceSection__priceListTextString', '.pdp__priceSection__priceListTextString']
      ];
      
      for (let [selector, label] of semanticSelectors) {
        const elements = document.querySelectorAll(selector);
        for (let el of elements) {
          if (el && el.textContent && el.textContent.includes('₹')) {
            return { price: el.textContent.trim(), selector: label };
          }
        }
      }

      // Priority 2: Smart Search Fallback
      const elements = Array.from(document.querySelectorAll('span, li, div, p'));
      const priceRegex = /₹\s?(\d{1,3}(,\d{2,3})*(\.\d{1,2})?)/; 
      
      for (let el of elements) {
        if (el.children.length === 0 && el.textContent && priceRegex.test(el.textContent)) {
           if (!el.textContent.toLowerCase().includes('mo') && !el.closest('.emi-block')) {
               return { price: el.textContent.trim(), selector: 'regex-fallback' };
           }
        }
      }
      return null;
    });

    const elapsed = Date.now() - startTime;

    if (!priceResult) {
      log('WARN', store, 'No price found', { pid, elapsedMs: elapsed });
      return null;
    }

    log('INFO', store, 'Price extracted', { pid, price: priceResult.price, selector: priceResult.selector, elapsedMs: elapsed });
    return priceResult.price;

  } catch (error) {
    log('ERROR', store, 'Scrape failed', { pid, error: error.message, elapsedMs: Date.now() - startTime });
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/* ================================================================
   NYKAA SCRAPER
   ================================================================ */

async function scrapeNykaa(url) {
  const store = 'Nykaa';
  const pid = shortId(url);
  const startTime = Date.now();
  let browser, page;

  try {
    const browserInstance = await launchBrowser();
    browser = browserInstance.browser;
    page = browserInstance.page;

    log('INFO', store, 'Browser launched', { pid });

    // Use a desktop user agent so the scraped price matches the desktop site
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      // Allowing stylesheets just in case Nykaa's mobile layout relies on them to render text blocks
      if (['image', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Wait for network to calm down
    const navStart = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log('INFO', store, 'Page loaded', { pid, loadTimeMs: Date.now() - navStart });

    // Add a random delay to simulate human loading time
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Wait until at least one element with a Rupee symbol appears (max 10s)
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('₹'),
        { timeout: 10000 }
      );
    } catch (e) {
      log('WARN', store, 'Timed out waiting for ₹ symbol', { pid });
    }

    const priceResult = await page.evaluate(() => {
      // Priority 1: Check the exact classes
      const classes = [
        ['.css-1jczs19', '.css-1jczs19'],
        ['.css-1byl9fj', '.css-1byl9fj'],
        ['.css-111z9ua', '.css-111z9ua']
      ];
      for (let [selector, label] of classes) {
        // Use querySelectorAll to get ALL matches (both MRP and selling price)
        const elements = document.querySelectorAll(selector);
        for (let el of elements) {
          if (el && el.textContent && el.textContent.includes('₹')) {
            // Check if this specific element has a strikethrough line
            const style = window.getComputedStyle(el);
            if (!style.textDecoration.includes('line-through')) {
              return { price: el.textContent.trim(), selector: label }; // Return the first one WITHOUT a strikethrough
            }
          }
        }
      }

      // Priority 2: The "Smart Search" fallback
      const elements = Array.from(document.querySelectorAll('span, div, p'));
      const priceRegex = /₹\s?(\d{1,3}(,\d{2,3})*)/; 
      
      for (let el of elements) {
        if (el.children.length === 0 && el.textContent && priceRegex.test(el.textContent)) {
           // Apply the exact same strikethrough check to our fallback!
           const style = window.getComputedStyle(el);
           if (!style.textDecoration.includes('line-through')) {
               return { price: el.textContent.trim(), selector: 'regex-fallback' };
           }
        }
      }

      return null;
    });

    const elapsed = Date.now() - startTime;

    if (!priceResult) {
      log('WARN', store, 'No price found', { pid, elapsedMs: elapsed });
      return null;
    }

    log('INFO', store, 'Price extracted', { pid, price: priceResult.price, selector: priceResult.selector, elapsedMs: elapsed });
    return priceResult.price;

  } catch (error) {
    log('ERROR', store, 'Scrape failed', { pid, error: error.message, elapsedMs: Date.now() - startTime });
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/* ================================================================
   MAIN DISPATCHER
   ================================================================ */

async function scrapeProductPrice(url) {
  if (url.includes('amazon')) return await scrapeAmazon(url);
  else if (url.includes('nykaa')) return await scrapeNykaa(url);
  else if (url.includes('snapdeal')) return await scrapeSnapdeal(url);
  else if (url.includes('reliancedigital')) return await scrapeRelianceDigital(url);
  else {
    log('WARN', 'Unknown', 'Unsupported website attempted', { url: url.slice(0, 100) });
    return null; 
  }
}

module.exports = { scrapeProductPrice, launchBrowser };