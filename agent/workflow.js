import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

import { agentNode, shouldUseTool, toolNode } from "./nodes.js";

const client = new MongoClient(process.env.MONGO_URI);
const checkpointer = new MongoDBSaver({ client });

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldUseTool)
  .addEdge("tools", "agent");

export const agent = workflow.compile({ checkpointer });
