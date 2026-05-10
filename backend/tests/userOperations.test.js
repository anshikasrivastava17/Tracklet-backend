process.env.JWT_SECRET = "test-secret";

const docClient = require("../config/dynamoConfig");
const { signupUser, loginUser } = require("../services/userOperations");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

jest.mock("../config/dynamoConfig", () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  genSalt: jest.fn().mockResolvedValue("salt"),
  hash: jest.fn().mockResolvedValue("hashedPassword"),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("fake-jwt-token"),
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
      expect(docClient.put).toHaveBeenCalledWith({
        TableName: "Users",
        Item: { Email: "new@test.com", FullName: "Test", Password: "hashedPassword" }
      });
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
});
