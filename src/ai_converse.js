/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AI CONVERSATIONS  —  multi-turn follow-up questions for the `-ai` engine.
 *
 *  When a resolved intent is missing something the action genuinely needs
 *  (a meeting time, the member to ban, the text to announce), the bot asks
 *  ONE question at a time and merges each answer into the pending intent.
 *  Anything already present — typed up front or supplied by the model — is
 *  never asked about, so `-ai ban @user for 3 days spamming` still runs
 *  instantly with no chatter.
 *
 *  A staff member answers with a plain message in the same channel (no `-ai`
 *  prefix needed). `skip` keeps an optional slot's default, `cancel` abandons
 *  the request, and a fresh `-ai ...` command always replaces a pending one.
 *  Sessions expire after AI_CONVERSATION_TTL_MS of silence.
 *
 *  State is in-memory only: a restart drops pending chats (safe — nothing was
 *  ever executed, so there is nothing to reconcile).
 *
 *  Nothing here imports index.js — index.js injects the Discord message and
 *  executes the finished intent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  clampNumber,
  extractUserId,
  normaliseDepartment,
  normaliseVoteDuration,
  parseDuration
} from './ai.js';
import { parseWhen } from './meetings.js';

/** How long a half-finished `-ai` chat survives without an answer. */
export const AI_CONVERSATION_TTL_MS = 5 * 60_000;

/** Max times a required slot is re-asked before the bot gives up. */
const MAX_SLOT_ATTEMPTS = 3;

/** @type {Map<string, object>} key -> session */
const sessions = new Map();

/** Session key: one pending chat per person per channel. */
export const aiConvoKey = (userId, channelId) => `${userId}:${channelId}`;

/** Answers that keep an optional slot's default. */
const SKIP_RE = /^(skip|none|n\/a|na|nothing|no|default|pass|leave it|idk|whatever|-)$/i;
/** Answers that abandon the whole request. */
const CANCEL_RE = /^(cancel|stop|abort|never\s?mind|forget it|quit|exit)\b/i;

/** True when the answer means "leave this optional detail at its default". */
export function isAiSkipAnswer(text) {
  return SKIP_RE.test(String(text ?? '').trim().replace(/[.!]+$/, ''));
}

/** True when the answer means "abandon the whole request". */
export function isAiCancelAnswer(text) {
  return CANCEL_RE.test(String(text ?? '').trim());
}

// ── Coercers: free text -> the arg shape executeIntent expects ──────────────

const asText = (max) => (value) => String(value ?? '').trim().slice(0, max);

