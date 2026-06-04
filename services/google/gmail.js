import { UserToken } from "../../model/userToken.js";
import { oauth2Client } from "./generateAuthUrl.js";
import { google } from "googleapis";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";


export const registerGmailWatch = async (emailAddress, tokens) => {
  const auth = oauth2Client;
  auth.setCredentials(tokens);
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

  // Extract plain text body
  let body = "";
  const parts = msg.data.payload?.parts ?? [];

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      body = Buffer.from(part.body.data, "base64").toString("utf-8");
      break;
    }
  }

  // Fallback: simple email (no multipart)
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

  // Single-shot summarization
  const response = await model.invoke([
    {
      role: "system",
      content: `You are a personal email assistant. Summarize emails concisely for WhatsApp.
Format your response exactly like this:
👤 *From:* <sender>

📌 *Subject:* <subject>

📝 *Summary:* <2-3 sentence summary>

⚡ *Action needed:* <yes/no and what, or "None">

🔴🟡🟢 *Priority:* <High/Medium/Low>`,
    },
    {
      role: "user",
      content: `From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
${email.body}`,
    },
  ]);

  return response.content;
};
