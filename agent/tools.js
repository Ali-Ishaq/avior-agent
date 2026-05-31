import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";
import { google } from "googleapis";

import { isTokenExpired } from "../services/google/isTokenExpired.js";
import {
  oauth2Client,
  generateAuthUrl,
} from "../services/google/generateAuthUrl.js";
import { UserToken } from "../model/userToken.js";
import { ScheduledJob } from "../model/scheduledJob.js";

const ok = (tool, data) => JSON.stringify({ status: "success", tool, ...data });

const fail = (tool, reason, hint) =>
  JSON.stringify({ status: "error", tool, reason, ...(hint && { hint }) });

export const websearch = new TavilySearch({
  maxResults: 3,
  topic: "general",
  tavilyApiKey: process.env.TAVILY_API_KEY,
});

export const gmailTool = tool(
  async ({ to, subject, body }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone) return fail("send_gmail", "No phone number found in config.");

    const tokenResult = await getAccessToken(phone);
    if (tokenResult.status === "failed")
      return fail("send_gmail", tokenResult.message);

    const { accessToken, refreshToken } = tokenResult.tokens;

    const auth = oauth2Client;
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const gmail = google.gmail({ version: "v1", auth });

    const raw = Buffer.from(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
      ].join("\r\n"),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return ok("send_gmail", {
        messageId: res.data.id,
        to,
        subject,
        message: `Email sent successfully to ${to}.`,
      });
    } catch (error) {
      return fail("send_gmail", error.message);
    }
  },
  {
    name: "send_gmail",
    description: `Send an email via Gmail. Only call when you have recipient email, subject, and body. Never guess an email address.`,
    schema: z.object({
      to: z.string().email().describe("Recipient's email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Full email body"),
    }),
  },
);

export const addCalendarEvent = tool(
  async (
    { title, date, startTime, endTime, description, location },
    config,
  ) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone)
      return fail("add_calendar_event", "No phone number found in config.");

    const eventStart = new Date(`${date}T${startTime}:00`);
    if (eventStart < new Date()) {
      return fail(
        "add_calendar_event",
        `The requested date/time (${date} ${startTime}) is in the past.`,
        "Ask the user to confirm the correct future date and time.",
      );
    }

    const tokenResult = await getAccessToken(phone);
    if (tokenResult.status === "failed")
      return fail("add_calendar_event", tokenResult.message);

    const { accessToken, refreshToken } = tokenResult.tokens;

    const auth = oauth2Client;
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const calendar = google.calendar({ version: "v3", auth });

    try {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title,
          description: description ?? "",
          location: location ?? "",
          start: {
            dateTime: `${date}T${startTime}:00`,
            timeZone: "Asia/Karachi",
          },
          end: { dateTime: `${date}T${endTime}:00`, timeZone: "Asia/Karachi" },
        },
      });

      const event = response.data;
      return ok("add_calendar_event", {
        eventId: event.id,
        title: event.summary,
        date,
        startTime,
        endTime,
        link: event.htmlLink,
        message: `Event "${event.summary}" created for ${date} from ${startTime} to ${endTime}.`,
      });
    } catch (error) {
      return fail("add_calendar_event", error.message);
    }
  },
  {
    name: "add_calendar_event",
    description: `Creates a Google Calendar event when the user provides an exact date and time.
      Use when the user says things like:
      - "Add gym at 6pm tomorrow"
      - "Block Friday 2-3pm for a call"
      - "Dentist appointment on June 5th at 10am"
      Do NOT use when the user wants you to find a free slot.
      Only call when you have all required parameters in the correct format.`,
    schema: z.object({
      title: z.string().describe("Title or name of the event"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      startTime: z.string().describe("Start time in HH:MM (24-hour) format"),
      endTime: z.string().describe("End time in HH:MM (24-hour) format"),
      description: z.string().optional().describe("Optional event description"),
      location: z
        .string()
        .optional()
        .describe("Optional location or meeting link"),
    }),
  },
);

