import dotenv from "dotenv";
dotenv.config();

import { PromptTemplate } from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";
import { MemorySaver } from "@langchain/langgraph";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const websearch = new TavilySearch({
  maxResults: 3,
  topic: "general",
  tavilyApiKey: TAVILY_API_KEY,
  // includeAnswer: false,
  // includeRawContent: false,
  // includeImages: false,
  // includeImageDescriptions: false,
  // searchDepth: "basic",
  // timeRange: "day",
  // includeDomains: [],
  // excludeDomains: [],
});

const tools = [websearch];
const toolNode = new ToolNode(tools);

const memory = new MemorySaver();
export const config = { configurable: { thread_id: "user-123" } };

const model = new ChatGoogleGenerativeAI({
  temperature: 2,
  model: "gemini-2.5-flash-lite",
  apiKey: GOOGLE_API_KEY,
  maxRetries: 2,
}).bindTools(tools);

const agentNode = async (state) => {
  const response = await model.invoke([
    new SystemMessage(
      "You are a helpful assistant. Use the web search tool whenever you need current, real-time, or recent information such as weather, news, or live data.",
    ),
    ...state.messages,
  ]);
  return { messages: [response] };
};

const shouldUseTool = (state) => {
  const last = state.messages.at(-1);
  if (last.tool_calls?.length > 0) return "tools";
  return "__end__"; // or END constant
};
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldUseTool)
  .addEdge("tools", "agent");

export const agent = workflow.compile({ checkpointer: memory });

