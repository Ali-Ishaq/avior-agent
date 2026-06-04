import cron from "node-cron";
import { UserToken } from "../model/userToken.js";
import { registerGmailWatch } from "../services/google/gmail.js";
import { cronLog } from "./logger.js";

const SCOPE = "GmailWatch";

const buildRawTokenShape = (userToken) => ({
  access_token: userToken?.google?.accessToken,
  refresh_token: userToken?.google?.refreshToken,
});

export const startGmailWatchRefreshCron = () => {
  // Every 6th day of the month at 00:00
  cron.schedule("0 0 */6 * *", async () => {
    cronLog(
      SCOPE,
      "RUN",
      "Refreshing Gmail watch for all users with historyId...",
    );

    const users = await UserToken.find({
      "google.historyId": { $exists: true, $ne: null, $ne: "" },
    }).select(
      "emailAddress google.accessToken google.refreshToken google.historyId",
    );

    if (users.length === 0) {
      cronLog(SCOPE, "SKIP", "No users found with google.historyId.");
      return;
    }

    cronLog(SCOPE, "INFO", `Found ${users.length} user(s) to refresh.`);

    let ok = 0;
    let failed = 0;

    // IMPORTANT: registerWatch uses a shared oauth2Client singleton.
    // Run sequentially to avoid credentials races.
    for (const user of users) {
      try {
        await registerGmailWatch(user.emailAddress, buildRawTokenShape(user));
        ok += 1;
      } catch (error) {
        failed += 1;
        cronLog(
          SCOPE,
          "ERROR",
          `Failed for ${user.emailAddress}: ${error.message}`,
        );
      }
    }

    cronLog(
      SCOPE,
      "DONE",
      `Gmail watch refresh completed (ok=${ok}, failed=${failed}).`,
    );
  });

  cronLog(SCOPE, "BOOT", "Scheduled Gmail watch refresh cron (0 0 */6 * *).");
};
