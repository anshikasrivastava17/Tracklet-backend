const express = require("express");
const {
  addProduct,
  getUserProducts,
  removeUserFromProduct,
  deleteProductIfUnused,
} = require("../services/productOperation");
const { authenticate } = require("../middleware/auth");
const { validateTrackInput } = require("../middleware/validate");
const { productLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Helper function to clean URLs and remove tracking parameters
function cleanEcommerceURL(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    
    // 1. Amazon (keep ASIN only)
    if (parsedUrl.hostname.includes('amazon')) {
      const match = parsedUrl.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (match && match[1]) {
        return `https://${parsedUrl.hostname}/dp/${match[1]}`;
      }
    }
    
    // 2. Nike (strip query params)
    if (parsedUrl.hostname.includes('nike.com')) {
      return parsedUrl.origin + parsedUrl.pathname;
    }

    // 4. Strip query parameters for standard sites (Removes ?utm_source=app etc.)
    if (
      parsedUrl.hostname.includes('snapdeal') || 
      parsedUrl.hostname.includes('nykaa') || 
      parsedUrl.hostname.includes('reliancedigital')
    ) {
      return parsedUrl.origin + parsedUrl.pathname;
    }

    return rawUrl; // Fallback
    
  } catch (error) {
    console.error("Invalid URL passed:", rawUrl);
    return rawUrl;
  }
}

// Add a product tracking entry (Protected, Validated, Rate limited)
router.post("/track", authenticate, productLimiter, validateTrackInput, async (req, res) => {
  const { productURL, threshold, timeout } = req.body;
  const email = req.user.email; // Extracted securely from JWT

  // validateTrackInput middleware handles the field checks, so we can proceed directly.

  // 🧹 Clean the URL to avoid bot-detection and messy tracking parameters
  const cleanedURL = cleanEcommerceURL(productURL);

  const parsedTimeout = parseInt(timeout, 10);
  if (isNaN(parsedTimeout) || parsedTimeout <= 0) {
    return res.status(400).json({ error: "Invalid timeout value. Must be a positive number." });
  }

  try {
    // Use the cleanedURL here instead of the raw productURL
    const result = await addProduct(email, cleanedURL, threshold, parsedTimeout);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Failed to add product. Please try again later." });
  }
});

// Get all products tracked by a user (Protected, Rate limited)
router.get("/user-products", authenticate, productLimiter, async (req, res) => {
  // Ignore query param, use the secure email from JWT
  const email = req.user.email;

  try {
    const products = await getUserProducts(email);
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching user products:", error);
    res.status(500).json({ error: "Failed to retrieve products." });
  }
});

// Remove user from product & attempt cleanup if no users left (Protected, Rate limited)
router.delete("/remove-user", authenticate, productLimiter, async (req, res) => {
  const { productID } = req.body;
  const email = req.user.email; // Use secure email from JWT

  if (!productID) {
    return res.status(400).json({ error: "productID is required." });
  }

  try {
    await removeUserFromProduct(email, productID);
    let cleanupResult = null;

    // Attempt to delete product if no users left, but ignore failure
    try {
      cleanupResult = await deleteProductIfUnused(productID);
    } catch (cleanupError) {
      console.warn(`Cleanup failed for product ${productID}:`, cleanupError.message);
    }

    res.status(200).json({
      message: "User removed from product successfully.",
      cleanupStatus: cleanupResult || "Product still tracked by other users.",
    });
  } catch (error) {
    console.error("Error removing user from product:", error);
    res.status(500).json({ error: "Failed to remove user from product." });
  }
});

module.exports = router;