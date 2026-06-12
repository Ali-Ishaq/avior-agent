import { HumanMessage } from "@langchain/core/messages";
import { agent, getConfig } from "../agent/index.js";
import { sendMessage } from "../services/index.js";
import { sendTemplateMessage } from "../services/whatsapp/sendMessage.js";
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
  console.log(
    "Received webhook message:",
    req.body.entry[0]?.changes[0]?.value.messages[0]?.text?.body ||
      "No message text found",
  );
  res.status(200).send("Message received");
  const {
    from,
    id: messageId,
    text: { body: message },
  } = req.body.entry[0].changes[0].value.messages[0];

  const config = getConfig({
    thread_id: from,
    phoneNumber: from,
    waMessageId: messageId,
  });
  let agentResponse = await agent.invoke(
    {
      messages: [new HumanMessage(message)],
    },
    config,
  );

   await handleAgentResponse(agentResponse, config);
};
