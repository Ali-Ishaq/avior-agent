import dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import {
  HumanMessage,
  SystemMessage,
  trimMessages,
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";
import { MemorySaver } from "@langchain/langgraph";
import { isTokenExpired } from "../services/google/isTokenExpired.js";
import { oauth2Client } from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";

const websearch = new TavilySearch({
  maxResults: 3,
  topic: "general",
  tavilyApiKey: process.env.TAVILY_API_KEY,
});

const gmailTool = tool(
  async ({ to, subject, body }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone) return "No phone number found in config.";

    const userTokenDoc = await UserToken.findOne({ phoneNumber: phone });
    if (!userTokenDoc) return `No token document found for: ${phone}`;

    let tokens = userTokenDoc.google;
    if (!tokens?.accessToken) return `No access token found for: ${phone}`;

    if (isTokenExpired(tokens.expiryDate)) {
      console.log(`Access token for ${phone} is expired. Refreshing...`);
      try {
        oauth2Client.setCredentials({ refresh_token: tokens.refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();

        const updated = await UserToken.findOneAndUpdate(
          { phoneNumber: phone },
          {
            google: {
              accessToken: credentials.access_token,
              refreshToken: tokens.refreshToken,
              expiryDate: credentials.expiry_date,
            },
          },
          { new: true },
        );
        tokens = updated.google;
        console.log(`Access token refreshed for ${phone}`);
      } catch (error) {
        console.error(`Failed to refresh token for ${phone}:`, error);
        return `Token refresh failed for ${phone}: ${error.message}`;
      }
    }

    const { accessToken } = tokens;

    const raw = Buffer.from(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
      ].join("\r\n"),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return `❌ Failed: ${err.error?.message}`;
    }

    const result = await res.json();
    return `✅ Email sent to ${to}! Message ID: ${result.id}`;
  },
  {
    name: "send_gmail",
    description: `Send an email via Gmail. Only call when you have recipient email, subject, and body. Never guess an email address.`,
    schema: z.object({
      to: z.string().email().describe("Recipient's email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Full email body"),
    }),
  },
);

const tools = [websearch, gmailTool];
const toolNode = new ToolNode(tools);
const memory = new MemorySaver();

export const getConfig = (phoneNumber) => ({
  configurable: { thread_id: phoneNumber, phoneNumber },
});

const SYSTEM_PROMPT = `
You are a smart personal assistant. You help users get things done using the tools available to you.

CURRENT TOOLS:
- send_gmail  → send emails on behalf of the user
- web_search  → search the web for real-time or factual information

GENERAL RULES:
- Use tools only when necessary — answer from knowledge if you already know.
- Use web_search when the task involves current, real-time, or uncertain information.
- Ask for ONE missing detail at a time. Never overwhelm the user.

EMAIL WORKFLOW — follow these steps IN ORDER, never skip any:

  STEP 1 — COLLECT REQUIRED INFO
    - Recipient's full email address → if missing, ask for it
    - Never guess or assume an email address

  STEP 2 — RESOLVE SENDER IDENTITY
    - If the email body would need a sender name or signature → ask: "What name should I sign the email with?"
    - Never leave placeholders like [Your Name] in the email

  STEP 4 — DRAFT & SHOW PREVIEW
    - Write a complete, professional email with no placeholders
    - Always show the preview in this exact format:

        📧 To      : <email>
        📌 Subject : <subject>

        <full email body>

        ─────────────────
        Shall I send this?

  STEP 5 — WAIT FOR CONFIRMATION
    - STOP and wait for user response after showing the preview — this is a hard rule 
    - ONLY proceed to send if user says yes / send it / go ahead / looks good
    - If user requests changes → revise and show preview again
    - NEVER call send_gmail without explicit confirmation — this is a hard rule

  STEP 6 — SEND & CONFIRM
    - Call send_gmail with the final confirmed email
    - After the tool returns success, always respond with a friendly confirmation:
      Example: "✅ Done! Your email to Ali has been sent successfully."
    - Never return an empty response after a tool call
`;

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-lite",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0.7,
  maxRetries: 2,
  maxOutputTokens: 1000,
}).bindTools(tools);

const agentNode = async (state) => {
  // const trimmed = await trimMessages(state.messages, {
  //   maxTokens: 5000,
  //   strategy: "last",
  //   includeSystem: false,
  // });
  let response;
  try {
    response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ]);
  } catch (error) {
    console.error("Agent node error:", error.message);
    const response = "❌ Oops, something went wrong. Please try again.";
    return { messages: [new HumanMessage(response)] };
  }

  return { messages: [response] };
};

const shouldUseTool = (state) => {
  const last = state.messages.at(-1);
  return last.tool_calls?.length > 0 ? "tools" : "__end__";
};

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldUseTool)
  .addEdge("tools", "agent");

export const agent = workflow.compile({ checkpointer: memory });
