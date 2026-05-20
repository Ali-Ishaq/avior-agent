import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";

import { isTokenExpired } from "../services/google/isTokenExpired.js";
import {
  oauth2Client,
  generateAuthUrl,
} from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";

export const websearch = new TavilySearch({
  maxResults: 3,
  topic: "general",
  tavilyApiKey: process.env.TAVILY_API_KEY,
});

export const gmailTool = tool(
  async ({ to, subject, body }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone) return "No phone number found in config.";

    const getTokenResult = await getAccessToken(phone);

    if (getTokenResult.status === "failed") {
      return getTokenResult.message;
    }

    const { accessToken } = getTokenResult;

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


const getAccessToken = async (phone) => {
  const userTokenDoc = await UserToken.findOne({ phoneNumber: phone });
  if (!userTokenDoc) {
    const authUrl = generateAuthUrl(phone);

    return {
      status: "failed",
      message: `AUTH_REQUIRED: ${authUrl}`,
    };
  }

  let tokens = userTokenDoc.google;

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
      return {
        status: "failed",
        message: `Token refresh failed for ${phone}: ${error.message}`,
      };
    }
  }

  return {
    status: "success",
    tokens: tokens,
  };
};
export const tools = [websearch, gmailTool];
