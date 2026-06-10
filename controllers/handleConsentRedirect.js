import { generateAuthUrl } from "../services/google/generateAuthUrl.js";

export const handleConsentRedirect = (req, res) => {
  const { state } = req.query;
  const consentUrl = generateAuthUrl(state);
  res.redirect(consentUrl);
};
