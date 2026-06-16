import { UserToken } from "../../model/userToken.js";
import { createAuthClient } from "./generateAuthUrl.js";
import { google } from "googleapis";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const registerGmailWatch = async (emailAddress, tokens) => {
  const auth = createAuthClient(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.PUBSUB_TOPIC,
      labelIds: ["INBOX"],
    },
  });

  await UserToken.updateOne(
    { emailAddress },
    {
      "google.historyId": res.data.historyId,
      "google.watchExpiry": new Date(Number(res.data.expiration)),
    },
  );
};

export const fetchEmailContent = async (messageId, auth) => {
  const gmail = google.gmail({ version: "v1", auth });

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = msg.data.payload?.headers ?? [];
  const get = (name) => headers.find((h) => h.name === name)?.value ?? "";

  let body = "";
  const parts = msg.data.payload?.parts ?? [];

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      body = Buffer.from(part.body.data, "base64").toString("utf-8");
      break;
    }
  }

  if (!body && msg.data.payload?.body?.data) {
    body = Buffer.from(msg.data.payload.body.data, "base64").toString("utf-8");
  }

  return {
    subject: get("Subject"),
    from: get("From"),
    date: get("Date"),
    body: body.slice(0, 3000),
  };
};

export const summarizeEmail = async (messageId, auth) => {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
  });

  const email = await fetchEmailContent(messageId, auth);

  const response = await model.invoke([
    {
      role: "system",
      content: `You are a personal email assistant. Summarize emails concisely.
Respond ONLY with a valid JSON object — no markdown, no code fences, no extra text.
The JSON must have exactly these keys:
{
  "from": "<sender>",
  "subject": "<subject>",
  "summary": "<2-3 sentence summary>",
  "priority": "<High | Medium | Low>"
}`,
    },
    {
      role: "user",
      content: `From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
${email.body}`,
    },
  ]);

  const parsed = JSON.parse(response.content);

  return parsed;
};
