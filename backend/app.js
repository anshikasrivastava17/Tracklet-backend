const express = require("express");
const awsServerlessExpress = require("aws-serverless-express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const monitorRoutes = require("./routes/monitorRoutes");
const { monitorProductsAndScrape } = require("./services/monitorService");

// Note: 'node-cron' has been removed because AWS EventBridge handles scheduling in the cloud

const app = express();
app.use(express.json());
app.use(cors());

// Use routes
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/monitor", monitorRoutes);

app.get("/", (req, res) => {
  res.send("Hello from AWS Lambda");
});

app.all('*', (req, res) => {
  res.json({
      message: "Unknown route",
      path: req.path,
      method: req.method,
      headers: req.headers
  });
});

// Create AWS Lambda handler
const server = awsServerlessExpress.createServer(app);

exports.handler = async (event, context) => {
  // 1. Intercept Amazon EventBridge Scheduled Events (Your new cloud Cron job)
  if (event.source === 'aws.events') {
    console.log("🕒 EventBridge triggered: Running scheduled product monitoring...");
    await monitorProductsAndScrape();
    return { statusCode: 200, body: 'Monitoring complete' };
  }

  // 2. Normal API Gateway Web Requests (Pass standard HTTP traffic to Express)
  return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
};

// 3. Local Development Fallback
// This will automatically run the local server ONLY if you aren't in an AWS production environment
if (process.env.NODE_ENV !== 'production' && process.env.AWS_EXECUTION_ENV === undefined) {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running locally on http://localhost:${PORT}`);
    console.log(`⚠️ Reminder: Cron jobs are disabled in app.js. Use EventBridge in production.`);
  });
}