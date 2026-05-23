import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SYSTEM_PROMPT = readFileSync(
  join(__dirname, 'prompts/system.md'),
  'utf-8'
);
export const getSystemPrompt = (timeZone = "Asia/Karachi") => {
  const now = new Date().toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  });

  return `Current date and time: ${now} (${timeZone})

${SYSTEM_PROMPT}`;
};