const express = require("express");
const { signupUser, loginUser, forgotPassword, resetPassword } = require("../services/userOperations");

const router = express.Router();

// Signup route
router.post("/signup", async (req, res) => {
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

// Login route
router.post("/login", async (req, res) => {
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

// Forgot password route
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const response = await forgotPassword(email);
    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Reset password route
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }

    const response = await resetPassword(email, otp, newPassword);
    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;