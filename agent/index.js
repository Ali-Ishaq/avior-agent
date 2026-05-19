import "../config/loadEnv.js";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import {
  AIMessage,
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
import {
  oauth2Client,
  generateAuthUrl,
} from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

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
    if (!userTokenDoc) {
      const authUrl = generateAuthUrl(phone);
      return `AUTH_REQUIRED: ${authUrl}`;
    }

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
              refreshToken: credentials.refresh_token || tokens.refreshToken, // keep old refresh token if new one isn't provided
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

const client = new MongoClient(process.env.MONGO_URI);
const checkpointer = new MongoDBSaver({ client: client });

export const getConfig = (phoneNumber) => ({
  configurable: { thread_id: phoneNumber, phoneNumber },
});

const SYSTEM_PROMPT = `
You are a smart personal assistant that helps users get things done.

AVAILABLE TOOLS:
- send_gmail  → send an email on the user's behalf
- web_search  → look up real-time or factual information

GENERAL RULES:
- Use tools only when necessary — answer from knowledge if you already know.
- Use web_search when the task involves current, real-time, or uncertain information.
- Ask for ONE missing detail at a time. Never overwhelm the user.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — NEVER send without showing a preview first.
  You must ALWAYS show the email preview and ask "Shall I send this?" before
  calling send_gmail. No exceptions. Even if the user gives you every detail
  upfront, you still show the preview first.

RULE 2 — NEVER call send_gmail without the user saying yes.
  Only send after the user explicitly confirms with something like:
  "yes", "send it", "go ahead", "looks good".
  A send request is NOT confirmation — it is a request to draft and preview.

RULE 3 — Fill in missing details yourself. Don't ask unnecessarily.
  - No subject? → Invent a short, professional one.
  - No recipient name? → Use "Hello," or "Dear Sir/Madam,".
  - Only ask if something is truly impossible to infer or invent.
  - Never use an email address as a greeting (e.g. never "Dear ali@gmail.com").

RULE 4 — Always respond with text after a tool call. Never return empty.
  - If send_gmail succeeds → "✅ Your email has been sent successfully."
  - If send_gmail returns an auth URL → show this message exactly:
      "📬 You need to connect your Gmail account before I can send emails.
       👉 [Authorize Gmail](<url>)
       Once you've authorized, just let me know and I'll send it right away."
  - Any other error → explain it plainly and ask if the user wants to retry.

RULE 5 — NEVER claim an email was sent unless send_gmail tool returned a success message.
  - "✅ Email sent" in the tool result = success → confirm to user
  - Anything else = do not say it was sent
  - If user says they've authorized → call send_gmail again. Do not assume it was sent.
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL PREVIEW FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Always show the preview exactly like this before sending:

  📧 To      : <email>
  📌 Subject : <subject>

  <full email body>

  ─────────────────
  Shall I send this?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User: "send an email to x@y.com about Z, choose subject, sign as Bob"
✅ Draft email → show preview → ask "Shall I send this?" → wait
❌ Call send_gmail immediately
❌ Ask for the subject

User: "yes" (after seeing preview)
✅ Call send_gmail → confirm success
❌ Show the preview again
❌ Ask for more confirmation

User: "send it to john@x.com" (no subject, no name, no body details)
✅ Invent subject, write body, use "Hello," as greeting → show preview
❌ Ask "What subject should I use?"
❌ Ask "What name should I sign with?"
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
    return { messages: [new AIMessage(response)] };
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

export const agent = workflow.compile({ checkpointer });
