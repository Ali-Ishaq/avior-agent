import { Router } from "express";
import { googleAuthHandler } from "../controllers/auth.js";

export const authRouter = Router();
 
authRouter.get("/google/callback",googleAuthHandler);