import { HumanMessage } from "@langchain/core/messages";
import { agent, getConfig } from "../agent/index.js";
import { sendMessage } from "../services/index.js";
import {handleEmptyAgentResponse} from "../utils/handleEmptyAgentResponse.js";

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

  const config = getConfig({ thread_id: from, phoneNumber: from, waMessageId: messageId });
  let agentResponse = await agent.invoke(
    {
      messages: [new HumanMessage(message)],
    },
    config,
  );
  console.log(
    "Agent Response:",
    agentResponse.messages.slice(-10) || "No content in AI response",
  );

  if (agentResponse.messages.at(-1).content.length <= 0) {
    agentResponse = await handleEmptyAgentResponse(agent, agentResponse, config);
  }
  await sendMessage(from, agentResponse.messages.at(-1).content, messageId);
};
