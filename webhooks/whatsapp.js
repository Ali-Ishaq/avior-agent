import { HumanMessage } from "@langchain/core/messages";
import { agent, getConfig } from "../agent/index.js";
import { handleAgentResponse } from "../utils/handleAgentResponse.js";

export const handleWhatsAppWebhookVerify = (req, res) => {
  const { hub_mode, hub_verify_token, hub_challenge } = req.query;
  if (hub_mode && hub_verify_token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(hub_challenge);
  } else {
    res.status(403).send("Forbidden");
  }
};

export const handleWhatsAppWebhookMessage = async (req, res) => {
  const value = req.body.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];

  if (!msg) return;

  const messageContent = msg.text?.body || msg.button?.payload || null;

  if (!messageContent) return;

  console.log("Received webhook message:", messageContent);

  res.status(200).send("Message received");
  const { from, id: messageId } = msg;

  const config = getConfig({
    thread_id: from,
    phoneNumber: from,
    waMessageId: messageId,
  });

  let agentResponse = await agent.invoke(
    {
      messages: [new HumanMessage(messageContent)],
    },
    config,
  );

  await handleAgentResponse(agentResponse, config);
};
