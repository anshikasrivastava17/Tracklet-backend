require("dotenv").config();

const express = require("express");
const awsServerlessExpress = require("aws-serverless-express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const monitorRoutes = require("./routes/monitorRoutes");
const { monitorProductsAndScrape } = require("./services/monitorService");

const app = express();

/* =========================
   SECURITY MIDDLEWARE
========================= */

// 1. Body size limit — prevents large payload DoS
app.use(express.json({ limit: "10kb" }));

// 2. Security headers
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // XSS protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Don't leak referrer info
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// 3. CORS — restrict to known origins
const ALLOWED_ORIGINS = [
  "https://d193b74kfpr98k.cloudfront.net",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like EventBridge, cron, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

/* =========================
   ROUTES
========================= */
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/monitor", monitorRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* =========================
   🧪 LOCAL TEST ROUTE (IMPORTANT)
========================= */
app.get("/test-monitor", async (req, res) => {
  try {
    console.log("🧪 Manual monitor trigger started...");
    const result = await monitorProductsAndScrape();
    res.json(result);
  } catch (error) {
    console.error("❌ Error in manual trigger:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   CATCH-ALL
========================= */
app.all("*", (req, res) => {
  res.status(404).json({
    message: "Unknown route",
    path: req.path,
    method: req.method,
  });
});

/* =========================
   AWS LAMBDA SETUP
========================= */
const isLambda = !!process.env.AWS_EXECUTION_ENV;

let server;
if (isLambda) {
  server = awsServerlessExpress.createServer(app);
}

const handler = async (event, context) => {
  // 🕒 EventBridge trigger
  if (event?.source === "aws.events") {
    console.log("🕒 EventBridge triggered: Running monitoring...");
    await monitorProductsAndScrape();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Monitoring complete" }),
    };
  }

  // 🌐 API Gateway
  return awsServerlessExpress
    .proxy(server, event, context, "PROMISE")
    .promise;
};

/* =========================
   LOCAL DEVELOPMENT MODE
========================= */
if (!isLambda && process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`✅ Local server running at http://localhost:${PORT}`);
  });

  /* =========================
     OPTIONAL LOCAL CRON
     Enable only when needed
  ========================= */
  if (process.env.ENABLE_LOCAL_CRON === "true") {
    const cron = require("node-cron");

    cron.schedule("*/5 * * * *", async () => {
      console.log("⏱️ Local cron triggered...");
      await monitorProductsAndScrape();
    });
  }
}

// Export Express app for testing and expose Lambda handler
module.exports = app;
module.exports.handler = handler;
