const express = require("express");
const {
  signupUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
} = require("../services/userOperations");
const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Signup route (Rate limited: 5 req/min)
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const result = await signupUser(req.body);
    res.status(201).json({ message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Login route (Rate limited: 5 req/min)
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const response = await loginUser(req.body);
    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 401).json({ error: err.message });
  }
});

// Forgot password — sends OTP to registered email
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required." });
    }

    const result = await requestPasswordReset(email.trim());
    res.status(200).json({ message: result.message });
  } catch (err) {
    // Return generic message even on unexpected errors
    res.status(200).json({
      message: "If that email is registered, a reset code has been sent.",
    });
  }
});

// Reset password — validates OTP and sets new password
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "email, otp, and newPassword are required." });
    }

    // Validate OTP is exactly 6 digits
    if (!/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({ error: "OTP must be a 6-digit code." });
    }

    // Basic password strength — at least 8 characters
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }

    const result = await resetPassword(email.trim(), String(otp).trim(), newPassword);
    res.status(200).json({ message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;