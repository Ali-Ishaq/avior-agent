import express from "express";
import dotenv from "dotenv";

import {
  handleWhatsAppWebhookVerify,
  handleWhatsAppWebhookMessage,
} from "./webhooks/index.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/webhook", handleWhatsAppWebhookVerify);
app.post("/webhook", handleWhatsAppWebhookMessage);

app.get("/", (req, res) => {
  res.send("Hello from Avior Agent!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running locally at http://localhost:${PORT}`);
});
