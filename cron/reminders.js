import cron from "node-cron";
import { ScheduledJob } from "../model/scheduledJob.js";
import { agent, getConfig } from "../agent/index.js";
import { HumanMessage } from "@langchain/core/messages";
import { sendMessage } from "../services/index.js";
import { cronLog } from "./logger.js";

const SCOPE = "Reminders";

const runTask = async (reminder) => {
  try {
    cronLog(
      SCOPE,
      "RUN",
      `Executing task for ${reminder.phoneNumber}: "${reminder.task}"`,
    );

    const config = getConfig({
      thread_id: reminder._id.toString(),
      phoneNumber: reminder.phoneNumber,
      waMessageId: reminder.waMessageId,
      type: "automated",
    });

    const response = await agent.invoke(
      {
        messages: [new HumanMessage(reminder.task)],
      },
      config,
    );

    console.log(
      "Agent response for scheduled task:",
      response.messages.slice(-4),
    );

    await sendMessage(
      reminder.phoneNumber,
      response.messages.at(-1).content,
      reminder.waMessageId,
    );

    cronLog(SCOPE, "DONE", `Task completed for ${reminder.phoneNumber}`);
  } catch (error) {
    cronLog(
      SCOPE,
      "ERROR",
      `Task failed for ${reminder.phoneNumber}: ${error.message}`,
    );
  }
};

// ─── One-time reminders ───────────────────────────────────────────────────────
// Polls every minute for any pending one-time tasks that are due

const startOneTimeRemindersPoll = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const dueTasks = await ScheduledJob.find({
        type: "once",
        status: "pending",
        scheduledAt: { $lte: now },
      });

      cronLog(
        SCOPE,
        "POLL",
        `Checked for due one-time tasks at ${now.toISOString()}`,
      );

      if (dueTasks.length === 0) return;

      cronLog(SCOPE, "POLL", `Found ${dueTasks.length} due one-time task(s)`);

      for (const task of dueTasks) {
        // Mark as done before running to prevent duplicate executions
        // if the agent takes longer than 1 minute
        await ScheduledJob.findByIdAndUpdate(task._id, { status: "done" });
        await runTask(task);
      }
    } catch (error) {
      cronLog(SCOPE, "ERROR", `One-time poll failed: ${error.message}`);
    }
  });
};

// ─── Recurring reminders ──────────────────────────────────────────────────────
// Loaded once at startup — each gets its own cron job

const loadedTaskIds = new Set();

const scheduleRecurringTask = (task) => {
  if (!cron.validate(task.cronExpr)) {
    cronLog(
      SCOPE,
      "WARN",
      `Invalid cron expression for task ${task._id}: "${task.cronExpr}" — skipping`,
    );
    return;
  }

  cron.schedule(task.cronExpr, async () => {
    const latest = await ScheduledJob.findById(task._id);
    if (!latest || latest.status !== "pending") {
      cronLog(SCOPE, "SKIP", `Task ${task._id} is no longer active — skipping`);
      return;
    }
    await runTask(task);
  });

  cronLog(
    SCOPE,
    "INIT",
    `Scheduled recurring task ${task._id} (${task.cronExpr}) for ${task.phoneNumber}`,
  );
};

const loadRecurringTasks = async () => {
  const recurringTasks = await ScheduledJob.find({
    type: "recurring",
    status: "pending",
  });

  if (recurringTasks.length === 0) {
    cronLog(SCOPE, "INIT", "No recurring tasks found.");
    return;
  }

  cronLog(
    SCOPE,
    "INIT",
    `Loading ${recurringTasks.length} recurring task(s)...`,
  );

  for (const task of recurringTasks) {
    scheduleRecurringTask(task);
    loadedTaskIds.add(task._id.toString());
  }
};

// ─── Dynamic loader for new recurring tasks ───────────────────────────────────
// Checks every 5 minutes for recurring tasks that were created after startup
// and haven't been picked up yet. Tracks loaded IDs to avoid double-scheduling.

const loadNewRecurringTasks = async () => {
  try {
    const recurringTasks = await ScheduledJob.find({
      type: "recurring",
      status: "pending",
    });

    for (const task of recurringTasks) {
      if (loadedTaskIds.has(task._id.toString())) continue;
      scheduleRecurringTask(task);
      loadedTaskIds.add(task._id.toString());
    }
  } catch (error) {
    cronLog(SCOPE, "ERROR", `Dynamic loader failed: ${error.message}`);
  }
};

const startDynamicRecurringLoader = () => {
  cron.schedule("*/5 * * * *", async () => {
    await loadNewRecurringTasks();
  });
};

export const startReminderCrons = async () => {
  startOneTimeRemindersPoll();
  await loadRecurringTasks();
  startDynamicRecurringLoader();

  cronLog(SCOPE, "BOOT", "Reminder crons ready.");
};
