# Northstar — Online Proposal Portal

A responsive proposal-management app with a Node.js/Express API and PostgreSQL persistence.

## Features
- Password-protected workspace administration
- Persistent proposal creation, editing, search, and status tracking
- Secure random client share links
- Client-facing proposal view
- Persistent approve / request-changes decisions and comment history
- Responsive desktop and mobile interface

## Stack
- Node.js 20+
- Express
- PostgreSQL
- Vanilla HTML, CSS, and JavaScript

## Run locally

1. Install Node.js 20 or newer and PostgreSQL.
2. Create a PostgreSQL database.
3. Run the schema in that database:

   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```

4. Copy `.env.example` to `.env` and set:
   - `DATABASE_URL`: PostgreSQL connection string
   - `DATABASE_SSL`: set to `true` for hosted databases that require TLS
   - `ADMIN_PASSWORD`: strong workspace admin password
   - `SESSION_SECRET`: long random secret (32+ characters)
5. Install and start:

   ```bash
   npm install
   npm start
   ```

6. Open http://localhost:3000 and sign in using `ADMIN_PASSWORD`.

## Deploy

Deploy this repository to a Node.js host (for example Render, Railway, or Fly.io) and attach a managed PostgreSQL database. Set the environment variables above in the hosting dashboard. Run `schema.sql` once against the production database before opening the app. The host must serve the app and API from the same origin so the HttpOnly admin session cookie works.

## Client links and approvals

Saving a proposal creates a high-entropy, unguessable share token. The client link has the form `https://YOUR-DOMAIN/?share=TOKEN`. Clients can approve or request changes with a message. The decision and message are stored in `proposal_activity`; the proposal status is updated in `proposals`.

## Security notes

- Never commit your real `.env` file or database credentials.
- Use HTTPS in production. The session cookie is marked Secure when `NODE_ENV=production`.
- Use a unique, strong `ADMIN_PASSWORD` and `SESSION_SECRET`.
- The client share URL is a bearer link: anyone who has it can view and respond to that proposal. Share it only with the intended client.
- Back up your PostgreSQL database regularly.

## Current scope

The admin area uses one shared workspace password rather than individual user accounts/roles. Email delivery, multi-user permissions, payment collection, and automated reminders are not included yet.
