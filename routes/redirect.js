import { Router } from "express";
import {
  handleConsentRedirect,
  handleGmailRedirect,
} from "../controllers/redirect.js";

export const redirectRouter = Router();

redirectRouter.get("/consent", handleConsentRedirect);
redirectRouter.get("/email", handleGmailRedirect);

