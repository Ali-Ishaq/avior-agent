// Gemini models occasionally return empty content [] after processing tool results.
// This is a known model-level bug where the agent silently swallows the tool output
// without generating a response. This function detects that case, re-invokes the
// agent with a nudge, and falls back to a user-friendly error message if all attempts fail.

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { agent } from "../agent/index.js";

export const handleEmptyAgentResponse = async (response, config) => {
  const MAX_ATTEMPTS = 3;
  let attempt = 0;

  while (
    attempt < MAX_ATTEMPTS &&
    Array.isArray(response.messages.at(-1).content) &&
    response.messages.at(-1).content.length === 0
  ) {
    response = await agent.invoke(
      { messages: [new HumanMessage("What was the result of that?")] },
      config,
    );
    attempt++;
  }

  if (
    Array.isArray(response.messages.at(-1).content) &&
    response.messages.at(-1).content.length === 0
  ) {
    response.messages.push(
      new AIMessage(
        "⚠️ Unable to process the response at this time. Please try again.",
      ),
    );
  }

  return response;
};
