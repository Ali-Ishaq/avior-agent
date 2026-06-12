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

export const sendTemplateMessage = async (
  to,
  templateName,
  params = [[], [], []],
  messageId,
) => {
  try {
    console.log("Sending template message:", {
      to,
      templateName,
      params,
      messageId,
    });

    const [headerParams, bodyParams, buttonParams] = params;

    const components = [];

    if (headerParams?.length > 0) {
      components.push({
        type: "header",
        parameters: headerParams.map((value) => ({
          type: value.startsWith("http") ? "image" : "text",
          ...(value.startsWith("http")
            ? { image: { link: value } }
            : { text: String(value) }),
        })),
      });
    }

    if (bodyParams?.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParams.map((value) => ({
          type: "text",
          text: String(value),
        })),
      });
    }

    if (buttonParams?.length > 0) {
      buttonParams.forEach((value, index) => {
        components.push({
          type: "button",
          sub_type: "url",
          index: String(index),
          parameters: [{ type: "text", text: String(value) }],
        });
      });
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components,
      },
      ...(messageId && { context: { message_id: messageId } }),
    };
    console.log("Constructed payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(API_URL, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Template message sent:", response.data);
    return response.data;
  } catch (err) {
    console.error("Send template error:", err.response?.data || err.message);
  }
};
