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

## AI Command Engine (`-ai`)

Type what you want in plain English and the bot does it:

```
-ai start a session vote with 5 users for 2 hours
-ai close the general ticket
-ai make the ticket desk busy
-ai ban @user for 7 days for spamming
-ai timeout @user for 2 hours
-ai jail RobloxName
-ai post the verification panel
-ai help
```

**Access**

| Tier | User ID | Can do |
|------|---------|--------|
| Owner | `1341965114101731418` | Everything, including bans, kicks, timeouts, purges, announcements, channel locks and retrigger |
| Directive Team | `1341931745351700534` | Sessions, panels, ticket desk, suggestions, ticket members, server stats |
| Everyone else | — | Refused |

**Providers.** Three independent providers are tried in order; the first one to
answer wins, so you only need one working key:

| # | Provider | Key | Notes |
|---|----------|-----|-------|
| 1 | FreeTheAI | `AI_API_KEY` | Free. Needs a daily check-in at <https://freetheai.org/checkin> **and** has a daily request cap that resets at 00:00 UTC. |
| 2 | OpenRouter | `OPENROUTER_API_KEY` | Credit-based, very reliable. |
| 3 | HuggingFace | `HUGGINGFACE_API_KEY` | Free inference router. |

Each provider has its **own circuit breaker**, so one that is rate limited, out
of credit or offline is skipped with no network call at all rather than retried
on every request. `-ai help` shows the live status of all three, and the bot log
prints the chain on startup. With no keys at all the bot still works via its
built-in offline parser.

Model ids can be pinned per provider with `AI_MODEL`, `OPENROUTER_MODEL` and
`HUGGINGFACE_MODEL` (comma separated).

**How it works** — the request goes to the highest available provider
(OpenAI Chat Completions format), which returns one JSON object selecting from a
closed list of 22 actions. The action list is filtered to the caller's tier
before the prompt is sent, so the directive team is never even offered the
owner's actions. The result is validated locally again, then executed. An
unknown action is refused rather than guessed at. Every action is written to
Security-Logs with the request, the user, the resolved action, which provider
answered and the result.

Suggestion text is **always the user's exact words** — the AI picks the action
but is never allowed to author the body, since that card is posted publicly
under the author's name.

`-ai` is **prefix only** — there is deliberately no `/ai` slash command, so the
engine can never be triggered by an interaction payload. Run `/commands` and go
to the last page for the full reference, or type `-ai help`.

Timed bans (`-ai ban @user for 7 days`) are stored in `ai_temp_bans.json` and
lifted automatically by a sweeper that re-arms itself on boot.

## Notes on this build

- `/session` replies **publicly** by default so the whole channel sees the embed
  (previously it replied ephemerally, which only the command author could see).
- One failed interaction can't crash the bot; failures are logged to the console.
- Never commit `.env` or paste a bot token into source code. Regenerate any token
  that has been exposed.