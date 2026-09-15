# Alabama State Roleplay Session Bot

A Node.js Discord bot that posts the Alabama State Roleplay session announcement
as a single Components V2 card via the `/session` slash command, with live ER:LC statistics.

## What it does

- Registers a `/session` slash command in your server.
- Runs `/session` → posts one public Container card (type 17):
  - Media Gallery (type 12) banner pinned to the top of the card.
  - Text Display (type 10) body: `## Session Information`,
    quoted intro, `Server Name / Owner / Code` rows and live
    **Players / Queue / Staff** counts with `Last updated: <relative time>`.
  - Action Row (type 1) inside the card bottom:
    - **Session Ping** – toggles a ping role so members can opt in/out of pings.
    - **Join Server** – a link straight to the game's join page.
    - **Server Online / Offline** – a live (non-clickable) status indicator.
- If `SESSION_CHANNEL_ID` is set, the card is posted to that channel instead.

## Setup

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Fill in `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID` (these are required).
5. Optional: add an ER:LC API key + `SESSION_CHANNEL_ID`.
6. Optional overrides: `ERLC_SERVER_CODE`, `SESSION_BANNER_URL`
   (leave empty to keep the hardcoded Alabama / Rose / ALABAM values).
7. Run `npm start` (or `npm run dev` while developing).

## Your community's info

All of the session-specific data lives in the `SERVER` object at the top of
`src/index.js` — server name, owner, server code, join link, banner/logo images,
accent color, ping role ID and intro text. Edit that block and restart the bot;
**you don't need `.env` for any of it** (env overrides exist but default to it).

## Required Discord permissions / scopes

- Bot scope `bot` plus the `applications.commands` scope (for `/session`).
- Permission to view + send messages and embed links in the target channel.
- The bot's role must be **above** the "Session Ping" role so it can assign it.

## ER:LC API

If `ERLC_API_KEY` is configured, the bot calls `ERLC_API_URL` (default
`https://api.erlc.dev/v1/server`) on every `/session` and sends the key as both
`server-key` and `Authorization` headers because ER:LC API deployments differ in
header naming. Without a key the stats simply show "Unavailable" — the embed
still posts fine.

## Notes on this build

- `/session` replies **publicly** by default so the whole channel sees the embed
  (previously it replied ephemerally, which only the command author could see).
- One failed interaction can't crash the bot; failures are logged to the console.
- Never commit `.env` or paste a bot token into source code. Regenerate any token
  that has been exposed.