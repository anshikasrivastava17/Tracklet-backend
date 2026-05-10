const docClient = require("../config/dynamoConfig");
const { scrapeProductPrice } = process.env.USE_MOCK_SCRAPER === "true"
  ? require("./mockScraperService")
  : require("./scraperService"); 
const { saveScrapeResult } = require("./scrapingService");
const { sendPriceDropAlert } = require("./emailService");
const crypto = require("crypto");

const PRODUCTS_TABLE = "Products";

/* ================================================================
   STRUCTURED LOGGER
   JSON format for CloudWatch Logs Insights queries.
   
   Example CloudWatch query to find all price drops:
     fields @timestamp, message, price, threshold
     | filter level = "INFO" and message = "PRICE_DROP"
     | sort @timestamp desc
   ================================================================ */

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "monitor",
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
 * Fetches all products currently in the DynamoDB table.
 */
async function fetchAllTrackedProducts() {
  const params = {
    TableName: PRODUCTS_TABLE,
  };

  try {
    const data = await docClient.scan(params).promise();
    return data.Items || [];
  } catch (error) {
    log('ERROR', 'DB_SCAN_FAILED', { error: error.message });
    throw new Error("Failed to fetch tracked products.");
  }
}

/**
 * Updates the NotificationSent flag to true so we don't spam the user.
 */
async function updateNotificationSent(productID, userEmail) {
  const params = {
    TableName: PRODUCTS_TABLE,
    Key: {
      Product_ID: productID,
      User_Email: userEmail,
    },
    UpdateExpression: "SET NotificationSent = :sent",
    ExpressionAttributeValues: {
      ":sent": true,
    },
  };

  try {
    await docClient.update(params).promise();
    log('INFO', 'NOTIFICATION_FLAGGED', { productId: productID.slice(0, 12) });
  } catch (error) {
    log('ERROR', 'NOTIFICATION_FLAG_FAILED', { productId: productID.slice(0, 12), error: error.message });
  }
}

/**
 * Detect store name from URL for logging.
 */
function detectStore(url) {
  if (url.includes('amazon')) return 'Amazon';
  if (url.includes('nykaa')) return 'Nykaa';
  if (url.includes('snapdeal')) return 'Snapdeal';
  if (url.includes('reliancedigital')) return 'RelianceDigital';
  if (url.includes('jiomart')) return 'JioMart';
  return 'Unknown';
}

/**
 * Main logic: Scans DB, scrapes prices in chunks, and sends alerts.
 */
async function monitorProductsAndScrape() {
  const runId = crypto.randomBytes(4).toString('hex'); // Short unique ID per run
  const runStart = Date.now();

  log('INFO', 'CYCLE_START', {
    runId,
    mockScraper: process.env.USE_MOCK_SCRAPER === "true",
    sendEmails: process.env.SEND_EMAILS === "true",
  });

  // Stats counters
  const stats = {
    total: 0,
    scraped: 0,
    failed: 0,
    skipped: 0,
    priceDrops: 0,
    emailsSent: 0,
  };

  try {
    const trackedProducts = await fetchAllTrackedProducts();
    stats.total = trackedProducts.length;

    if (trackedProducts.length === 0) {
      log('INFO', 'CYCLE_EMPTY', { runId, message: 'No products being tracked' });
      return { message: "No products to monitor." };
    }

    log('INFO', 'PRODUCTS_LOADED', { runId, count: trackedProducts.length });

    const CHUNK_SIZE = 3;
    const totalBatches = Math.ceil(trackedProducts.length / CHUNK_SIZE);

    for (let i = 0; i < trackedProducts.length; i += CHUNK_SIZE) {
      const chunk = trackedProducts.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;

      log('INFO', 'BATCH_START', { runId, batch: `${batchNum}/${totalBatches}`, size: chunk.length });
      
      await Promise.all(chunk.map(async (product) => {
        const { Product_ID, User_Email, Product_URL, Threshold_Value, NotificationSent } = product;
        const pid = Product_ID.slice(0, 12); // Short hash for logs
        const store = detectStore(Product_URL);
        const productStart = Date.now();

        // Skip if already notified
        if (NotificationSent === true) {
          log('INFO', 'SKIPPED_ALREADY_NOTIFIED', { runId, pid, store });
          stats.skipped++;
          return;
        }

        try {
          const scrapedPriceStr = await scrapeProductPrice(Product_URL);

          if (!scrapedPriceStr) {
            log('WARN', 'SCRAPE_NO_PRICE', { runId, pid, store, url: Product_URL.slice(0, 80) });
            stats.failed++;
            return;
          }

          const numericPrice = parseFloat(
            scrapedPriceStr.replace(/[^0-9.]/g, '')
          );

          if (isNaN(numericPrice)) {
            log('WARN', 'SCRAPE_INVALID_PRICE', { runId, pid, store, raw: scrapedPriceStr });
            stats.failed++;
            return;
          }

          const threshold = Number(Threshold_Value);
          const scrapeTimeMs = Date.now() - productStart;

          log('INFO', 'PRICE_SCRAPED', {
            runId,
            pid,
            store,
            price: numericPrice,
            threshold,
            belowThreshold: numericPrice <= threshold,
            scrapeTimeMs,
          });

          stats.scraped++;

          // 1. Save price history
          await saveScrapeResult(Product_ID, User_Email, numericPrice);

          // 2. Check threshold
          if (numericPrice <= threshold) {
            stats.priceDrops++;

            log('INFO', 'PRICE_DROP', {
              runId,
              pid,
              store,
              price: numericPrice,
              threshold,
              savings: threshold - numericPrice,
              user: User_Email,
            });

            // ✅ Controlled email sending
            if (process.env.SEND_EMAILS === "true") {
              try {
                await sendPriceDropAlert(User_Email, Product_URL, numericPrice);
                stats.emailsSent++;
                log('INFO', 'EMAIL_SENT', { runId, pid, user: User_Email });
              } catch (emailErr) {
                log('ERROR', 'EMAIL_FAILED', { runId, pid, user: User_Email, error: emailErr.message });
              }
            } else {
              log('INFO', 'EMAIL_SKIPPED', { runId, pid, reason: 'SEND_EMAILS=false' });
            }

            // Mark as notified
            await updateNotificationSent(Product_ID, User_Email);

          }

        } catch (error) {
          stats.failed++;
          log('ERROR', 'PRODUCT_FAILED', { runId, pid, store, error: error.message });
        }
      }));
    }

  } catch (error) {
    log('ERROR', 'CYCLE_CRASHED', { runId, error: error.message, elapsedMs: Date.now() - runStart });
    throw error;
  }

  // ── Run Summary ──
  const elapsedMs = Date.now() - runStart;
  log('INFO', 'CYCLE_COMPLETE', {
    runId,
    ...stats,
    elapsedMs,
    avgScrapeMs: stats.scraped > 0 ? Math.round(elapsedMs / stats.scraped) : 0,
  });

  return { message: "Monitoring completed.", stats };
}

module.exports = {
  monitorProductsAndScrape,
};