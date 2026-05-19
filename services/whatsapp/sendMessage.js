import axios from "axios";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

export const sendMessage = async (to, text, messageId) => {
  try {
    console.log("Sending message:", { to, text, messageId });
    let payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };

    if (messageId) {
      payload.context = {
        message_id: messageId,
      };
    }

    const response = await axios.post(API_URL, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Message sent:", response.data);
    return response.data;
  } catch (err) {
    console.error("Send error:", err.response?.data || err.message);
  }
};
