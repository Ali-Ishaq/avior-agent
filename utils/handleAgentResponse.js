import {
  sendMessage,
  sendTemplateMessage,
} from "../services/whatsapp/sendMessage.js";
import { handleEmptyAgentResponse } from "./handleEmptyAgentResponse.js";

export const handleAgentResponse = async (agentResponse, config) => {
  try {
    console.log(
      "Agent Response:",
      agentResponse.messages.slice(-10) || "No content in AI response",
    );

    //   Gemini models occasionally return empty content [] after processing tool results.
    // This is a known model-level bug where the agent silently swallows the tool output
    // without generating a response. This function detects that case, re-invokes the
    // agent with a nudge, and falls back to a user-friendly error message if all attempts fail.
    if (agentResponse.messages.at(-1).content.length <= 0) {
      agentResponse = await handleEmptyAgentResponse(agentResponse, config);
    }

    // Find the last ToolMessage in the entire messages array
    const toolMsg = [...agentResponse.messages]
      .reverse()
      .find((m) => m.tool_call_id !== undefined);

    const lastToolMessage = toolMsg?.content
      ? JSON.parse(toolMsg.content)
      : null;

    if (
      lastToolMessage &&
      lastToolMessage.status === "error" &&
      lastToolMessage.reason.startsWith("AUTH_REQUIRED")
    ) {
      let authUrl = lastToolMessage.reason.split("AUTH_REQUIRED: ")[1].trim();
      await sendTemplateMessage(
        config.configurable.phoneNumber,
        "account_authorization ",
        [
          [
            "https://res.cloudinary.com/drwizlf0y/image/upload/v1781123070/Google_Favicon_2025_a7dsia.png",
          ],
          ["this task"],
          [config.configurable.phoneNumber],
        ],
        config.configurable.waMessageId,
      );
    } else {
      await sendMessage(
        config.configurable.phoneNumber,
        agentResponse.messages.at(-1).content,
        config.configurable.waMessageId,
      );
    }
  } catch (error) {
    console.error("Error handling agent response:", error.message);
    await sendMessage(
      config.configurable.phoneNumber,
      "⚠️ Unable to process the response at the moment. Please try again.",
      config.configurable.waMessageId,
    );
  }
};
