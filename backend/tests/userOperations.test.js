process.env.JWT_SECRET = "test-secret";

const docClient = require("../config/dynamoConfig");
const { signupUser, loginUser } = require("../services/userOperations");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

jest.mock("../config/dynamoConfig", () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  genSalt: jest.fn().mockResolvedValue("salt"),
  hash: jest.fn().mockResolvedValue("hashedPassword"),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("fake-jwt-token"),
}));

// Mock emailService so we never send real emails in tests
jest.mock("../services/emailService", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(),
}));

describe("User Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("signupUser", () => {
    it("should throw error if fields are missing", async () => {
      await expect(signupUser({ name: "Test" })).rejects.toThrow("All fields are required");
    });

    it("should throw error if email already exists", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Item: { Email: "test@test.com" } }) });
      await expect(signupUser({ name: "Test", email: "test@test.com", password: "pwd" })).rejects.toThrow("Email already registered");
    });

    it("should successfully register a new user", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
      docClient.put.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });

      const result = await signupUser({ name: "Test", email: "new@test.com", password: "pwd" });

      expect(result.message).toBe("User registered successfully");
      expect(docClient.put).toHaveBeenCalledWith(expect.objectContaining({
        TableName: "Users",
        Item: expect.objectContaining({ Email: "new@test.com", FullName: "Test", Password: "hashedPassword" })
      }));
    });
  });

  describe("loginUser", () => {
    it("should throw error if user not found", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
      await expect(loginUser({ email: "unknown@test.com", password: "pwd" })).rejects.toThrow("User not registered. Please sign up.");
    });

    it("should throw error if password incorrect", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Item: { Email: "test@test.com", Password: "hashedPassword" } }) });
      bcrypt.compare.mockResolvedValue(false);
      await expect(loginUser({ email: "test@test.com", password: "wrong" })).rejects.toThrow("Incorrect password. Please try again.");
    });

    it("should return token on successful login", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Item: { Email: "test@test.com", Password: "hashedPassword" } }) });
      bcrypt.compare.mockResolvedValue(true);

      const result = await loginUser({ email: "test@test.com", password: "correct" });

      expect(result.message).toBe("Login successful");
      expect(result.token).toBe("fake-jwt-token");
      expect(jwt.sign).toHaveBeenCalledWith({ email: "test@test.com" }, "test-secret", { expiresIn: "1h" });
    });
  });

  describe("requestPasswordReset", () => {
    const { requestPasswordReset } = require("../services/userOperations");
    const { sendPasswordResetEmail } = require("../services/emailService");

    it("should silently succeed even if user not found (anti-enumeration)", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }); // no Item
      const result = await requestPasswordReset("nobody@test.com");
      expect(result.message).toMatch(/If that email/);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("should generate OTP, store hash, and send email when user exists", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Item: { Email: "user@test.com" } }) });
      docClient.update.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
      // bcrypt.hash already mocked to return "hashedPassword"

      const result = await requestPasswordReset("user@test.com");
      expect(result.message).toMatch(/If that email/);
      expect(docClient.update).toHaveBeenCalled();
      expect(sendPasswordResetEmail).toHaveBeenCalledWith("user@test.com", expect.any(String));
    });
  });

  describe("resetPassword", () => {
    const { resetPassword } = require("../services/userOperations");

    it("should throw if user not found", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
      await expect(resetPassword("x@test.com", "123456", "newpwd")).rejects.toThrow("Invalid or expired reset code");
    });

    it("should throw if OTP is not set on user record", async () => {
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Item: { Email: "u@test.com" } }) });
      await expect(resetPassword("u@test.com", "123456", "newpwd")).rejects.toThrow("Invalid or expired reset code");
    });

    it("should throw if OTP is expired", async () => {
      const expiredTime = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({
        Item: { Email: "u@test.com", PasswordResetOTP: "hash", PasswordResetExpiry: expiredTime }
      }) });
      bcrypt.compare.mockResolvedValue(true); // OTP hash matches but expired
      await expect(resetPassword("u@test.com", "123456", "newpwd")).rejects.toThrow("Invalid or expired reset code");
    });

    it("should throw if OTP hash does not match", async () => {
      const futureExpiry = new Date(Date.now() + 600000).toISOString();
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({
        Item: { Email: "u@test.com", PasswordResetOTP: "hash", PasswordResetExpiry: futureExpiry }
      }) });
      bcrypt.compare.mockResolvedValue(false); // wrong OTP
      await expect(resetPassword("u@test.com", "111111", "newpwd")).rejects.toThrow("Invalid or expired reset code");
    });

    it("should update password and clear OTP on valid reset", async () => {
      const futureExpiry = new Date(Date.now() + 600000).toISOString();
      docClient.get.mockReturnValue({ promise: jest.fn().mockResolvedValue({
        Item: { Email: "u@test.com", PasswordResetOTP: "hash", PasswordResetExpiry: futureExpiry }
      }) });
      bcrypt.compare.mockResolvedValue(true);
      docClient.update.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });

      const result = await resetPassword("u@test.com", "123456", "newpwd");
      expect(result.message).toBe("Password reset successfully");
      expect(docClient.update).toHaveBeenCalledWith(expect.objectContaining({
        UpdateExpression: expect.stringContaining("Password"),
      }));
    });
  });
});
