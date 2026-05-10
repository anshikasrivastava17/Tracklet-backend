const request = require("supertest");
const app = require("../app");
const jwt = require("jsonwebtoken");

// Mock the product operations
jest.mock("../services/productOperation", () => ({
  addProduct: jest.fn().mockResolvedValue({ message: "Product added", Product_ID: "123" }),
  getUserProducts: jest.fn().mockResolvedValue([]),
  removeUserFromProduct: jest.fn().mockResolvedValue({ message: "User removed from product" }),
  deleteProductIfUnused: jest.fn().mockResolvedValue({ message: "Cleanup handled" }),
}));

describe("Product Routes Security", () => {
  const validToken = jwt.sign({ email: "test@test.com" }, "test-secret");

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  // ── Authentication ────────────────────────────────────────────
  it("should reject requests without a token (401)", async () => {
    const res = await request(app).post("/products/track").send({
      productURL: "https://www.amazon.in/dp/B0CX23V",
      threshold: 1000,
      timeout: 1,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── URL Validation ────────────────────────────────────────────
  it("should reject malformed URLs (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "not-a-url", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(400);
  });

  it("should reject non-HTTPS URLs (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "http://www.amazon.in/dp/B0CX23V", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(400);
  });

  // ── Store Support — only 4 stores supported ───────────────────
  it("should reject unsupported stores like flipkart (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.flipkart.com/item/123", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/amazon|nykaa|snapdeal|reliancedigital/i);
  });

  it("should reject unsupported stores like myntra (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.myntra.com/product/123", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(400);
  });

  it("should reject completely random stores (400)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.randomstore.com/item", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(400);
  });

  it("should accept Amazon URLs (201)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.amazon.in/dp/B0CX23V?utm_source=app", threshold: 1000, timeout: 1 });
    expect(res.statusCode).toBe(201);
  });

  it("should accept Nykaa URLs (201)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.nykaa.com/product/xyz", threshold: 500, timeout: 2 });
    expect(res.statusCode).toBe(201);
  });

  it("should accept Snapdeal URLs (201)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.snapdeal.com/product/xyz", threshold: 500, timeout: 2 });
    expect(res.statusCode).toBe(201);
  });

  it("should accept RelianceDigital URLs (201)", async () => {
    const res = await request(app)
      .post("/products/track")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productURL: "https://www.reliancedigital.in/product/xyz", threshold: 500, timeout: 2 });
    expect(res.statusCode).toBe(201);
  });

  // ── Delete / Remove ───────────────────────────────────────────
  it("should reject remove-user without a productID (400)", async () => {
    const res = await request(app)
      .delete("/products/remove-user")
      .set("Authorization", `Bearer ${validToken}`)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  it("should reject remove-user without a token (401)", async () => {
    const res = await request(app)
      .delete("/products/remove-user")
      .send({ productID: "abc123" });
    expect(res.statusCode).toBe(401);
  });

  it("should successfully remove a product tracker (200)", async () => {
    const res = await request(app)
      .delete("/products/remove-user")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ productID: "abc123" });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
  });
});
