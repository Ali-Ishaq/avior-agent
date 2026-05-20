import "../config/loadEnv.js";

export { agent } from "./workflow.js";

export const getConfig = (phoneNumber) => ({
  configurable: { thread_id: phoneNumber, phoneNumber },
});
