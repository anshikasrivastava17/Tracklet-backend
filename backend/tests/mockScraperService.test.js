const { scrapeProductPrice } = require("../services/mockScraperService");

describe("Mock Scraper Service", () => {
  it("should return a price for Amazon URLs", async () => {
    const price = await scrapeProductPrice("https://www.amazon.in/dp/B0CX23V");
    expect(price).toBeDefined();
    expect(typeof price).toBe("string");
    // Should be purely numbers and commas
    expect(price).toMatch(/^[0-9,]+$/);
  });

  it("should return a price for Nykaa URLs", async () => {
    const price = await scrapeProductPrice("https://www.nykaa.com/some-product");
    expect(price).toBeDefined();
    expect(typeof price).toBe("string");
  });

  it("should return null for unsupported URLs", async () => {
    const price = await scrapeProductPrice("https://www.unknown.com/test");
    expect(price).toBeNull();
  });
});
