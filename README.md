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

| Tier | User ID / Role | Can do |
|------|----------------|--------|
| Owner | `1341965114101731418` | Everything, including bans, kicks, timeouts, purges, announcements, channel locks and retrigger |
| Directive Team | `1341931745351700534` | Sessions, panels, ticket desk, suggestions, ticket members, server stats, staff records, meetings, in-game ER:LC |
| Staff Team | role `1341965114101731418` | Same set as Directive Team — anyone **wearing the Staff Team role** may run `-ai` |
| Everyone else | — | Refused |

**Meetings.** `-ai schedule a meeting in 2 hours to discuss staffing` DMs every
attendee a Components V2 invitation — it is **never posted in a channel**. The
card carries a single **Join the meeting** button that opens the voice channel
(or the invite the host supplied), and it only appears when a location was
actually given. Reminder DMs go out **7 days prior** and **the morning of**, and
at start time everyone gets a fresh *Meeting Starting Now* DM. `-ai postpone the
meeting by 1 hour` shifts the time and **edits every existing card in place**, so
nobody is pinged a second time; `-ai cancel the meeting` does the same. State
lives in `meetings.json` and reminders are re-armed on boot. Times are read in
the `MEETING_TZ_OFFSET` offset (default `-6`, US Central).

**Conversational follow-ups.** When a request is missing something the action
genuinely needs, the bot asks for it one question at a time instead of guessing
— e.g. `-ai schedule a meeting` chats you through *when → what → who → where → agenda*,
`-ai ban` asks *who → how long → why*. Answers are plain messages in the same
channel (no `-ai` prefix needed); anything already typed up front is never
asked about, so `-ai ban @user for 3 days spamming` still runs instantly with
no chatter. Say `skip` to keep an optional detail's default, `cancel` to stop,
or fire a fresh `-ai ...` command to replace a pending chat. Chats expire after
5 minutes of silence, and access is re-checked on every answer. Question tables
live in `src/ai_converse.js`.

**Duplicate replies.** When two bot instances receive the same message event,
`dedupReply()` makes them agree on a single winner (oldest reply id): the loser
deletes its own copy and stops **before** running the command, so a command
executes once and produces exactly one reply.

**Staff records.** `/staff infraction` is logged to `infractions.json`;
`-ai list infractions` shows the log and `-ai revoke @user infraction` clears one
and posts a revocation notice. `-ai revoke @user promotion` posts an official
demotion/revocation card. `-ai dm @user ...` sends a private DM.

**Cleaning up bot DMs.** Discord offers no API to enumerate a bot's DM history,
so every DM the bot sends is recorded (`bot_dms.json`) alongside the meeting
cards (`meetings.json`). `node cleanup-dms.mjs` silently deletes them — Discord
never notifies the recipient. Use `--dry-run` to preview and `--purge` to also
clear the records.

For older DMs sent before that tracking existed, `node purge-dms.mjs` walks the
recipient ids found in the bot's own data stores (Discord returns `[]` for
`GET /users/@me/channels` and this bot has no `GUILD_MEMBERS` intent), opens each
DM — which notifies nobody — and deletes the bot's messages inside a window:

```
node purge-dms.mjs --dry-run            # preview
node purge-dms.mjs --days 30            # delete the last 30 days
node purge-dms.mjs --channel id1,id2    # also consider those channels' authors
```

**Backfilling infractions.** The bot historically posted infraction cards
without storing them. `node import-infractions.mjs` reads the infraction channel
history back into `infractions.json` so `-ai list infractions` includes the old
ones. It is idempotent (records are keyed by Discord message id) and supports
`--dry-run`.

In-game ER:LC control (`-ai jail RobloxName`, `in game ban X for Y`,
`announce ...`, `hint ...`, `pm X ...`) and `-ai unban @user` are available to
staff rather than owner-only.

**Providers.** Three independent providers are tried in order; the first one to
answer wins, so you only need one working key:

| # | Provider | Key | Notes |
|---|----------|-----|-------|
| 1 | Ollama | `OLLAMA_API_KEY` | Free and fully local (uses the OpenAI-compatible endpoint at http://localhost:11434/v1). No daily cap and no check-in needed — but you must pull the model into Ollama first. |
| 2 | FreeTheAI | `AI_API_KEY` | Free. Needs a daily check-in at <https://freetheai.org/checkin> **and** has a daily request cap that resets at 00:00 UTC. |
| 3 | OpenRouter | `OPENROUTER_API_KEY` | Credit-based, very reliable. |
| 4 | HuggingFace | `HUGGINGFACE_API_KEY` | Free inference router. |

Each provider has its **own circuit breaker**, so one that is rate limited, out
of credit or offline is skipped with no network call at all rather than retried
on every request. Provider/token status is **never shown unless you ask** —
type `-ai providers` — and the bot log prints the chain on startup. With no keys
at all the bot still works via its built-in offline parser.

Model ids can be pinned per provider with `AI_MODEL`, `OPENROUTER_MODEL` and
`HUGGINGFACE_MODEL` (comma separated).

**How it works** — the request goes to the highest available provider
(OpenAI Chat Completions format), which returns one JSON object selecting from a
closed list of 43 actions. The current date and time are injected into every
prompt so the model can resolve "tomorrow at 7pm" correctly, and each provider
is capped at a 10-second timeout so a slow model fails over instead of hanging.
The action list is filtered to the caller's tier
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
to the last page for the full reference, or type `-ai help` (the help card is
DM'd to you when your DMs are open, so only you can read it).

Timed bans (`-ai ban @user for 7 days`) are stored in `ai_temp_bans.json` and
lifted automatically by a sweeper that re-arms itself on boot.

## Notes on this build

- `/session` replies **publicly** by default so the whole channel sees the embed
  (previously it replied ephemerally, which only the command author could see).
- One failed interaction can't crash the bot; failures are logged to the console.
- Never commit `.env` or paste a bot token into source code. Regenerate any token
  that has been exposed.