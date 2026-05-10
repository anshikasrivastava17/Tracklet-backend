const docClient = require("../config/dynamoConfig");
const crypto = require("crypto");

const TABLE_NAME = "Products";
const GSI_NAME = "User_Email-index";

// Function to generate Product_ID from URL
const generateProductID = (productURL) => {
  return crypto.createHash("sha256").update(productURL).digest("hex");
};

// Structured logger for CloudWatch
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "product",
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

// Add new product tracking entry
const addProduct = async (userEmail, productURL, threshold, timeout) => {
  const productID = generateProductID(productURL);

  const params = {
    TableName: TABLE_NAME,
    Item: {
      Product_ID: productID,
      User_Email: userEmail,
      Product_URL: productURL,
      Threshold_Value: threshold,
      Timeout_Time: timeout,
      Created_At: new Date().toISOString(),
      NotificationSent: false,
    },
  };

  try {
    await docClient.put(params).promise();
    log("INFO", "PRODUCT_ADDED", { productId: productID.slice(0, 12) });
    return { message: "Product added successfully!", Product_ID: productID };
  } catch (error) {
    log("ERROR", "PRODUCT_ADD_FAILED", { error: error.message });
    throw new Error("Failed to add product.");
  }
};

// Get all products tracked by a user using GSI
const getUserProducts = async (userEmail) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: GSI_NAME,
    KeyConditionExpression: "User_Email = :email",
    ExpressionAttributeValues: {
      ":email": userEmail,
    },
  };

  try {
    const data = await docClient.query(params).promise();
    log("INFO", "PRODUCTS_FETCHED", { count: (data.Items || []).length });
    return data.Items || [];
  } catch (error) {
    log("ERROR", "PRODUCTS_FETCH_FAILED", { error: error.message });
    throw error;
  }
};

// Remove user from product
const removeUserFromProduct = async (userEmail, productID) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { Product_ID: productID, User_Email: userEmail },
  };

  try {
    await docClient.delete(params).promise();
    log("INFO", "PRODUCT_REMOVED", { productId: productID.slice(0, 12) });
    return { message: "User removed from product" };
  } catch (error) {
    log("ERROR", "PRODUCT_REMOVE_FAILED", { productId: productID.slice(0, 12), error: error.message });
    throw new Error("Failed to remove user from product.");
  }
};

// Delete product if no users are tracking it
// Note: Handled mainly by removeUserFromProduct
const deleteProductIfUnused = async (productID) => {
  // Best-effort cleanup
  log("INFO", "PRODUCT_CLEANUP_SKIPPED", {
    productId: productID.slice(0, 12),
    reason: "composite-key table — removeUserFromProduct already deleted the record",
  });
  return { message: "Cleanup handled by removeUserFromProduct" };
};

// Batch cleanup expired products
const cleanupExpiredProducts = async () => {
  const now = new Date();
  let expiredProducts = [];

  try {
    const allProducts = await docClient.scan({ TableName: TABLE_NAME }).promise();

    for (const product of allProducts.Items) {
      const createdAt = new Date(product.Created_At);
      const timeoutMonths = parseInt(product.Timeout_Time, 10);
      const expiryDate = new Date(createdAt);
      expiryDate.setMonth(expiryDate.getMonth() + timeoutMonths);

      if (now >= expiryDate) {
        expiredProducts.push(product);
      }
    }

    if (expiredProducts.length === 0) {
      log("INFO", "CLEANUP_NOTHING_EXPIRED", {});
      return { message: "No expired products to clean." };
    }

    const deleteRequests = expiredProducts.map((product) => ({
      DeleteRequest: {
        Key: { Product_ID: product.Product_ID, User_Email: product.User_Email },
      },
    }));

    const batchParams = { RequestItems: { [TABLE_NAME]: deleteRequests } };
    await docClient.batchWrite(batchParams).promise();

    log("INFO", "CLEANUP_COMPLETE", { removed: expiredProducts.length });
    return { message: `Cleaned up ${expiredProducts.length} expired products.` };
  } catch (error) {
    log("ERROR", "CLEANUP_FAILED", { error: error.message });
    throw new Error("Failed to cleanup expired products.");
  }
};

module.exports = {
  addProduct,
  getUserProducts,
  removeUserFromProduct,
  deleteProductIfUnused,
  cleanupExpiredProducts,
};