export const scheduleMeet = tool(
  async (
    {
      title,
      date,
      startTime,
      endTime,
      attendees,
      description,
      timeZone = "Asia/Karachi",
    },
    config,
  ) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone)
      return fail("schedule_meet", "No phone number found in config.");

    const tokenResult = await getAccessToken(phone);
    if (tokenResult.status === "failed")
      return fail("schedule_meet", tokenResult.message);

    // Guard: reject past dates
    const eventStart = new Date(`${date}T${startTime}:00`);
    if (eventStart < new Date()) {
      return fail(
        "schedule_meet",
        `The requested date/time (${date} ${startTime}) is in the past.`,
        "Ask the user to confirm the correct future date and time.",
      );
    }

    const { accessToken, refreshToken } = tokenResult.tokens;
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const calendar = google.calendar({ version: "v3", auth });

    try {
      const response = await calendar.events.insert({
        calendarId: "primary",
        conferenceDataVersion: 1,
        sendUpdates: "all",
        requestBody: {
          summary: title,
          description: description ?? "",
          start: { dateTime: `${date}T${startTime}:00`, timeZone },
          end: { dateTime: `${date}T${endTime}:00`, timeZone },
          attendees: attendees.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 10 },
              { method: "email", minutes: 30 },
            ],
          },
        },
      });

      const event = response.data;

      return ok("schedule_meet", {
        eventId: event.id,
        title: event.summary,
        date,
        startTime,
        endTime,
        meetLink: event.hangoutLink,
        eventLink: event.htmlLink,
        attendees,
        message: `Meeting "${event.summary}" scheduled on ${date} from ${startTime} to ${endTime}. Meet link: ${event.hangoutLink}`,
      });
    } catch (error) {
      return fail("schedule_meet", error.message);
    }
  },
  {
    name: "schedule_meet",
    description: `Schedules a Google Meet meeting and sends invites to attendees.
      Use when the user says things like:
      - "Schedule a meeting with john@example.com tomorrow at 3pm"
      - "Set up a call with the team on Friday"
      - "Create a Google Meet for my interview at 2pm"
      Requires at least one attendee email. Always generates a Google Meet link automatically.
      Do NOT use this for personal events with no attendees — use add_calendar_event instead.
      Only call when you have all required parameters.`,
    schema: z.object({
      title: z.string().describe("Title of the meeting"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      startTime: z.string().describe("Start time in HH:MM (24-hour) format"),
      endTime: z
        .string()
        .describe(
          "End time in HH:MM (24-hour) format. Default to 1 hour after start if not provided.",
        ),
      attendees: z
        .array(z.string().email())
        .min(1)
        .describe("List of attendee email addresses. Must have at least one."),
      description: z
        .string()
        .optional()
        .describe("Optional meeting agenda or description"),
      timeZone: z
        .string()
        .default("Asia/Karachi")
        .describe("IANA timezone string, e.g. Asia/Karachi, America/New_York"),
    }),
  },
);

