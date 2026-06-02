import cron from "node-cron";
import { ScheduledJob } from "../model/scheduledJob.js";
import { agent } from "../agent/index.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { getConfig } from "../agent/index.js";
import { sendMessage } from "../services/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log = (label, msg) =>
  console.log(`[CronRunner] [${label}] ${new Date().toISOString()} — ${msg}`);

const runTask = async (reminder) => {
  try {
    log(
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
    await sendMessage(reminder.phoneNumber, response.messages.at(-1).content);

    log("DONE", `Task completed for ${reminder.phoneNumber}`);
  } catch (error) {
    log("ERROR", `Task failed for ${reminder.phoneNumber}: ${error.message}`);
  }
};

// ─── One-time reminders ───────────────────────────────────────────────────────
// Polls every minute for any pending one-time tasks that are due

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const dueTasks = await ScheduledJob.find({
      type: "once",
      status: "pending",
      scheduledAt: { $lte: now },
    });

    log("POLL", `Checked for due one-time tasks at ${now.toISOString()}`);
    
    if (dueTasks.length === 0) return;

    log("POLL", `Found ${dueTasks.length} due one-time task(s)`);

    for (const task of dueTasks) {
      // Mark as done before running to prevent duplicate executions
      // if the agent takes longer than 1 minute
      await ScheduledJob.findByIdAndUpdate(task._id, { status: "done" });
      await runTask(task);
    }
  } catch (error) {
    log("ERROR", `One-time poll failed: ${error.message}`);
  }
});

// ─── Recurring reminders ──────────────────────────────────────────────────────
// Loaded once at startup — each gets its own cron job
// New recurring tasks added after startup require a server restart
// (or use the dynamic loader below if you want hot-loading)

const loadRecurringTasks = async () => {
  try {
    const recurringTasks = await ScheduledJob.find({
      type: "recurring",
      status: "pending",
    });

    if (recurringTasks.length === 0) {
      log("INIT", "No recurring tasks found.");
      return;
    }

    log("INIT", `Loading ${recurringTasks.length} recurring task(s)...`);

    for (const task of recurringTasks) {
      scheduleRecurringTask(task);
    }
  } catch (error) {
    log("ERROR", `Failed to load recurring tasks: ${error.message}`);
  }
};

const scheduleRecurringTask = (task) => {
  if (!cron.validate(task.cronExpr)) {
    log(
      "WARN",
      `Invalid cron expression for task ${task._id}: "${task.cronExpr}" — skipping`,
    );
    return;
  }

  cron.schedule(task.cronExpr, async () => {
    // Re-check status before running in case it was cancelled after startup
    const latest = await ScheduledJob.findById(task._id);
    if (!latest || latest.status !== "pending") {
      log("SKIP", `Task ${task._id} is no longer active — skipping`);
      return;
    }
    await runTask(task);
  });

  log(
    "INIT",
    `Scheduled recurring task ${task._id} (${task.cronExpr}) for ${task.phoneNumber}`,
  );
};

// ─── Dynamic loader for new recurring tasks ───────────────────────────────────
// Checks every 5 minutes for recurring tasks that were created after startup
// and haven't been picked up yet. Tracks loaded IDs to avoid double-scheduling.

const loadedTaskIds = new Set();

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
    log("ERROR", `Dynamic loader failed: ${error.message}`);
  }
};

cron.schedule("*/5 * * * *", async () => {
  await loadNewRecurringTasks();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

export const startCronRunner = async () => {
  log("BOOT", "Starting cron runner...");
  await loadRecurringTasks();

  // Seed the loadedTaskIds set with already-loaded tasks
  const existing = await ScheduledJob.find({
    type: "recurring",
    status: "pending",
  });
  existing.forEach((t) => loadedTaskIds.add(t._id.toString()));

  log("BOOT", "Cron runner ready.");
};