/** `<@id>` mention or bare snowflake, from text or the live mention list. */
function userIdsFrom(answer, message) {
  const ids = [];
  if (message?.mentions?.users) {
    for (const id of message.mentions.users.keys()) ids.push(id);
  }
  for (const m of String(answer ?? '').matchAll(/<@!?(\d{17,20})>/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  const bare = String(answer ?? '').match(/\b\d{17,20}\b/);
  if (bare && !ids.includes(bare[0])) ids.push(bare[0]);
  return ids;
}

/** One user: mention/id from the answer, else null. */
const coerceUserId = (value, message) =>
  userIdsFrom(value, message)[0] ?? extractUserId(value) ?? null;

/** Meeting invitees: mentions win, then "staff"/"everyone", then a bare id. */
function coerceAttendees(value, message) {
  const ids = userIdsFrom(value, message);
  if (ids.length) return ids;
  const t = String(value ?? '').trim().toLowerCase();
  if (/\b(everyone|everybody|all|server|@everyone)\b/.test(t)) return ['everyone'];
  if (/\b(staff|team|mods?|moderators?)\b/.test(t)) return ['staff'];
  return null;
}

/** "how long" for bans: weeks/days down, "permanent" becomes unlimited. */
function coerceBanDays(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/^(perm|permanent|permanently|forever|indefinite|infinite)\b/.test(text)) return null;
  const parsed = parseDuration(text, { unit: 'day' });
  if (!parsed || parsed.permanent) return parsed?.permanent ? null : undefined;
  if (parsed.durationDays) return clampNumber(parsed.durationDays, 1, 36500, null);
  // A sub-day answer ("12h") still bans — round it up to a day.
  if (parsed.ms) return 1;
  return undefined;
}

/** "how long" for timeouts, in minutes (Discord caps at 28 days). */
function coerceTimeoutMinutes(value) {
  const parsed = parseDuration(String(value ?? '').trim(), { unit: 'minute' });
  if (!parsed || !parsed.ms) return undefined;
  return clampNumber(Math.round(parsed.ms / 60_000), 1, 40320, null);
}

const TRUE_WORDS = /^(y|yes|yeah|yep|sure|ok|okay|true|on|open|enable|enabled|unlock|unlocked|allow|start)\b/;
const FALSE_WORDS = /^(n|no|nope|false|off|close|closed|shut|lock|locked|disable|disabled|stop|pause)\b/;

/** yes/no/open/closed -> boolean, anything else -> undefined (re-ask). */
function coerceBool(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (TRUE_WORDS.test(t)) return true;
  if (FALSE_WORDS.test(t)) return false;
  return undefined;
}

/** "busy"/"open"/"shut" -> the canonical desk status word. */
function coerceDeskStatus(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (/\bbusy\b/.test(t)) return 'busy';
  if (/\b(closed?|shut|lock|off)\b/.test(t)) return 'closed';
  if (/\b(open|online|on|available)\b/.test(t)) return 'online';
  return undefined;
}

/** "hi + ia" / "high rank" -> the canonical department key. */
function coerceDepartment(value) {
  return normaliseDepartment(value) ?? undefined;
}

/** Free text -> one of the vote preset keys via the normaliser. */
const coerceVoteDuration = (value) => {
  const ms = parseDuration(String(value ?? '').trim(), { unit: 'minute' })?.ms;
  if (!ms) return undefined;
  return normaliseVoteDuration(value);
};

/** A role mention/id for the session-vote ping, or null to ping nobody. */
function coercePingRole(value, message) {
  const role = message?.mentions?.roles?.first?.();
  if (role?.id) return role.id;
  const bare = String(value ?? '').match(/<@&(\d{17,20})>/)?.[1]
    ?? String(value ?? '').match(/\b\d{17,20}\b/)?.[0]
    ?? null;
  return bare;
}

/** "a, b; c" or "a or b" -> an option list. */
function coerceOptions(value) {
  const parts = String(value ?? '')
    .split(/[;\n]/)
    .flatMap((p) => p.split(/\s+or\s+/i))
    .map((p) => p.trim().replace(/^[-•\d.)\s]+/, '').trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 10) : undefined;
}

const ERLC_VERBS = new Set(['pm', 'message', 'hint', 'jail', 'unjail', 'kick', 'ban', 'unban']);

function coerceErLcVerb(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (ERLC_VERBS.has(t)) return t;
  if (/\bwarn\b/.test(t)) return 'hint';
  if (/\bshout\b|\bbroadcast\b|\bannounce/.test(t)) return 'message';
  if (/\b(release|free)\b/.test(t)) return 'unjail';
  return undefined;
}

// ── Slot table ───────────────────────────────────────────────────────────────
// `question` is what the bot asks. `required` slots are re-asked instead of
// skipped; optional slots fall back to `skipValue`. `validate`/`coerce` turn
// the free-text answer into the arg; `invalid` is the retry hint. `when`
// hides a slot that does not apply (e.g. no `player` for a broadcast).

const slot = (key, question, opts = {}) => ({ key, question, required: false, ...opts });