export const checkAvailability = tool(
  async ({ timeMin, timeMax, timeZone }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone)
      return fail("check_availability", "No phone number found in config.");

    const tokenResult = await getAccessToken(phone);
    if (tokenResult.status === "failed")
      return fail("check_availability", tokenResult.message);

    const { accessToken, refreshToken } = tokenResult.tokens;
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const calendar = google.calendar({ version: "v3", auth });

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: "primary" }],
        },
      });

      const busySlots = response.data.calendars.primary.busy; // [{ start, end }, ...]
      console.log("Busy slots:", busySlots);

      if (busySlots.length === 0) {
        return ok("check_availability", {
          timeMin,
          timeMax,
          timeZone,
          busy: [],
          message: `The user is completely free between ${timeMin} and ${timeMax}.`,
        });
      }

      // Compute free slots within the queried window
      const freeSlots = [];
      let cursor = new Date(timeMin);
      const windowEnd = new Date(timeMax);

      for (const slot of busySlots) {
        const busyStart = new Date(slot.start);
        const busyEnd = new Date(slot.end);

        if (cursor < busyStart) {
          freeSlots.push({
            start: cursor.toISOString(),
            end: busyStart.toISOString(),
          });
        }
        cursor = busyEnd > cursor ? busyEnd : cursor;
      }

      if (cursor < windowEnd) {
        freeSlots.push({
          start: cursor.toISOString(),
          end: windowEnd.toISOString(),
        });
      }

      return ok("check_availability", {
        timeMin,
        timeMax,
        timeZone,
        busy: busySlots,
        free: freeSlots,
        message: `Found ${busySlots.length} busy slot(s) and ${freeSlots.length} free slot(s) in the requested window.`,
      });
    } catch (error) {
      return fail("check_availability", error.message);
    }
  },
  {
    name: "check_availability",
    description: `Checks the user's Google Calendar availability in a given time window.
      Use when the user says things like:
      - "Am I free at 3pm tomorrow?"
      - "What's my schedule on Friday?"
      - "Find me a free 1-hour slot this afternoon"
      - "When am I available this week?"
      Always call this before scheduling a meeting if the user hasn't specified a time,
      or if you need to confirm they are free at a given time.
      timeMin and timeMax must be ISO 8601 strings in UTC (e.g. "2026-06-01T08:00:00Z").`,
    schema: z.object({
      timeMin: z
        .string()
        .describe(
          "Start of the window to check in ISO 8601 UTC format e.g. 2026-06-01T08:00:00Z",
        ),
      timeMax: z
        .string()
        .describe(
          "End of the window to check in ISO 8601 UTC format e.g. 2026-06-01T17:00:00Z",
        ),
      timeZone: z
        .string()
        .default("Asia/Karachi")
        .describe("IANA timezone string used to interpret and display times"),
    }),
  },
);

const getSchedule = tool(
  async ({ timeMin, timeMax, timeZone }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone) return fail("get_schedule", "No phone number found in config.");

    const tokenResult = await getAccessToken(phone);
    if (tokenResult.status === "failed")
      return fail("get_schedule", tokenResult.message);

    const { accessToken, refreshToken } = tokenResult.tokens;
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const calendar = google.calendar({ version: "v3", auth });

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items;

      if (events.length === 0) {
        return ok("get_schedule", {
          timeMin,
          timeMax,
          timeZone,
          events: [],
          message: `No events found between ${timeMin} and ${timeMax}.`,
        });
      }

      return ok("get_schedule", {
        timeMin,
        timeMax,
        timeZone,
        events: events.map((event) => ({
          title: event.summary,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date,
          meetLink: event.hangoutLink ?? null,
          attendees: event.attendees?.map((a) => a.email) ?? [],
          location: event.location ?? null,
        })),
        message: `Found ${events.length} event(s) in the requested window.`,
      });
    } catch (error) {
      return fail("get_schedule", error.message);
    }
  },
  {
    name: "get_schedule",
    description: `Retrieves the user's Google Calendar schedule in a given time window.
      Use when the user says things like:
      - "What's my schedule on Friday?"
      - "Show me my events this week?"
      - "List my meetings for today"
      - "What do I have scheduled for tomorrow?"
      timeMin and timeMax must be ISO 8601 strings in UTC (e.g. "2026-06-01T08:00:00Z").`,
    schema: z.object({
      timeMin: z
        .string()
        .describe(
          "Start of the window to check in ISO 8601 UTC format e.g. 2026-06-01T08:00:00Z",
        ),
      timeMax: z
        .string()
        .describe(
          "End of the window to check in ISO 8601 UTC format e.g. 2026-06-01T17:00:00Z",
        ),
      timeZone: z
        .string()
        .default("Asia/Karachi")
        .describe("IANA timezone string used to interpret and display times"),
    }),
  },
);

