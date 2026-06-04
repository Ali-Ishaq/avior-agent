import { cronLog } from "./logger.js";
import { startReminderCrons } from "./reminders.js";
import { startGmailWatchRefreshCron } from "./gmailWatchRefresh.js";

const SCOPE = "Boot";

export const startCronRunner = async () => {
  cronLog(SCOPE, "BOOT", "Starting cron runner...");

  await startReminderCrons();
  startGmailWatchRefreshCron();

  cronLog(SCOPE, "BOOT", "Cron runner ready.");
};
