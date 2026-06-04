export const cronLog = (scope, label, msg) =>
  console.log(
    `[CronRunner] [${scope}] [${label}] ${new Date().toISOString()} — ${msg}`,
  );
