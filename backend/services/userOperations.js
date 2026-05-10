const docClient = require("../config/dynamoConfig");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const TABLE_NAME = "Users"; 

// JWT secret from environment — MUST be set in Lambda env vars and .env locally
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && !process.env.AWS_EXECUTION_ENV) {
  console.warn("⚠️ WARNING: JWT_SECRET is not set. Auth will fail.");
}

const signupUser = async ({ name, email, password }) => {
  if (!name || !email || !password) {
      const error = new Error("All fields are required");
      error.statusCode = 400;
      throw error;
  }

  try {
      const normalizedEmail = email.toLowerCase();

      // Check if the user already exists
      const checkUser = await docClient
          .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
          .promise();

      if (checkUser.Item) {
          const error = new Error("Email already registered");
          error.statusCode = 400;
          throw error;
      }

      // Hash the password securely
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Store user details
      const newUser = {
          Email: normalizedEmail,
          FullName: name,
          Password: hashedPassword,
      };

      await docClient.put({ TableName: TABLE_NAME, Item: newUser }).promise();
      return { message: "User registered successfully" };
  } catch (error) {
      console.error("Signup Error:", error);
      throw error;
  }
};

const loginUser = async ({ email, password }) => {
  if (!email || !password) {
      const error = new Error("Email and password are required");
      error.statusCode = 400;
      throw error;
  }

  try {
      const normalizedEmail = email.toLowerCase();

      // Fetch the user from the database
      const user = await docClient
          .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
          .promise();

      if (!user.Item) {
          const error = new Error("User not registered. Please sign up.");
          error.statusCode = 404;
          throw error;
      }

      // Compare provided password with stored hashed password
      const isPasswordValid = await bcrypt.compare(password, user.Item.Password);
      if (!isPasswordValid) {
          const error = new Error("Incorrect password. Please try again.");
          error.statusCode = 401;
          throw error;
      }

      // Generate a JWT token
      const token = jwt.sign({ email: user.Item.Email }, JWT_SECRET, { expiresIn: "1h" });

      return { message: "Login successful", token };
  } catch (error) {
      console.error("Login Error:", error.message);
      throw error;
  }
};

module.exports = { signupUser, loginUser }