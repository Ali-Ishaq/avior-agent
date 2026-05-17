import express from "express";
import dotenv from "dotenv";

import {
  handleWhatsAppWebhookVerify,
  handleWhatsAppWebhookMessage,
} from "./webhooks/index.js";
import { authRouter } from "./routes/auth.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/webhook", handleWhatsAppWebhookVerify);
app.post("/webhook", handleWhatsAppWebhookMessage);

app.get("/", (req, res) => {
  res.send("Hello from Avior Agent!");
});

app.use("/auth", authRouter);

