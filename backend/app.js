const express = require("express");
const awsServerlessExpress = require("aws-serverless-express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const monitorRoutes = require("./routes/monitorRoutes");
const cron = require("node-cron");  
const { monitorProductsAndScrape } = require("./services/monitorService");
const PORT = 3000;

const app = express();
app.use(express.json());
app.use(cors());

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/monitor", monitorRoutes);

app.get("/", (req, res) => {
  res.send("Hello from AWS lambda");
});

app.all('*', (req, res) => {
  res.json({
      message: "Unknown route",
      path: req.path,
      method: req.method,
      headers: req.headers
  });
});

// Start Cron Job (runs every 3 minutes)
cron.schedule("*/3 * * * *", async () => {
  console.log("🕒 Running scheduled product monitoring...");
  await monitorProductsAndScrape();
}, {
  timezone: "Asia/Kolkata" // adjust timezone if needed
});


//Create AWS Lambda handler
// const server = awsServerlessExpress.createServer(app);

// exports.handler = (event, context) => {
//   return awsServerlessExpress.proxy(server, event, context);
// };

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});