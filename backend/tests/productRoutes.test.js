const request = require("supertest");
const app = require("../app"); // Exported app from app.js
const jwt = require("jsonwebtoken");

// Mock the product operations
jest.mock("../services/productOperation", () => ({
  addProduct: jest.fn().mockResolvedValue({ message: "Product added", Product_ID: "123" }),
  getUserProducts: jest.fn().mockResolvedValue([]),
  removeUserFromProduct: jest.fn().mockResolvedValue(),
  deleteProductIfUnused: jest.fn().mockResolvedValue(),
}));

describe("Product Routes Security", () => {
  const validToken = jwt.sign({ email: "test@test.com" }, "test-secret");
  
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  it("should reject requests without a token (401)", async () => {
    const res = await request(app).post("/products/track").send({
      productURL: "https://www.amazon.in/dp/B0CX23V",
      threshold: 1000,
      timeout: 1
    });
    expect(res.statusCode).toBe(401);
  });

  it("should reject malformed URLs (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        productURL: "not-a-url",
        threshold: 1000,
        timeout: 1
      });
    expect(res.statusCode).toBe(400);
  });

  it("should reject non-HTTPS URLs (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        productURL: "http://www.amazon.in/dp/B0CX23V",
        threshold: 1000,
        timeout: 1
      });
    expect(res.statusCode).toBe(400);
  });

  it("should reject unsupported stores (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        productURL: "https://www.randomstore.com/item",
        threshold: 1000,
        timeout: 1
      });
    expect(res.statusCode).toBe(400);
  });

  it("should accept valid requests with token (201)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        productURL: "https://www.amazon.in/dp/B0CX23V?utm_source=app", // Should be cleaned
        threshold: 1000,
        timeout: 1
      });
    expect(res.statusCode).toBe(201);
  });
});
