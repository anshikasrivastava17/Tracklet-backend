/**
 * Mock Scraper Service
 * 
 * Drop-in replacement for scraperService.js that returns realistic fake prices
 * without launching Puppeteer or hitting any real website.
 * 
 * Activate by setting USE_MOCK_SCRAPER=true in your .env file.
 * Exports the same interface as scraperService.js — no consumer changes needed.
 */

// Realistic price ranges per store category
const STORE_CONFIG = {
  amazon: {
    name: "Amazon",
    priceRange: [199, 89999],
    commonPrices: [499, 999, 1299, 2499, 3999, 6999, 12999, 24999, 34999, 49999],
  },
  nykaa: {
    name: "Nykaa",
    priceRange: [99, 4999],
    commonPrices: [199, 349, 499, 649, 799, 999, 1299, 1599, 1999, 2499],
  },
  snapdeal: {
    name: "Snapdeal",
    priceRange: [99, 29999],
    commonPrices: [299, 599, 799, 1199, 1999, 2999, 4999, 7999, 9999],
  },
  reliancedigital: {
    name: "Reliance Digital",
    priceRange: [999, 149999],
    commonPrices: [2999, 5999, 9999, 14999, 19999, 29999, 44999, 69999, 99999],
  },
  jiomart: {
    name: "JioMart",
    priceRange: [29, 9999],
    commonPrices: [49, 99, 149, 249, 399, 599, 799, 999, 1499, 1999],
  },
  nike: {
    name: "Nike",
    priceRange: [1495, 24995],
    commonPrices: [2495, 3495, 4995, 5995, 7495, 8995, 10995, 13995, 16995, 21995],
  },
};

/**
 * Detect the store from a product URL.
 */
function detectStore(url) {
  const lower = url.toLowerCase();
  for (const key of Object.keys(STORE_CONFIG)) {
    if (lower.includes(key)) return key;
  }
  return null;
}

/**
 * Generate a realistic-looking price for the detected store.
 * 70% chance of picking from common prices, 30% chance of a random price in range.
 */
function generatePrice(storeKey) {
  const config = STORE_CONFIG[storeKey] || STORE_CONFIG.amazon;

  if (Math.random() < 0.7) {
    // Pick a common price and add small variance (±5%)
    const base = config.commonPrices[Math.floor(Math.random() * config.commonPrices.length)];
    const variance = Math.floor(base * (Math.random() * 0.1 - 0.05));
    return Math.max(1, base + variance);
  }

  // Random price in the store's range
  const [min, max] = config.priceRange;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Format a number as an Indian-style price string (e.g., "12,499").
 */
function formatIndianPrice(num) {
  const str = num.toString();
  if (str.length <= 3) return str;

  // Last 3 digits, then groups of 2
  let result = str.slice(-3);
  let remaining = str.slice(0, -3);
  while (remaining.length > 0) {
    result = remaining.slice(-2) + "," + result;
    remaining = remaining.slice(0, -2);
  }
  return result;
}

/**
 * Simulate scraping delay (500–1500ms) to mimic real browser behavior.
 */
function randomDelay() {
  const delay = 500 + Math.floor(Math.random() * 1000);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Main mock scraper function — same signature as the real scrapeProductPrice().
 */
async function scrapeProductPrice(url) {
  const storeKey = detectStore(url);

  if (!storeKey) {
    console.warn(`🧪 MOCK: Unsupported website attempted: ${url}`);
    return null;
  }

  const storeName = STORE_CONFIG[storeKey].name;
  console.log(`🧪 MOCK: Scraping ${storeName} URL: ${url}`);

  // Simulate network/rendering delay
  const delay = 500 + Math.floor(Math.random() * 1000);
  await new Promise((r) => setTimeout(r, delay));

  // 5% chance of simulating a scrape failure (realistic — sites sometimes block)
  if (process.env.NODE_ENV !== "test" && Math.random() < 0.05) {
    console.log(`🧪 MOCK: Simulated scrape failure for ${storeName} (5% chance)`);
    return null;
  }

  const price = generatePrice(storeKey);
  const formatted = formatIndianPrice(price);

  console.log(`🧪 MOCK: ${storeName} price: ${formatted} (delay: ${delay}ms)`);
  return formatted;
}

module.exports = { scrapeProductPrice };