const getAccessToken = async (phone) => {
  const userTokenDoc = await UserToken.findOne({ phoneNumber: phone });
  if (!userTokenDoc) {
    const authUrl = generateAuthUrl(phone);

    return {
      status: "failed",
      message: `AUTH_REQUIRED: ${authUrl}`,
    };
  }

  let tokens = userTokenDoc.google;

  if (isTokenExpired(tokens.expiryDate)) {
    console.log(`Access token for ${phone} is expired. Refreshing...`);
    try {
      oauth2Client.setCredentials({ refresh_token: tokens.refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();

      const updated = await UserToken.findOneAndUpdate(
        { phoneNumber: phone },
        {
          google: {
            accessToken: credentials.access_token,
            refreshToken: credentials.refresh_token || tokens.refreshToken, // keep old refresh token if new one isn't provided
            expiryDate: credentials.expiry_date,
          },
        },
        { new: true },
      );
      tokens = updated.google;
      console.log(`Access token refreshed for ${phone}`);
    } catch (error) {
      console.error(`Failed to refresh token for ${phone}:`, error);
      return {
        status: "failed",
        message: `Token refresh failed for ${phone}: ${error.message}`,
      };
    }
  }

  return {
    status: "success",
    tokens: tokens,
  };
};

export const createAutomatedTask = tool(
  async ({ task, type, scheduledAt, cronExpr }, config) => {
    const phone = config?.configurable?.phoneNumber;
    const waMessageId = config?.configurable?.waMessageId;
    if (!phone)
      return fail("create_automated_task", "No phone number found in config.");

    // Validate: one-time must have scheduledAt
    if (type === "once" && !scheduledAt) {
      return fail(
        "create_automated_task",
        "scheduledAt is required for one-time automated tasks.",
        "Ask the user for the exact date and time for the task.",
      );
    }

    // Validate: recurring must have cronExpr
    if (type === "recurring" && !cronExpr) {
      return fail(
        "create_automated_task",
        "cronExpr is required for recurring automated tasks.",
        "Ask the user for the frequency e.g. daily at noon, every Monday at 9am.",
      );
    }

    // Validate: one-time automated tasks must be in the future
    if (type === "once" && new Date(scheduledAt) < new Date()) {
      return fail(
        "create_automated_task",
        `Scheduled time (${scheduledAt}) is in the past.`,
        "Ask the user to confirm the correct future date and time.",
      );
    }

    try {
      const reminder = await ScheduledJob.create({
        phoneNumber: phone,
        waMessageId: waMessageId ?? null,
        task,
        type,
        scheduledAt: scheduledAt ?? null,
        cronExpr: cronExpr ?? null,
        status: "pending",
      });

      return ok("create_automated_task", {
        reminderId: reminder._id,
        task,
        type,
        scheduledAt: scheduledAt ?? null,
        cronExpr: cronExpr ?? null,
        summary:
          type === "once"
            ? `Automated task set for ${scheduledAt}. I'll take care of it then.`
            : `Recurring automated task set (${cronExpr}). I'll handle it automatically.`,
      });
    } catch (error) {
      return fail("create_automated_task", error.message);
    }
  },
  {
    name: "create_automated_task",
    description: `Schedules a one-time or recurring task for the agent to execute automatically at the given time.
      The agent will invoke itself at the scheduled time and carry out the task using its available tools.The task will be passed as a direct instruction to the agent.
      Write it as a command the agent should act on, not a conversational response.
 
      Use for things like:
      - "Remind me to pick Ali in 20 minutes" → one-time, task: "Send me a response message: time to pick Ali"
      - "Email me the weather every morning at 8am" → recurring, task: "Search today's weather in Karachi and email it to me"
      - "Remind me to send the report on Friday at 5pm" → one-time, task: "Send me a response message: don't forget to send the report"
 
      CRITICAL — TASK COMPLETENESS:
      Before calling this tool, mentally simulate running the task with zero user input.
      The task field must contain every piece of information needed to complete it.

      Go through each tool the task will need and ensure all its required fields are embedded:

      If ANY required detail is missing — ask the user for it BEFORE calling this tool.
      Never call this tool with a vague or incomplete task.
      - Never guess or infer a cronExpr — always confirm the exact schedule with the user first.
      - scheduledAt must be in ISO 8601 UTC format.`,
    schema: z.object({
      task: z
        .string()
        .describe(
          "Full self-contained instruction for the agent to execute at the scheduled time. Must not require any user input to carry out.",
        ),
      type: z
        .enum(["once", "recurring"])
        .describe(
          "once for a single future task, recurring for a repeating schedule",
        ),
      scheduledAt: z
        .string()
        .optional()
        .describe(
          "Required for one-time reminders. ISO 8601 UTC e.g. 2026-06-01T07:00:00Z",
        ),
      cronExpr: z
        .string()
        .optional()
        .describe(
          "Required for recurring reminders. Standard 5-field cron expression e.g. '0 12 * * *' for daily at noon, '0 9 * * 1' for every Monday at 9am",
        ),
    }),
  },
);

export const cancelAutomatedTask = tool(
  async ({ reminderId }, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone)
      return fail("cancel_automated_task", "No phone number found in config.");

    try {
      const reminder = await ScheduledJob.findOneAndUpdate(
        { _id: reminderId, phoneNumber: phone, status: "pending" },
        { status: "cancelled" },
        { new: true },
      );

      if (!reminder) {
        return fail(
          "cancel_automated_task",
          "No active automated task found with that ID.",
          "Use list_automated_tasks to show the user their active automated tasks and get the correct ID.",
        );
      }

      return ok("cancel_automated_task", {
        reminderId,
        task: reminder.task,
        message: `Automated task cancelled successfully.`,
      });
    } catch (error) {
      return fail("cancel_automated_task", error.message);
    }
  },
  {
    name: "cancel_automated_task",
    description: `Cancels an active automated task by its ID.
      Use when the user says things like:
      - "Cancel my noon joke automated task"
      - "Remove the Ali pickup automated task"
      If you don't have the reminderId, call list_automated_tasks first to show the user their active automated tasks.`,
    schema: z.object({
      reminderId: z
        .string()
        .describe(
          "The _id of the automated task to cancel. Get this from list_automated_tasks if unknown.",
        ),
    }),
  },
);

export const listAutomatedTask = tool(
  async (_args, config) => {
    const phone = config?.configurable?.phoneNumber;
    if (!phone)
      return fail("list_automated_tasks", "No phone number found in config.");

    try {
      const reminders = await ScheduledJob.find({
        phoneNumber: phone,
        status: "pending",
      }).sort({ createdAt: -1 });

      if (reminders.length === 0) {
        return ok("list_automated_tasks", {
          reminders: [],
          message: "You have no active automated tasks.",
        });
      }

      return ok("list_automated_tasks", {
        count: reminders.length,
        reminders: reminders.map((r) => ({
          reminderId: r._id,
          task: r.task,
          type: r.type,
          scheduledAt: r.scheduledAt ?? null,
          cronExpr: r.cronExpr ?? null,
        })),
        message: `You have ${reminders.length} active automated task(s).`,
      });
    } catch (error) {
      return fail("list_automated_tasks", error.message);
    }
  },
  {
    name: "list_automated_tasks",
    description: `Lists all active (pending) automated tasks for the user.
      ONLY call this when the user says something very close to:
  - "List automated tasks"
  - "Show automated tasks"
  - "What automated tasks do I have?"
  
  Do not call this for anything else.`,
    schema: z.object({}),
  },
);

export const tools = [
  websearch,
  gmailTool,
  addCalendarEvent,
  checkAvailability,
  getSchedule,
  scheduleMeet,
  createAutomatedTask,
  cancelAutomatedTask,
  listAutomatedTask,
];
