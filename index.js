import "./config/loadEnv.js";
import express from "express";

import {
  handleWhatsAppWebhookVerify,
  handleWhatsAppWebhookMessage,
} from "./webhooks/index.js";
import { authRouter } from "./routes/auth.js";

import { connectDB } from "./config/db.js";
import {startCronRunner} from "./agent/cronRunner.js";
import { webhookRouter } from "./routes/webhooks.js";

const app = express();
app.use(express.json());

// app.get("/webhook", handleWhatsAppWebhookVerify);
// app.post("/webhook", handleWhatsAppWebhookMessage);
app.use("/webhook", webhookRouter);

app.get("/", (req, res) => {
  res.send("Hello from Avior Agent!");
});

app.use("/auth", authRouter);

const startServer = async () => {
  try {
    await connectDB(); // wait for DB before doing anything
    await startCronRunner(); // start cron runner after DB is connected
    

    const server = app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000}`);
    });

    // Handle server-level errors (e.g. port already in use)
    server.on("error", (err) => {
      console.error("Server error:", err.message);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
};
startServer();
