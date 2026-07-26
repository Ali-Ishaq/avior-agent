# Project Title

Avior Agent

## Objective

Avior Agent is a WhatsApp-based AI assistant that automates everyday productivity tasks through natural conversation. Users can ask it to send emails, create calendar events, schedule Google Meet calls, check availability, retrieve schedules, manage reminders, and receive Gmail summaries without leaving WhatsApp.

The project combines an LLM-driven agent workflow, Google integrations, MongoDB persistence, webhook handling, and scheduled execution so the assistant can act both in real time and on a schedule.

## Installation Step

1. Install Node.js and npm.
2. Install and run MongoDB locally, or prepare a MongoDB Atlas connection string.
3. Clone the repository to your machine.
4. Install the project dependencies:

   ```bash
   npm install
   ```

5. Create a `.env` file in the project root.
6. Add the required environment variables:

   ```env
   PORT=3000
   MONGO_URI=your_mongodb_connection_string
   GOOGLE_API_KEY=your_gemini_api_key
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   GOOGLE_REDIRECT_URI=your_google_oauth_redirect_url
   WHATSAPP_TOKEN=your_whatsapp_access_token
   WHATSAPP_VERIFY_TOKEN=your_whatsapp_verify_token
   PHONE_NUMBER_ID=your_whatsapp_phone_number_id
   TAVILY_API_KEY=your_tavily_api_key
   PUBSUB_TOPIC=your_pubsub_topic_name
   ```

7. Configure Google Cloud with Gmail API, Calendar API, OAuth consent, and Pub/Sub.
8. Configure the WhatsApp Cloud API webhook to point to this application.
9. Make sure the app is reachable over HTTPS if you are testing OAuth callbacks or webhooks from external services.

## Required Libraries

The main runtime and service dependencies are:

- `express` for the HTTP server and webhook routes
- `dotenv` for environment variable loading
- `mongoose` for MongoDB models and database connection management
- `mongodb` for LangGraph checkpoint storage
- `node-cron` for scheduled jobs and recurring task execution
- `axios` for WhatsApp Cloud API requests
- `googleapis` for Google OAuth, Gmail, Calendar, and related APIs
- `@langchain/core` for tool and message primitives
- `@langchain/langgraph` for the agent workflow engine
- `@langchain/google-genai` for Gemini model access
- `@langchain/tavily` for web search
- `@langchain/langgraph-checkpoint-mongodb` for persistent graph state
- `nodemon` for local development reloads

## How To Run

### Development Mode

Start the app with:

```bash
npm run dev
```

### Production Mode

Start the app with:

```bash
npm start
```

### What Happens On Startup

- Environment variables are loaded from `.env`
- The app connects to MongoDB
- The cron runner starts
- Express listens on `PORT` or defaults to `3000`
- WhatsApp, Google redirect, and auth routes become available

## Authentication Flow

Google access is connected through a backend-driven OAuth flow.

1. The user requests a Google-dependent action in WhatsApp, such as sending email or creating a calendar event.
2. The agent detects that Google access is missing and returns an `AUTH_REQUIRED` response that contains a consent URL.
3. The backend sends a WhatsApp template message that instructs the user to connect their Google account using that authorization link.
4. The user opens the consent URL and grants access to Google.
5. Google redirects back to the application at the OAuth callback endpoint.
6. The backend exchanges the authorization code for access and refresh tokens, stores them in MongoDB, and registers Gmail watch subscriptions when available.
7. The user receives a WhatsApp confirmation message and can continue using Google-powered features.

This is the technical basis for the account-connection flow: the backend brokers OAuth consent, persists credentials, and then enables Gmail and Calendar tools for that WhatsApp user.

## Core Capabilities

- Respond to WhatsApp messages through an AI agent
- Send Gmail messages through a tool call
- Create Google Calendar events
- Schedule Google Meet meetings with invites
- Check calendar availability and retrieve schedules
- Create one-time or recurring automated tasks
- Process Gmail Pub/Sub notifications and deliver summaries to WhatsApp

## Operational Notes

- Google authorization is required before Gmail and Calendar features can work
- WhatsApp webhook verification must be configured correctly
- Scheduled automated tasks are stored in MongoDB and executed by the cron runner
- The project uses LangGraph checkpointing to preserve agent state across turns

## Project Structure

- `index.js` starts the server and wires the routes
- `agent/` contains the LangGraph agent, tools, prompts, and workflow logic
- `controllers/` contains request handlers for auth and redirects
- `routes/` defines Express routers for webhooks, auth, and redirects
- `webhooks/` handles WhatsApp and Gmail inbound events
- `cron/` contains the scheduled job runners
- `model/` defines MongoDB schemas for user tokens and scheduled jobs
- `services/` contains Google and WhatsApp service integrations
- `utils/` contains response-handling helpers

