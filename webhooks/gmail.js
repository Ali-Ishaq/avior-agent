import { google } from "googleapis";
import { UserToken } from "../model/userToken.js";
import {
  sendMessage,
  sendTemplateMessage,
} from "../services/whatsapp/sendMessage.js";
import { createAuthClient } from "../services/google/generateAuthUrl.js";
import { summarizeEmail } from "../services/google/gmail.js";

export const handleGmailPubSubWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const rawData = req.body?.message?.data;
    if (!rawData) return;
    const payload = JSON.parse(
      Buffer.from(rawData, "base64").toString("utf-8"),
    );

    // payload: { emailAddress: "...", historyId: "..." }
    const { emailAddress, historyId: newHistoryId } = payload;

    const tokens = await UserToken.findOne({ emailAddress });
    if (!tokens) return;

    console.log(
      `Processing Gmail update for ${emailAddress} (historyId: ${newHistoryId})`,
    );
    const auth = createAuthClient(tokens.google.refreshToken);

    const gmail = google.gmail({ version: "v1", auth });

    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: tokens.google.historyId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
    });

    const newMessageIds = (historyRes.data.history || [])
      .flatMap((h) => h.messagesAdded || [])
      .map((m) => m.message && m.message.id)
      .filter(Boolean);

    if (newMessageIds.length === 0) {
      await UserToken.updateOne(
        { emailAddress },
        { "google.historyId": newHistoryId },
      );
      return;
    }

    for (const messageId of newMessageIds) {
      try {
        const {
          from,
          subject,
          summary,
          priority,
        } = await summarizeEmail(messageId, auth);
        await sendTemplateMessage(tokens.phoneNumber, "email_summary_card", [
          [],
          [from, subject, summary, priority],
          [messageId],
        ]);
      } catch (err) {
        console.error(`Failed to process ${messageId}:`, err);
      }
    }

    await UserToken.updateOne(
      { emailAddress },
      { "google.historyId": newHistoryId },
    );
  } catch (err) {
    console.error("Webhook error:", err);
  }
};
