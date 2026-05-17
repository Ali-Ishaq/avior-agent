import { sendMessage } from "../services/index.js";
import { oauth2Client } from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";

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
    const { tokens: rawTokens } = await oauth2Client.getToken(code);

    const userTokens =await UserToken.findOneAndUpdate(
      { phoneNumber },
      { google: rawTokens },
      { new: true }
    );
    // tokens.save(phoneNumber, rawTokens);
    console.log("Stored tokens for", phoneNumber, userTokens.google);
    await sendMessage(
      phoneNumber,
      "✅ Gmail connected! You can now ask me to send emails.",
    );
    res.send("<h3>✅ Gmail Connected! You can close this tab.</h3>");
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    await sendMessage(
      phoneNumber,
      "❌ Something went wrong. Please try again.",
    );
    res.status(500).send("<h3>Authentication failed. Please try again.</h3>");
  }
};