export const AI_SLOTS = {
  meeting_schedule: [
    slot('start', '📅 **When should the meeting be?**\n> e.g. `in 2 hours` · `tomorrow at 7pm` · `2026-10-26T19:00`', {
      required: true,
      validate: (v) => !!parseWhen(v),
      coerce: asText(120),
      invalid: '❌ I could not read that time. Try `in 2 hours` or `tomorrow at 7pm`.'
    }),
    slot('title', '📝 **What should I call the meeting?**\n> or say `skip` for “Staff Meeting”.', {
      skipValue: 'Staff Meeting',
      validate: (v) => v.trim().length > 0,
      coerce: asText(120)
    }),
    slot('attendees', '👥 **Who is invited?**\n> Mention them, say `staff` / `everyone`, or say `skip` for the Staff Team.', {
      skipValue: ['staff'],
      validate: (v, m) => !!coerceAttendees(v, m),
      coerce: coerceAttendees,
      invalid: '❌ Mention someone, or say `staff` / `everyone` / `skip`.'
    }),
    slot('location', '📍 **Where is it?**\n> A voice-channel mention, an invite link, or say `skip`.', {
      validate: (v) => v.trim().length > 0,
      coerce: asText(200)
    }),
    slot('agenda', '🗒 **Anything for the agenda?**\n> or say `skip`.', {
      validate: (v) => v.trim().length > 0,
      coerce: asText(800)
    })
  ],

  session_vote: [
    slot('needed', '🗳 **How many votes do we need to launch?** (2–200)\n> or say `skip` for 5.', {
      skipValue: 5,
      validate: (v) => /-?\d+/.test(v),
      coerce: (v) => clampNumber(v, 2, 200, 5),
      invalid: '❌ Give me a number between 2 and 200.'
    }),
    slot('duration', '⏳ **How long should voting stay open?**\n> `30m` · `1h` · `2h` · `5h`, or say `skip` for 1 hour.', {
      skipValue: '1h',
      validate: (v) => coerceVoteDuration(v) !== undefined,
      coerce: coerceVoteDuration,
      invalid: '❌ Try `30m`, `1h`, `2h` or `5h`.'
    }),
    slot('ping_role_id', '📣 **Which role should I ping?**\n> Mention it, or say `skip` for no ping.', {
      coerce: coercePingRole
    })
  ],

  ban: [
    slot('user_id', '🔨 **Who should I ban?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    }),
    slot('duration_days', '⏱ **How long?**\n> e.g. `3 days`, `permanent`, or say `skip` for permanent.', {
      skipValue: null,
      validate: (v) => coerceBanDays(v) !== undefined,
      coerce: coerceBanDays,
      invalid: '❌ Try `3 days`, `permanent`, or say `skip`.'
    }),
    slot('reason', '🧾 **Reason?**\n> or say `skip`.', {
      skipValue: 'No reason provided',
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ],

  kick: [
    slot('user_id', '👢 **Who should I kick?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    }),
    slot('reason', '🧾 **Reason?**\n> or say `skip`.', {
      skipValue: 'No reason provided',
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ],

  timeout: [
    slot('user_id', '🔇 **Who should I time out?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    }),
    slot('minutes', '⏱ **For how long?**\n> e.g. `30 minutes`, `2 hours`, `3 days`.', {
      required: true,
      validate: (v) => coerceTimeoutMinutes(v) !== undefined,
      coerce: coerceTimeoutMinutes,
      invalid: '❌ Give me a length, e.g. `30 minutes` or `2 hours`.'
    }),
    slot('reason', '🧾 **Reason?**\n> or say `skip`.', {
      skipValue: 'No reason provided',
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ],

  untimeout: [
    slot('user_id', '🔊 **Whose timeout should I clear?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    })
  ],

  unban: [
    slot('user_id', '✅ **Who should I unban?**\n> Paste their user ID (they are not in the server).', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a user ID — who is it?'
    })
  ],

  dm_user: [
    slot('user_id', '✉️ **Who should I DM?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    }),
    slot('text', '💬 **What should the DM say?**', {
      required: true,
      validate: (v) => v.trim().length > 0,
      coerce: asText(1800)
    })
  ],

  purge: [
    slot('amount', '🧹 **How many recent messages?** (1–100)\n> or say `skip` for 10.', {
      skipValue: 10,
      validate: (v) => /-?\d+/.test(v),
      coerce: (v) => clampNumber(v, 1, 100, 10),
      invalid: '❌ Give me a number between 1 and 100.'
    })
  ],

  say: [
    slot('text', '📣 **What should I announce?**', {
      required: true,
      validate: (v) => v.trim().length > 0,
      coerce: asText(1800)
    })
  ],

  slowmode: [
    slot('seconds', '🐢 **How many seconds of slowmode?**\n> `0` turns it off.', {
      required: true,
      validate: (v) => /-?\d+/.test(v),
      coerce: (v) => clampNumber(v, 0, 21600, 30),
      invalid: '❌ Give me a number of seconds, e.g. `30` (or `0` for off).'
    })
  ],

  desk_status: [
    slot('status', '🎫 **What should the desk be?**\n> `online` · `busy` · `closed`', {
      required: true,
      validate: (v) => coerceDeskStatus(v) !== undefined,
      coerce: coerceDeskStatus,
      invalid: '❌ Say `online`, `busy` or `closed`.'
    })
  ],

  desk_department: [
    slot('department', '🎫 **Which department?**\n> general · ia · highrank · partnership · staff_partnership · applications', {
      required: true,
      validate: (v) => coerceDepartment(v) !== undefined,
      coerce: coerceDepartment,
      invalid: '❌ Try: general, ia, highrank, partnership, staff_partnership or applications.'
    }),
    slot('open', '🔓 **Open it or lock it?**\n> say `open` or `closed`.', {
      required: true,
      validate: (v) => coerceBool(v) !== undefined,
      coerce: coerceBool,
      invalid: '❌ Say `open` or `closed`.'
    })
  ],

  poll: [
    slot('question', '📊 **What is the poll question?**', {
      required: true,
      validate: (v) => v.trim().length > 0,
      coerce: asText(300)
    }),
    slot('options', '🔢 **What are the choices?**\n> Separate 2–10 of them with `;` or the word `or`.', {
      required: true,
      validate: (v) => coerceOptions(v) !== undefined,
      coerce: coerceOptions,
      invalid: '❌ Give me at least 2 choices, e.g. `Friday; Saturday`.'
    })
  ],

  suggestion_create: [
    slot('text', '💡 **What is the suggestion?**\n> I will post your exact words.', {
      required: true,
      validate: (v) => v.trim().length > 0,
      coerce: asText(1000)
    })
  ],

  infraction_revoke: [
    slot('user_id', '📋 **Whose infraction should I revoke?**\n> Mention them — or say `skip` for the newest infraction overall.', {
      coerce: coerceUserId
    }),
    slot('reason', '🧾 **Reason for revoking?**\n> or say `skip`.', {
      skipValue: 'Revoked by staff',
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ],

  promotion_revoke: [
    slot('user_id', '📉 **Whose promotion should I revoke?**\n> Mention them or paste their user ID.', {
      required: true,
      validate: (v, m) => !!coerceUserId(v, m),
      coerce: coerceUserId,
      invalid: '❌ I need a mention or a user ID — who is it?'
    }),
    slot('reason', '🧾 **Reason?**\n> or say `skip`.', {
      skipValue: 'Promotion revoked',
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ],

  erlc_action: [
    slot('verb', '🎮 **Which in-game command?**\n> `pm` · `message` · `hint` · `jail` · `unjail` · `kick` · `ban` · `unban`', {
      required: true,
      validate: (v) => coerceErLcVerb(v) !== undefined,
      coerce: coerceErLcVerb,
      invalid: '❌ Pick one: pm, message, hint, jail, unjail, kick, ban, unban.'
    }),
    slot('player', '👤 **Which Roblox player?**', {
      required: true,
      when: (a) => ['pm', 'jail', 'unjail', 'kick', 'ban', 'unban'].includes(a.verb),
      validate: (v) => /^@?[A-Za-z][A-Za-z0-9_]{2,19}$/.test(v.trim()),
      coerce: (v) => v.trim().replace(/^@/, '').slice(0, 20),
      invalid: '❌ That does not look like a Roblox username — who is it?'
    }),
    slot('text', '💬 **What should I send?**', {
      required: true,
      when: (a) => ['pm', 'message', 'hint'].includes(a.verb),
      validate: (v) => v.trim().length > 0,
      coerce: asText(400)
    })
  ]
};

// ── Session engine ───────────────────────────────────────────────────────────

/** True when the slot's value already counts as provided. */
function slotFilled(slot, args) {
  const value = args?.[slot.key];
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return true;
  return String(value).trim() !== '';
}

/** First slot in ask order that still needs an answer, or null. */
export function nextAiSlot(action, args, settled) {
  const slots = AI_SLOTS[action];
  if (!slots) return null;
  const safe = args ?? {};
  for (const s of slots) {
    if (settled?.has(s.key)) continue;
    if (s.when && !s.when(safe)) continue;
    if (!slotFilled(s, safe)) return s;
  }
  return null;
}

/** True when the action can be completed as a back-and-forth chat. */
export function aiSupportsConvo(action) {
  return Boolean(AI_SLOTS[action]);
}

/**
 * Opens a conversation for an intent that is missing details.
 * @returns {object|null} the new session, or null when nothing is missing.
 */
export function startAiConvo(key, intent, channelId, tier) {
  const slot = nextAiSlot(intent.action, intent.args);
  if (!slot) return null;
  const convo = {
    intent: { action: intent.action, args: { ...(intent.args ?? {}) }, tier, reply: intent.reply ?? '' },
    slotKey: slot.key,
    settled: new Set(),
    attempts: 1,
    channelId,
    expiresAt: Date.now() + AI_CONVERSATION_TTL_MS
  };
  sessions.set(key, convo);
  return convo;
}

/** Live session for a key, or null when absent/expired. Expired ones die here. */
export function getAiConvo(key) {
  const convo = sessions.get(key);
  if (!convo) return null;
  if (convo.expiresAt < Date.now()) {
    sessions.delete(key);
    return null;
  }
  return convo;
}

/** Drops a session (cancelled, completed or replaced). */
export function clearAiConvo(key) {
  sessions.delete(key);
}

/** The slot the session is currently waiting on. */
export function currentAiSlot(convo) {
  return (AI_SLOTS[convo.intent.action] ?? []).find((s) => s.key === convo.slotKey) ?? null;
}

/** Touch the session so it survives another TTL window. */
export function touchAiConvo(convo) {
  convo.expiresAt = Date.now() + AI_CONVERSATION_TTL_MS;
}

/**
 * Folds one answer into the session.
 *
 * @returns {{ status: 'next'|'done'|'retry'|'giveup', slot?: object, invalid?: string }}
 *   - `next`  — advance to `slot` (the following question)
 *   - `done`  — every slot is filled, the intent is ready to run
 *   - `retry` — the answer did not validate; ask the SAME slot again (`invalid`)
 *   - `giveup`— a required slot was dodged too often; abandon the chat
 */
export function applyAiAnswer(convo, slot, answer, message) {
  const text = String(answer ?? '').trim();

  // Optional slot + "skip" -> keep the default and move on.
  if (!slot.required && isAiSkipAnswer(text)) {
    if (slot.skipValue !== undefined) convo.intent.args[slot.key] = slot.skipValue;
    else delete convo.intent.args[slot.key];
    convo.settled.add(slot.key);
    return advance(convo);
  }

  // Required slot + "skip" -> re-ask firmly, then give up.
  if (slot.required && isAiSkipAnswer(text)) {
    convo.attempts += 1;
    if (convo.attempts > MAX_SLOT_ATTEMPTS) return { status: 'giveup' };
    return { status: 'retry', slot, invalid: `I need this one to continue — ${slot.question}` };
  }

  const valid = slot.validate ? slot.validate(text, message) : text.length > 0;
  if (!valid) {
    convo.attempts += 1;
    if (convo.attempts > MAX_SLOT_ATTEMPTS) return { status: 'giveup' };
    return { status: 'retry', slot, invalid: slot.invalid ?? 'That did not look right — try again.' };
  }

  convo.intent.args[slot.key] = slot.coerce ? slot.coerce(text, message) : text;
  convo.settled.add(slot.key);
  convo.attempts = 1;
  return advance(convo);
}

/** Moves the session to its next open slot, or reports completion. */
function advance(convo) {
  const next = nextAiSlot(convo.intent.action, convo.intent.args, convo.settled);
  if (!next) return { status: 'done' };
  convo.slotKey = next.key;
  convo.attempts = 1;
  touchAiConvo(convo);
  return { status: 'next', slot: next };
}

