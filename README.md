# Tracklet Backend

Backend API for Tracklet — a price tracking tool that monitors e-commerce products and sends email alerts when prices drop below user-defined thresholds.

## Tech Stack
- **Runtime**: Node.js + Express
- **Database**: AWS DynamoDB
- **Scraping**: Puppeteer
- **Email**: Nodemailer (Gmail SMTP)

## API Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/signup` | Register a new user |
| POST | `/auth/login` | Authenticate a user |
| POST | `/products/track` | Start tracking a product |
| GET | `/products/user-products?email=` | Get user's tracked products |
| DELETE | `/products/remove-user` | Remove a product tracker |
| GET | `/monitor/monitor` | Manually trigger price monitoring |