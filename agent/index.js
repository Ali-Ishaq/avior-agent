import "../config/loadEnv.js";

export { agent } from "./workflow.js";

export const getConfig = ({
  thread_id = 923310494970,
  phoneNumber = 923310494970,
  waMessageId,
  type = "interactive",
}) => ({
  configurable: {
    thread_id,
    phoneNumber,
    type,
    ...(waMessageId ? { waMessageId } : {}),
  },
});
