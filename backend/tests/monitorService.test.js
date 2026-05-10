process.env.USE_MOCK_SCRAPER = "true";
process.env.SEND_EMAILS = "true";

const { monitorProductsAndScrape } = require("../services/monitorService");
const docClient = require("../config/dynamoConfig");
const { scrapeProductPrice } = require("../services/mockScraperService");
const { saveScrapeResult } = require("../services/scrapingService");
const { sendPriceDropAlert } = require("../services/emailService");

jest.mock("../config/dynamoConfig", () => ({
  scan: jest.fn(),
  update: jest.fn(),
}));

jest.mock("../services/mockScraperService", () => ({
  scrapeProductPrice: jest.fn(),
}));

jest.mock("../services/scrapingService", () => ({
  saveScrapeResult: jest.fn(),
}));

jest.mock("../services/emailService", () => ({
  sendPriceDropAlert: jest.fn(),
}));

describe("Monitor Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return empty message if no products tracked", async () => {
    docClient.scan.mockReturnValue({ promise: jest.fn().mockResolvedValue({ Items: [] }) });
    
    const result = await monitorProductsAndScrape();
    
    expect(result.message).toBe("No products to monitor.");
  });

  it("should trigger email when price drops below threshold", async () => {
    // 1 Product, threshold is 15000
    docClient.scan.mockReturnValue({ 
      promise: jest.fn().mockResolvedValue({ 
        Items: [{
          Product_ID: "123",
          User_Email: "test@test.com",
          Product_URL: "https://amazon.in/test",
          Threshold_Value: 15000,
          NotificationSent: false
        }] 
      }) 
    });

    // Scraper returns 14000
    scrapeProductPrice.mockResolvedValue("14,000");
    
    // update NotificationSent mock
    docClient.update.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });

    const result = await monitorProductsAndScrape();

    expect(result.stats.total).toBe(1);
    expect(result.stats.priceDrops).toBe(1);
    
    // Verify email sent
    expect(sendPriceDropAlert).toHaveBeenCalledWith("test@test.com", "https://amazon.in/test", 14000);
    
    // Verify DB update
    expect(docClient.update).toHaveBeenCalled();
  });

  it("should NOT trigger email when price is above threshold", async () => {
    docClient.scan.mockReturnValue({ 
      promise: jest.fn().mockResolvedValue({ 
        Items: [{
          Product_ID: "123",
          User_Email: "test@test.com",
          Product_URL: "https://amazon.in/test",
          Threshold_Value: 10000, // lower threshold
          NotificationSent: false
        }] 
      }) 
    });

    scrapeProductPrice.mockResolvedValue("14,000");

    const result = await monitorProductsAndScrape();

    expect(result.stats.priceDrops).toBe(0);
    expect(sendPriceDropAlert).not.toHaveBeenCalled();
    expect(docClient.update).not.toHaveBeenCalled();
  });

  it("should skip products that already have NotificationSent=true", async () => {
    docClient.scan.mockReturnValue({ 
      promise: jest.fn().mockResolvedValue({ 
        Items: [{
          Product_ID: "123",
          User_Email: "test@test.com",
          Product_URL: "https://amazon.in/test",
          Threshold_Value: 15000,
          NotificationSent: true // Already notified
        }] 
      }) 
    });

    const result = await monitorProductsAndScrape();

    expect(result.stats.skipped).toBe(1);
    expect(scrapeProductPrice).not.toHaveBeenCalled();
    expect(sendPriceDropAlert).not.toHaveBeenCalled();
  });
});
