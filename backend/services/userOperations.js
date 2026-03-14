const docClient = require("../config/dynamoConfig");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const TABLE_NAME = "Users";
const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key";

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
        const token = jwt.sign({ email: user.Item.Email }, SECRET_KEY, { expiresIn: "1h" });

        return { message: "Login successful", token };
    } catch (error) {
        console.error("Login Error:", error.message);
        throw error;
    }
};

const otpStore = new Map();

const forgotPassword = async (email) => {
    if (!email) {
        const error = new Error("Email is required");
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
            // We still want to return 200 to prevent email enumeration, or we can throw 404
            const error = new Error("User not registered.");
            error.statusCode = 404;
            throw error;
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP with expiration (10 minutes)
        otpStore.set(normalizedEmail, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        // Send OTP email
        const { sendPasswordResetOTP } = require("./emailService");
        await sendPasswordResetOTP(normalizedEmail, otp);

        return { message: "OTP sent to your email" };
    } catch (error) {
        console.error("Forgot Password Error:", error.message);
        throw error;
    }
};

const resetPassword = async (email, otp, newPassword) => {
    if (!email || !otp || !newPassword) {
        const error = new Error("Email, OTP, and new password are required");
        error.statusCode = 400;
        throw error;
    }

    try {
        const normalizedEmail = email.toLowerCase();
        const storedData = otpStore.get(normalizedEmail);

        if (!storedData) {
            const error = new Error("No active password reset request found");
            error.statusCode = 400;
            throw error;
        }

        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(normalizedEmail);
            const error = new Error("OTP has expired. Please request a new one.");
            error.statusCode = 400;
            throw error;
        }

        if (storedData.otp !== otp) {
            const error = new Error("Invalid OTP");
            error.statusCode = 400;
            throw error;
        }

        // Verify user again
        const user = await docClient
            .get({ TableName: TABLE_NAME, Key: { Email: normalizedEmail } })
            .promise();

        if (!user.Item) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        // Hash the new password securely
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update user in DynamoDB
        const updatedUser = {
            ...user.Item,
            Password: hashedPassword,
        };

        await docClient.put({ TableName: TABLE_NAME, Item: updatedUser }).promise();
        
        // Clean up OTP session
        otpStore.delete(normalizedEmail);

        return { message: "Password has been successfully reset" };
    } catch (error) {
        console.error("Reset Password Error:", error.message);
        throw error;
    }
};

module.exports = { signupUser, loginUser, forgotPassword, resetPassword };