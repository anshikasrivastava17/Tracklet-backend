const docClient = require("../config/dynamoConfig");
const { addProduct, getUserProducts } = require("../services/productOperation");

jest.mock("../config/dynamoConfig", () => ({
  put: jest.fn(),
  query: jest.fn(),
  delete: jest.fn(),
}));

describe("Product Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("addProduct", () => {
    it("should successfully add a product and generate a hash", async () => {
      docClient.put.mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });

      const result = await addProduct("test@test.com", "https://amazon.in/test", 1000, 1);
      
      expect(result.message).toBe("Product added successfully!");
      expect(result.Product_ID).toBeDefined();
      
      // Check DynamoDB was called correctly
      expect(docClient.put).toHaveBeenCalledWith(expect.objectContaining({
        TableName: "Products",
        Item: expect.objectContaining({
          User_Email: "test@test.com",
          Product_URL: "https://amazon.in/test",
          Threshold_Value: 1000,
          Timeout_Time: 1,
          NotificationSent: false
        })
      }));
    });
  });

  describe("getUserProducts", () => {
    it("should return products for a user via GSI", async () => {
      docClient.query.mockReturnValue({ 
        promise: jest.fn().mockResolvedValue({ 
          Items: [{ Product_ID: "123", Product_URL: "http://test" }] 
        }) 
      });

      const result = await getUserProducts("test@test.com");
      
      expect(result.length).toBe(1);
      expect(result[0].Product_ID).toBe("123");
      expect(docClient.query).toHaveBeenCalledWith(expect.objectContaining({
        TableName: "Products",
        IndexName: "User_Email-index"
      }));
    });
  });
});
