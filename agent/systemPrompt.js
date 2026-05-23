import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SYSTEM_PROMPT = readFileSync(
  join(__dirname, 'prompts/system.md'),
  'utf-8'
);