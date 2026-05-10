const docClient = require("../config/dynamoConfig");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("./emailService");

const TABLE_NAME = "Users";
const OTP_EXPIRY_MINUTES = 15;

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && !process.env.AWS_EXECUTION_ENV) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "WARN",
    service: "auth",
    message: "JWT_SECRET is not set — auth will fail",
  }));
}

// Structured logger for CloudWatch
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "auth",
    message,
    ...meta,
  };
  if (level === "ERROR") {
    console.error(JSON.stringify(entry));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// Signup new user
const signupUser = async ({ name, email, password }) => {
  if (!name || !email || !password) {
    const error = new Error("All fields are required");
    error.statusCode = 400;
    throw error;
  }

  try {
    const normalizedEmail = email.toLowerCase();

    const checkUser = await docClient
      .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
      .promise();

    if (checkUser.Item) {
      const error = new Error("Email already registered");
      error.statusCode = 400;
      log("WARN", "SIGNUP_DUPLICATE", { email: normalizedEmail });
      throw error;
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      Email: normalizedEmail,
      FullName: name,
      Password: hashedPassword,
    };

    await docClient.put({ TableName: TABLE_NAME, Item: newUser }).promise();
    log("INFO", "SIGNUP_SUCCESS", { email: normalizedEmail });
    return { message: "User registered successfully" };
  } catch (error) {
    if (!error.statusCode) {
      log("ERROR", "SIGNUP_FAILED", { error: error.message });
    }
    throw error;
  }
};

// Login existing user
const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.statusCode = 400;
    throw error;
  }

  try {
    const normalizedEmail = email.toLowerCase();

    const user = await docClient
      .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
      .promise();

    if (!user.Item) {
      const error = new Error("User not registered. Please sign up.");
      error.statusCode = 404;
      log("WARN", "LOGIN_UNKNOWN_EMAIL", {});
      throw error;
    }

    const isPasswordValid = await bcrypt.compare(password, user.Item.Password);
    if (!isPasswordValid) {
      const error = new Error("Incorrect password. Please try again.");
      error.statusCode = 401;
      log("WARN", "LOGIN_BAD_PASSWORD", {});
      throw error;
    }

    const token = jwt.sign({ email: user.Item.Email }, JWT_SECRET, { expiresIn: "1h" });
    log("INFO", "LOGIN_SUCCESS", {});
    return { message: "Login successful", token };
  } catch (error) {
    if (!error.statusCode) {
      log("ERROR", "LOGIN_FAILED", { error: error.message });
    }
    throw error;
  }
};

// Request OTP for password reset
const requestPasswordReset = async (email) => {
  const normalizedEmail = email.toLowerCase();

  try {
    const result = await docClient
      .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
      .promise();

    // Return success even if email not found to prevent enumeration
    if (!result.Item) {
      log("INFO", "FORGOT_PASSWORD_UNKNOWN_EMAIL", {});
      return { message: "If that email is registered, a reset code has been sent." };
    }

    // Generate 6-digit OTP
    const otp = String(crypto.randomInt(100000, 999999));
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Hash OTP before storing
    const otpHash = await bcrypt.hash(otp, 10);

    await docClient.update({
      TableName: TABLE_NAME,
      Key: { Email: normalizedEmail },
      UpdateExpression: "SET PasswordResetOTP = :otp, PasswordResetExpiry = :expiry",
      ExpressionAttributeValues: {
        ":otp": otpHash,
        ":expiry": expiry,
      },
    }).promise();

    // Send OTP email
    await sendPasswordResetEmail(normalizedEmail, otp);

    log("INFO", "FORGOT_PASSWORD_OTP_SENT", {});
    return { message: "If that email is registered, a reset code has been sent." };
  } catch (error) {
    log("ERROR", "FORGOT_PASSWORD_FAILED", { error: error.message });
    throw error;
  }
};

// Validate OTP and reset password
const resetPassword = async (email, otp, newPassword) => {
  const normalizedEmail = email.toLowerCase();

  try {
    const result = await docClient
      .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
      .promise();

    const user = result.Item;

    // Validate user, OTP presence, and expiry
    if (
      !user ||
      !user.PasswordResetOTP ||
      !user.PasswordResetExpiry ||
      new Date() > new Date(user.PasswordResetExpiry)
    ) {
      const error = new Error("Invalid or expired reset code");
      error.statusCode = 400;
      log("WARN", "RESET_PASSWORD_INVALID_OR_EXPIRED", {});
      throw error;
    }

    // Verify OTP hash
    const isOTPValid = await bcrypt.compare(otp, user.PasswordResetOTP);
    if (!isOTPValid) {
      const error = new Error("Invalid or expired reset code");
      error.statusCode = 400;
      log("WARN", "RESET_PASSWORD_WRONG_OTP", {});
      throw error;
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP fields
    await docClient.update({
      TableName: TABLE_NAME,
      Key: { Email: normalizedEmail },
      UpdateExpression:
        "SET Password = :pwd REMOVE PasswordResetOTP, PasswordResetExpiry",
      ExpressionAttributeValues: {
        ":pwd": hashedPassword,
      },
    }).promise();

    log("INFO", "RESET_PASSWORD_SUCCESS", {});
    return { message: "Password reset successfully" };
  } catch (error) {
    if (!error.statusCode) {
      log("ERROR", "RESET_PASSWORD_FAILED", { error: error.message });
    }
    throw error;
  }
};

module.exports = { signupUser, loginUser, requestPasswordReset, resetPassword };