import { generateAuthUrl,generateGmailUrl } from "../services/google/generateAuthUrl.js";

export const handleConsentRedirect = (req, res) => {
  const { state } = req.query;
  const consentUrl = generateAuthUrl(state);
  res.redirect(consentUrl);
};

export const handleGmailRedirect = (req, res) => {
  const { msg } = req.query;
  const gmailUrl = generateGmailUrl(msg);
  res.redirect(gmailUrl);
};

