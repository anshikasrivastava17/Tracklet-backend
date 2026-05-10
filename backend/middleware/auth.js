const jwt = require("jsonwebtoken");

/**
 * JWT Authentication Middleware
 * 
 * Extracts and verifies the JWT token from the Authorization header.
 * On success, attaches { email } to req.user.
 * On failure, returns 401 Unauthorized.
 * 
 * Usage: router.post("/track", authenticate, handler)
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. Malformed token." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("FATAL: JWT_SECRET environment variable is not set.");
    return res.status(500).json({ error: "Internal server error." });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = { email: decoded.email };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
}

module.exports = { authenticate };
