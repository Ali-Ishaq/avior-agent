import { HumanMessage } from "@langchain/core/messages";
import { agent, config } from "../ai/index.js";
import { sendMessage } from "../services/index.js";

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
    req.body.entry[0].changes[0].value.messages[0],
  );
  res.status(200).send("Message received");
  const {
    from,
    id: messageId,
    text: { body: message },
  } = req.body.entry[0].changes[0].value.messages[0];

  const AiResponse = await agent.invoke(
    {
      messages: [new HumanMessage(message)],
    },
    config,
  );
  await sendMessage(from, AiResponse.messages.at(-1).content, messageId);
};
