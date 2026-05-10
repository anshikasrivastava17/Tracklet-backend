/**
 * In-Memory Rate Limiter
 * 
 * Simple token-bucket style rate limiter using a Map.
 * Suitable for Lambda (resets on cold start) and local dev.
 * 
 * For production-grade rate limiting, use API Gateway throttling
 * or AWS WAF rate-based rules.
 */

const rateLimitStore = new Map();

// Cleanup expired entries every 60 seconds to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000).unref(); // .unref() prevents this from keeping the process alive

/**
 * Creates a rate limiter middleware.
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 */
function createRateLimiter(maxRequests = 10, windowMs = 60000) {
  return (req, res, next) => {
    // Use IP + route path as the key
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // First request or window expired — start fresh
      entry = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetTime - now) / 1000);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

// Pre-configured limiters
const authLimiter = createRateLimiter(5, 60000);      // 5 req/min for login/signup
const productLimiter = createRateLimiter(20, 60000);   // 20 req/min for product ops
const monitorLimiter = createRateLimiter(2, 60000);    // 2 req/min for manual monitor trigger

module.exports = { createRateLimiter, authLimiter, productLimiter, monitorLimiter };
