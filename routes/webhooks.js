import { Router } from "express";
import { handleGmailPubSubWebhook, handleWhatsAppWebhookMessage,handleWhatsAppWebhookVerify } from "../webhooks/index.js";

export const webhookRouter = Router();

webhookRouter.get("/whatsapp", handleWhatsAppWebhookVerify);
webhookRouter.post("/whatsapp", handleWhatsAppWebhookMessage);
webhookRouter.post("/gmail", handleGmailPubSubWebhook);