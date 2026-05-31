import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SYSTEM_PROMPT = readFileSync(
  join(__dirname, "prompts/system.md"),
  "utf-8",
);
export const getSystemPrompt = ({
  timeZone = "Asia/Karachi",
  type = "interactive",
} = {}) => {
  const now = new Date().toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (type === "automated") {
    return `You are an automated task executor.

## Rules
- You are executing a scheduled task. The user is not present.
- Execute the task immediately using whatever tools are needed, without asking any questions.
- No previews, no confirmations, no clarifying questions.
- If the task says "tell the user" or "send the user a message" — just reply with that message directly. You are already on WhatsApp with them. No tool needed.
- Your final message is what gets sent to the user — keep it clean and direct.`;
  }

  return `Current date and time: ${now} (${timeZone})\n\n${SYSTEM_PROMPT}`;
};
