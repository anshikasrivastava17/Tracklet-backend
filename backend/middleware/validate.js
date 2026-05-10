/**
 * Input Validation Middleware
 * 
 * Validates request bodies for product tracking endpoints.
 */

const SUPPORTED_DOMAINS = [
  'amazon', 'flipkart', 'ajio', 'nykaa', 'nike',
  'snapdeal', 'reliancedigital', 'jiomart', 'myntra', 'meesho'
];

/**
 * Simple email format check.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates the body of POST /products/track.
 */
function validateTrackInput(req, res, next) {
  const { productURL, threshold, timeout } = req.body;

  // Email comes from JWT (req.user.email) — no need to validate from body
  // But if email is also in body, we ignore it and use JWT email

  // 1. Product URL
  if (!productURL || typeof productURL !== "string") {
    return res.status(400).json({ error: "Product URL is required." });
  }

  try {
    const parsed = new URL(productURL);

    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return res.status(400).json({ error: "Product URL must use HTTPS." });
    }

    // Must be from a supported e-commerce site
    const hostname = parsed.hostname.toLowerCase();
    const isSupported = SUPPORTED_DOMAINS.some(domain => hostname.includes(domain));
    if (!isSupported) {
      return res.status(400).json({
        error: `Unsupported store. We support: ${SUPPORTED_DOMAINS.join(", ")}.`,
      });
    }
  } catch {
    return res.status(400).json({ error: "Invalid product URL format." });
  }

  // 2. Threshold
  if (threshold == null || isNaN(Number(threshold)) || Number(threshold) <= 0) {
    return res.status(400).json({ error: "Threshold must be a positive number." });
  }

  if (Number(threshold) > 10000000) {
    return res.status(400).json({ error: "Threshold seems unreasonably high." });
  }

  // 3. Timeout
  const t = parseInt(timeout, 10);
  if (isNaN(t) || t <= 0 || t > 12) {
    return res.status(400).json({ error: "Timeout must be between 1 and 12 months." });
  }

  next();
}

module.exports = { validateTrackInput, isValidEmail, SUPPORTED_DOMAINS };
