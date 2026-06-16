import "../config/loadEnv.js";
import { google } from "googleapis";
import { sendMessage } from "../services/index.js";
import { createAuthClient } from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";
import { registerGmailWatch } from "../services/google/gmail.js";

export const googleAuthHandler = async (req, res) => {
  const { code, state: phoneNumber, error } = req.query;

  if (error) {
    await sendMessage(
      phoneNumber,
      "❌ Gmail connection cancelled. Send a message if you'd like to try again.",
    );
    return res.send("<h3>❌ Cancelled. You can close this tab.</h3>");
  }

  try {
    const auth = createAuthClient();
    const { tokens: rawTokens } = await auth.getToken(code);

    auth.setCredentials(rawTokens);

    const oauth2 = google.oauth2({
      auth,
      version: "v2",
    });

    const googleTokens = {
      accessToken: rawTokens.access_token,
      refreshToken: rawTokens.refresh_token,
      expiryDate: rawTokens.expiry_date,
    };

    const {
      data: { email: emailAddress },
    } = await oauth2.userinfo.get();

    const userTokens = await UserToken.findOneAndUpdate(
      { phoneNumber },
      {
        $set: {
          emailAddress: emailAddress,
          google: googleTokens,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      },
    );

    try {
      await registerGmailWatch(emailAddress, rawTokens.refresh_token);
    } catch (err) {
      console.error("Status:", err.status);
      console.error("Message:", err.message);
      console.error("Errors:", JSON.stringify(err.errors, null, 2));
      console.error(
        "Response data:",
        JSON.stringify(err.response?.data, null, 2),
      );
    }

    await sendMessage(
      phoneNumber,
      "✅ Your Google account is connected! You can now ask me to do google related tasks.",
    );
    res.send("<h3>✅ Google Account Connected! You can close this tab.</h3>");
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    await sendMessage(
      phoneNumber,
      "❌ Something went wrong. Please try again.",
    );
    res.status(500).send("<h3>Authentication failed. Please try again.</h3>");
  }
};
