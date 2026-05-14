import dotenv from "dotenv";
dotenv.config();
import { PromptTemplate } from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;

const model = new ChatGoogleGenerativeAI({
  temperature: 0.9,
  model: "gemini-2.5-flash",
  apiKey: GEMINI_API_KEY,
});

const prompt = PromptTemplate.fromTemplate(
  "You are a helpful assistant. Answer the following question: {question}",
);

const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);

export { chain };
