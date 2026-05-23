import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  AIMessage,
  SystemMessage,
  trimMessages,
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { tools } from "./tools.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const model = new ChatGoogleGenerativeAI({
  model: "gemini-3-flash-preview",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0.7,
  maxRetries: 2,
  maxOutputTokens: 1000,
}).bindTools(tools);

export const toolNode = new ToolNode(tools);

export const agentNode = async (state) => {
  // const trimmed = await trimMessages(state.messages, {
  //   maxTokens: 5000,
  //   strategy: "last",
  //   includeSystem: false,
  // });
  const trimmed = await trimMessages(state.messages, {
    maxTokens: 10, // here this means "max 10 messages"
    strategy: "last",
    tokenCounter: (msgs) => msgs.length, // count messages, not tokens
    includeSystem: false,
  });

  // Remove error messages from history so they don't confuse the model
  const cleanedMessages = trimmed.filter(
    (msg) =>
      !(
        (msg.content?.includes("❌ Oops, something went wrong") ||
          msg.content?.includes("I'm sorry, I encountered an error")) &&
        msg.id[2] === "AIMessage"
      ),
  );

  try {
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      ...trimmed,
    ]);

    return { messages: [response] };
  } catch (error) {
    console.error("Agent node error:", error.message);
    const responseText = "❌ Oops, something went wrong. Please try again.";
    return { messages: [new AIMessage(responseText)] };
  }
};

export const shouldUseTool = (state) => {
  const last = state.messages.at(-1);
  return last.tool_calls?.length > 0 ? "tools" : "__end__";
};
