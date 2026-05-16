import * as readline from "node:readline/promises";
import process from "node:process";
import { agent, config } from "./index.js";
import { HumanMessage } from "@langchain/core/messages";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function runChatLoop() {
  while (true) {
    const userQuestion = await rl.question("\nYou: ");

    if (userQuestion.toLowerCase() === "exit") {
      console.log("Goodbye!");
      break;
    }

    const result = await agent.invoke(
      {
        messages: [new HumanMessage(userQuestion)],
      },
      config,
    );

    console.log("\nAI:");
    console.log(result.messages.at(-1).content);
    console.log("Full messages:", result.messages);
  }

  rl.close();
}

if (import.meta.url === process.argv[1] || process.argv[1].endsWith("chatLoop.js")) {
  // Allow running directly: `node ai/chatLoop.js`
  runChatLoop().catch((err) => {
    console.error("Chat loop error:", err);
    rl.close();
    process.exit(1);
  });
}

export default runChatLoop;
