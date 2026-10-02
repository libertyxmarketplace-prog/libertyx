/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AI COMMAND ENGINE  —  natural-language staff control for Alabama Bot PRC.
 *
 *  Uses the FreeTheAI OpenAI-compatible gateway
 *  (https://api.freetheai.org/v1/chat/completions) to translate a plain-English
 *  request such as "start a session vote with 5 users" into a validated action
 *  object, then executes it against the running bot.
 *
 *  DESIGN NOTES
 *  ─────────────
 *  • ACCESS   — prefix only (`-ai ...`). No slash command is registered, so the
 *               engine can never be triggered by an interaction payload.
 *  • OWNER    — 1341965114101731418 has every action.
 *  • DIRECTIVE— 1341931745351700534 gets the non-destructive set (status, desk
 *               toggles, panels, votes, suggestions).
 *  • STAFF    — anyone holding the Staff Team role 1341965114101731418 gets the
 *               same non-destructive set as the directive tier.
 *  • SAFETY   — the model may only select from the closed ACTION_SCHEMA below,
 *               and every action declares a `risk` level that is re-enforced by
 *               the executor. Anything unknown is refused, never guessed.
 *  • FALLBACK — if the gateway is unreachable (daily check-in, 429, 503 ...) a
 *               deterministic local parser handles the common phrasings so the
 *               command still works offline.
 *
 *  Nothing here imports index.js — index.js injects the runtime context, which
 *  keeps the dependency arrow one-directional.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

// ── Access control ────────────────────────────────────────────────────────────
export const AI_OWNER_ID = '1341965114101731418';
export const AI_DIRECTIVE_ID = '1341931745351700534';
// Staff Team role — every member holding it may use the non-destructive set.
export const AI_STAFF_ROLE_ID = '1341965114101731418';

/**
 * Returns the permission tier of a Discord user for the AI engine.
 *
 * @param {string} userId
 * @param {string[]} [roleIds] role ids of the member in the guild the command ran in
 * @returns {'owner'|'directive'|'staff'|'none'}
 */
export function aiAccessTier(userId, roleIds = []) {
  if (!userId) return 'none';
  if (userId === AI_OWNER_ID) return 'owner';
  if (userId === AI_DIRECTIVE_ID) return 'directive';
  // Staff Team role gets everything the directive tier gets (risk !== 'owner').
  if (Array.isArray(roleIds) && roleIds.includes(AI_STAFF_ROLE_ID)) return 'staff';
  return 'none';
}

// ── Provider chain ────────────────────────────────────────────────────────────
// Three independent providers, tried in order. Whichever answers first wins; the
// others cover for it when it is rate limited, out of credit or offline.
//
//   1. FreeTheAI  — free, but needs a daily check-in AND has a daily request cap.
//   2. OpenRouter — cheap, very reliable, has a free/credit balance.
//   3. HuggingFace — free inference router, good as a last resort.
//
// Each provider is skipped entirely once its circuit breaker trips, so a dead
// provider costs nothing rather than a wasted round trip per request.

const FTA_BASE = (process.env.AI_API_URL || 'https://api.freetheai.org').replace(/\/+$/, '');
const FTA_KEY = (process.env.AI_API_KEY || '').trim();

const OR_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const HF_KEY = (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();

/** Splits a comma-separated env override into a clean model list. */
function modelList(raw, fallback) {
  const value = (raw || '').trim();
  if (!value) return fallback;
  return value.split(',').map((m) => m.trim()).filter(Boolean);
}

/**
 * The provider chain, highest preference first. A provider with no key
 * configured is dropped automatically.
 */
export const AI_PROVIDERS = [
  {
    name: 'FreeTheAI',
    baseUrl: `${FTA_BASE}/v1/chat/completions`,
    key: FTA_KEY,
    keyPrefix: 'ftai_',
    models: modelList(process.env.AI_MODEL, [
      'fta/ocz/space-bunny-free',
      'fta/kai/stepfun/step-3.7-flash:free',
      'fta/kai/nvidia/nemotron-3.5-lightning:free',
      'fta/kai/kilo-auto/free'
    ]),
    // FreeTheAI free routes need the owner's daily web check-in.
    extraHeaders: () => ({}),
    dailyReset: true
  },
  {
    name: 'OpenRouter',
    baseUrl: (process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '') + '/chat/completions',
    key: OR_KEY,
    keyPrefix: 'sk-or-v1-',
    models: modelList(process.env.OPENROUTER_MODEL, [
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp:free',
      'deepseek/deepseek-chat'
    ]),
    // OpenRouter attributes app traffic in its dashboard and enforces its own
    // rate limits; these headers are recommended in their docs.
    extraHeaders: () => ({
      'HTTP-Referer': 'https://github.com/libertyxmarketplace-prog/libertyx',
      'X-Title': 'Alabama Bot PRC'
    }),
    dailyReset: false
  },
  {
    name: 'HuggingFace',
    baseUrl: (process.env.HUGGINGFACE_API_URL || 'https://router.huggingface.co/v1').replace(/\/+$/, '') + '/chat/completions',
    key: HF_KEY,
    keyPrefix: 'hf_',
    models: modelList(process.env.HUGGINGFACE_MODEL, [
      'Qwen/Qwen3-4B-Instruct-2507',
      'meta-llama/Llama-3.1-8B-Instruct'
    ]),
    extraHeaders: () => ({}),
    dailyReset: false
  }
].filter((p) => p.key.startsWith(p.keyPrefix));

/** True when at least one provider has a usable key. */
export const aiConfigured = () => AI_PROVIDERS.length > 0;

/** Human-readable provider summary for the boot log. */
export const providerSummary = () =>
  AI_PROVIDERS.length
    ? AI_PROVIDERS.map((p) => `${p.name} (${p.models.length} model${p.models.length === 1 ? '' : 's'})`).join(' -> ')
    : 'none configured';


// ── Action schema ─────────────────────────────────────────────────────────────
// `risk: 'directive'` actions are the ones the directive team may also run.
// `risk: 'owner'` actions are destructive or infrastructure-level.
export const ACTION_SCHEMA = [
  {
    action: 'session_vote',
    risk: 'directive',
    args: { needed: 'int 2-200', duration: "'30m'|'1h'|'2h'|'5h'", ping_role_id: 'snowflake or null' },
    desc: 'Open a live session vote needing N votes for a duration, pinging a role.'
  },
  { action: 'session_shutdown', risk: 'directive', args: {}, desc: 'Close the session: post the Session Closed card and DM every voter.' },
  { action: 'panel_post', risk: 'directive', args: { type: "'session'|'ticket'|'verify'|'application'|'information'|'shop'" }, desc: 'Post or refresh one of the server panels.' },
  { action: 'desk_status', risk: 'directive', args: { status: "'online'|'busy'|'closed'" }, desc: 'Set the whole ticket desk to Online, Busy or Closed.' },
  {
    action: 'desk_department',
    risk: 'directive',
    args: { department: "'general'|'ia'|'highrank'|'partnership'|'staff_partnership'|'applications'", open: 'boolean' },
    desc: 'Open or lock a single ticket department.'
  },
  { action: 'desk_info', risk: 'directive', args: {}, desc: 'Report the current ticket desk status and every department.' },
  { action: 'suggestion_create', risk: 'directive', args: { text: 'string' }, desc: 'Post a community suggestion card with up/down voting and a thread.' },
  { action: 'suggestion_top', risk: 'directive', args: {}, desc: 'Show the highest-rated community suggestion.' },
  { action: 'ticket_member', risk: 'directive', args: { op: "'add'|'unadd'", user_id: 'snowflake' }, desc: 'Add or remove a member from the active ticket in this channel.' },
  { action: 'server_stats', risk: 'directive', args: {}, desc: 'Report live ER:LC player count, queue, staff and join code.' },
  { action: 'commands_guide', risk: 'directive', args: {}, desc: 'Show the interactive command directory.' },
  { action: 'ai_help', risk: 'directive', args: {}, desc: 'Explain how to use the AI engine and list every supported request.' },
  { action: 'ban', risk: 'owner', args: { user_id: 'snowflake', reason: 'string', delete_days: 'int 0-7', duration_days: 'int|null' }, desc: 'Ban a Discord user from the server.' },
  { action: 'unban', risk: 'directive', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Revoke/lift a Discord ban so the user may rejoin.' },
  { action: 'kick', risk: 'owner', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Kick a member from the server.' },
  { action: 'timeout', risk: 'owner', args: { user_id: 'snowflake', minutes: 'int 1-40320', reason: 'string' }, desc: 'Timeout (mute) a member for a number of minutes.' },
  { action: 'untimeout', risk: 'owner', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Clear an active timeout.' },
  { action: 'purge', risk: 'owner', args: { amount: 'int 1-100', reason: 'string' }, desc: 'Bulk delete recent messages in this channel.' },
  { action: 'say', risk: 'owner', args: { channel_id: 'snowflake or null', text: 'string' }, desc: 'Send an announcement as the bot.' },
  { action: 'channel_lock', risk: 'owner', args: { locked: 'boolean', reason: 'string' }, desc: 'Lock or unlock the current channel for @everyone.' },
  { action: 'retrigger', risk: 'owner', args: {}, desc: 'Emergency re-sync: re-register commands, reload every datastore, restart loops.' },
  {
    action: 'erlc_action',
    risk: 'directive',
    args: { verb: "'pm'|'message'|'hint'|'jail'|'unjail'|'kick'|'ban'|'unban'", player: 'roblox username', text: 'reason or message' },
    desc: 'Run an in-game ER:LC command. message/hint broadcast to the whole server; pm DMs one player; jail/unjail/kick/ban/unban act on one player. Put the staff reason in text for kick/ban.'
  },
  // ── Ticket lifecycle (staff) ────────────────────────────────────────────────
  {
    action: 'ticket_close',
    risk: 'directive',
    args: {},
    desc: 'Close the open ticket IN THIS CHANNEL: archive the transcript, then delete the channel. Use whenever someone says to close "this", "the" or one named single ticket (e.g. "close the general ticket"). NOT for departments or panels.'
  },
  { action: 'ticket_info', risk: 'directive', args: {}, desc: 'Show the details of the open ticket in this channel: category, author, claim, age and reason.' },
  // ── Channel tools (staff) ───────────────────────────────────────────────────
  { action: 'slowmode', risk: 'directive', args: { seconds: 'int 0-21600' }, desc: 'Set slowmode on this channel (0 turns it off).' },
  { action: 'pin_message', risk: 'directive', args: {}, desc: "Pin the message being replied to, or otherwise the latest message in this channel." },
  // ── Community & information (staff) ─────────────────────────────────────────
  { action: 'poll', risk: 'directive', args: { question: 'string', options: 'string[] (2-10 answers)' }, desc: 'Post a numbered reaction poll in this channel.' },
  { action: 'whois', risk: 'directive', args: { user_id: 'snowflake or null' }, desc: 'Member card: account age, join date, roles and timeout state. Defaults to the caller.' },
  { action: 'avatar', risk: 'directive', args: { user_id: 'snowflake or null' }, desc: "Post a member's avatar image. Defaults to the caller." },
  { action: 'guild_info', risk: 'directive', args: {}, desc: 'Discord server overview: members, roles, channels, boosts, owner and creation date.' },
  { action: 'bot_stats', risk: 'directive', args: {}, desc: 'Bot ping, uptime and memory usage.' },
  {
    action: 'provider_status',
    risk: 'directive',
    args: {},
    desc: 'Live AI provider status (ready / rate-limited / retry timers). ONLY use when the user EXPLICITLY asks about providers, tokens, credits or the gateway — never proactively.'
  },
  // ── Staff records: infractions & promotions ─────────────────────────────────
  {
    action: 'infraction_list',
    risk: 'directive',
    args: { user_id: 'snowflake or null', limit: 'int 1-25' },
    desc: 'List recent official staff infractions from the log. Give a user_id to filter to one member.'
  },
  {
    action: 'infraction_revoke',
    risk: 'directive',
    args: { user_id: 'snowflake or null', id: 'string or null', reason: 'string' },
    desc: 'Revoke an outstanding staff infraction and post a revocation notice. Without an id, revokes the most recent infraction for that member (or the newest overall).'
  },
  {
    action: 'promotion_revoke',
    risk: 'directive',
    args: { user_id: 'snowflake', reason: 'string', notes: 'string or null' },
    desc: 'Revoke a promotion: post an official demotion/revocation notice for a member in the staff channel.'
  },
  // ── Direct messages ─────────────────────────────────────────────────────────
  {
    action: 'dm_user',
    risk: 'directive',
    args: { user_id: 'snowflake', text: 'string' },
    desc: 'Send a private direct message to a member on behalf of staff.'
  },
  // ── Meetings ────────────────────────────────────────────────────────────────
  {
    action: 'meeting_schedule',
    risk: 'directive',
    args: {
      title: 'string',
      start: 'ISO datetime, or relative like "in 2 hours" / "tomorrow at 7pm"',
      location: 'voice channel id, invite/link, or null',
      attendees: "list of @users/user ids, or 'staff' (the staff role), or 'everyone'",
      agenda: 'string or null',
      reminders: 'boolean — default true (7 days prior + the morning of)'
    },
    desc: 'Plan a meeting: DM every attendee an RSVP card with Can attend / Cannot attend buttons, post an announcement, and schedule reminder DMs (7 days prior and the morning of).'
  },
  {
    action: 'meeting_postpone',
    risk: 'directive',
    args: { by: 'duration like "2 hours" or "3 days"', reason: 'string or null' },
    desc: 'Postpone the next scheduled meeting by a duration. Shifts the time, edits every DM card in place (so nobody is pinged twice) and reschedules reminders.'
  },
  {
    action: 'meeting_cancel',
    risk: 'directive',
    args: { reason: 'string or null' },
    desc: 'Cancel the next scheduled meeting and tell everyone who replied that it is off.'
  },
  {
    action: 'meeting_list',
    risk: 'directive',
    args: {},
    desc: 'List every scheduled meeting with its time, location and RSVP counts.'
  },
  // ── Owner-only additions ────────────────────────────────────────────────────
  { action: 'nick', risk: 'owner', args: { user_id: 'snowflake', nickname: 'string (empty to clear)' }, desc: "Set or clear a member's server nickname." },
  { action: 'role_grant', risk: 'owner', args: { op: "'add'|'remove'", user_id: 'snowflake', role: 'role name or snowflake' }, desc: 'Add or remove a role on a member.' },
  { action: 'channel_hide', risk: 'owner', args: { hidden: 'boolean' }, desc: 'Hide or reveal this channel for @everyone (View Channel).' }
];

export const OWNER_ONLY_ACTIONS = new Set(ACTION_SCHEMA.filter((a) => a.risk === 'owner').map((a) => a.action));
export const ALL_ACTIONS = new Set(ACTION_SCHEMA.map((a) => a.action));
export const PANEL_TYPES = new Set(['session', 'ticket', 'verify', 'application', 'information', 'shop']);

// ── Small parsing helpers ─────────────────────────────────────────────────────

/** Pulls a `<@123>` mention or a bare snowflake out of free text. */
export function extractUserId(text) {
  if (!text) return null;
  const mention = String(text).match(/<@!?(\d{17,20})>/);
  if (mention) return mention[1];
  const bare = String(text).match(/\b(\d{17,20})\b/);
  return bare ? bare[1] : null;
}

/** Extracts a channel snowflake from `<#123>` or a bare id. */
export function extractChannelId(text) {
  if (!text) return null;
  const mention = String(text).match(/<#(\d{17,20})>/);
  if (mention) return mention[1];
  const bare = String(text).match(/\b(\d{17,20})\b/);
  return bare ? bare[1] : null;
}

/**
 * Duration units, longest-first within each tier so "hours" is never read as
 * "s" and "minutes" is never read as "m".
 */
const DURATION_UNITS = [
  [/(?:milli ?seconds?|ms)/, 1],
  [/(?:seconds?|secs?|s)/, 1000],
  [/(?:minutes?|mins?|m)/, 60_000],
  [/(?:hours?|hrs?|h)/, 3_600_000],
  [/(?:days?|d)/, 86_400_000],
  [/(?:weeks?|wks?|w)/, 604_800_000]
];

/**
 * Splits a duration phrase into its number and its unit in one pass.
 * Returns null when the string is not "a number plus a recognised unit".
 * Matching the unit immediately after the digits is what keeps "2 hours" from
 * being misread as "2 seconds".
 */
function splitDuration(raw) {
  const text = String(raw).toLowerCase().trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = match[2];
  if (!unit) return { num, msPerUnit: null };
  for (const [pattern, msPerUnit] of DURATION_UNITS) {
    if (new RegExp(`^(?:${pattern.source})$`).test(unit)) return { num, msPerUnit };
  }
  return null;
}

/**
 * Understands "5", "for 5 days", "10m", "2 hours", "permanent", "perm".
 * Returns { ms, durationDays, permanent } — ms/durationDays are null when the
 * duration is permanent. A bare number takes the caller's default unit
 * (days for bans, minutes for timeouts).
 */
export function parseDuration(input, { unit = 'day' } = {}) {
  if (input === null || input === undefined || input === '') return null;
  const raw = String(input).toLowerCase().trim();
  if (/^(perm|permanently|permanent|forever|indefinite|infinite)$/.test(raw)) {
    return { ms: null, durationDays: null, permanent: true };
  }

  const parsed = splitDuration(raw);
  if (!parsed) return null;

  if (parsed.msPerUnit === null) {
    // A bare number takes the caller's default unit.
    if (unit === 'minute') return { ms: parsed.num * 60_000, durationDays: null, permanent: false };
    return { ms: parsed.num * 86_400_000, durationDays: parsed.num, permanent: false };
  }

  const ms = parsed.num * parsed.msPerUnit;
  const durationDays = parsed.msPerUnit >= 86_400_000 ? Math.round(ms / 86_400_000) : null;
  return { ms, durationDays, permanent: false };
}

/** Normalises any duration phrasing to one of the vote preset keys. */
export function normaliseVoteDuration(input) {
  const ms = parseDuration(input)?.ms;
  if (!ms) return '1h';
  if (ms <= 30 * 60_000) return '30m';
  if (ms <= 60 * 60_000) return '1h';
  if (ms <= 120 * 60_000) return '2h';
  return '5h';
}

const DEPARTMENTS = {
  general: 'general',
  'general support': 'general',
  ia: 'ia',
  internal: 'ia',
  internals: 'ia',
  'internal affairs': 'ia',
  highrank: 'highrank',
  'high rank': 'highrank',
  hr: 'highrank',
  shr: 'highrank',
  partnership: 'partnership',
  partnerships: 'partnership',
  'partner operations': 'partnership',
  'staff partnership': 'staff_partnership',
  applications: 'applications',
  apps: 'applications',
  application: 'applications'
};

export function normaliseDepartment(input) {
  if (!input) return null;
  return DEPARTMENTS[String(input).toLowerCase().trim().replace(/[\s_-]+/g, ' ')] ?? null;
}

/** Clamps a number into a range, returning the fallback when unusable. */
export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ── Provider gateway ───────────────────────────────────────────────────────────
// Every provider gets its OWN circuit breaker, so a dead one is skipped for free
// while the others keep serving.

/** Per-provider breaker state, keyed by provider name. */
const breakers = new Map();

/** Computes the next 00:00 UTC from now (FreeTheAI's daily reset). */
function nextUtcMidnight() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
}

/**
 * Trips a provider's breaker.
 * @param {object} provider
 * @param {'daily-limit'|'rate-limited'|'needs-checkin'|'unauthorized'|'error'} reason
 */
function tripBreaker(provider, reason) {
  let until;
  if (reason === 'daily-limit') {
    // Only FreeTheAI counts down to midnight; others just cool off.
    until = provider.dailyReset ? nextUtcMidnight() : Date.now() + 60 * 60_000;
  } else if (reason === 'rate-limited') {
    until = Date.now() + 5 * 60_000;
  } else if (reason === 'needs-checkin') {
    until = Date.now() + 30 * 60_000;
  } else if (reason === 'unauthorized') {
    until = Date.now() + 6 * 60 * 60_000;
  } else {
    until = Date.now() + 2 * 60_000;
  }
  breakers.set(provider.name, { until, reason });
  console.warn(
    `[ai] ${provider.name} unavailable (${reason}) — skipping it until <t:${Math.floor(until / 1000)}:R>.`
  );
}

/** Classifies an HTTP failure so the right breaker duration is chosen. */
function classifyFailure(status, detail) {
  if (status === 429) return /daily free request limit/i.test(detail) ? 'daily-limit' : 'rate-limited';
  if (status === 403) return 'needs-checkin';
  if (status === 401) return 'unauthorized';
  if (status === 402) return 'error';
  return 'error';
}

/**
 * Calls one provider, trying each of its models in turn.
 * @returns {Promise<{text: string, model: string}>}
 */
async function callProvider(provider, messages, { timeout, maxTokens }) {
  let lastError = null;

  for (const model of provider.models) {
    try {
      const res = await axios.post(
        provider.baseUrl,
        { model, messages, temperature: 0, max_tokens: maxTokens },
        {
          headers: {
            Authorization: `Bearer ${provider.key}`,
            'Content-Type': 'application/json',
            ...provider.extraHeaders()
          },
          timeout
        }
      );
      const text = res?.data?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) return { text: text.trim(), model };
      lastError = new Error(`${provider.name}/${model} returned an empty completion.`);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.error?.message || err?.message || 'unknown error';
      lastError = new Error(`${provider.name}/${model} -> ${status || 'ERR'}: ${detail}`);

      // Account-scoped failures hit every model on this provider identically,
      // so stop walking the list and open the breaker.
      if ([401, 402, 403, 413, 429].includes(status)) {
        tripBreaker(provider, classifyFailure(status, detail));
        break;
      }
      // A 404 just means that model slug is retired — try the next model.
    }
  }
  throw lastError ?? new Error(`${provider.name} is unreachable.`);
}

/**
 * Calls the provider chain and returns the first usable completion.
 * Providers whose breaker is open are skipped without a network call.
 *
 * @returns {Promise<{text: string, provider: string, model: string}>}
 */
export async function callAIProvider(messages, { timeout = 30_000, maxTokens = 700 } = {}) {
  if (!aiConfigured()) {
    const err = new Error('No AI provider keys are configured on this bot.');
    err.code = 'NO_KEY';
    throw err;
  }

  const failures = [];
  for (const provider of AI_PROVIDERS) {
    const state = breakers.get(provider.name);
    if (state && state.until > Date.now()) {
      failures.push(`${provider.name} (${state.reason})`);
      continue;
    }
    try {
      const { text, model } = await callProvider(provider, messages, { timeout, maxTokens });
      return { text, provider: provider.name, model };
    } catch (err) {
      failures.push(err.message);
    }
  }

  const err = new Error(`All AI providers failed — ${failures.join(' | ')}`);
  err.code = 'ALL_FAILED';
  err.failures = failures;
  throw err;
}

/** Backwards-compatible alias kept for any external caller. */
export const callFreeTheAI = callAIProvider;

/** Which provider will serve the next request, or null if all are tripped. */
export function activeProviderName() {
  return AI_PROVIDERS.find((p) => (breakers.get(p.name)?.until ?? 0) <= Date.now())?.name ?? null;
}

/** Breaker state for every provider, for the boot log and `/commands`. */
export function providerStatus() {
  return AI_PROVIDERS.map((p) => {
    const state = breakers.get(p.name);
    const open = (state?.until ?? 0) > Date.now();
    return {
      name: p.name,
      models: p.models,
      open,
      reason: open ? state.reason : null,
      retryAt: open ? state.until : null
    };
  });
}

const SYSTEM_PROMPT = [
  'You are the intent parser for "Alabama Bot PRC", a Discord server-management bot',
  'for a Roblox ER:LC roleplay server. Your ONLY job is to convert a staff',
  "member's plain-English request into one JSON object.",
  '',
  'RULES',
  '- Reply with raw JSON only. No markdown, no code fences, no commentary.',
  '- Shape: {"action": "<action>", "args": { ... }, "reply": "<one sentence>"}',
  '- "action" MUST be one of the listed actions. If nothing fits, use "unsupported".',
  '- Use null for any argument you cannot determine. Never invent a user, channel or role id.',
  '- Copy ids exactly as written, including mentions like <@123456789012345678>.',
  '',
  'ACTIONS',
  '__SCHEMA__'
].join('\n');

/**
 * Builds the system prompt with the action schema injected.
 *
 * The schema is FILTERED to the caller's tier. Showing the directive team the
 * owner's actions only invites the model to propose one, which we then have to
 * reject — costing a wasted round trip and a slow refusal. Hiding them makes the
 * model answer "unsupported" immediately.
 *
 * The scope wording matters a lot: an earlier version said "you may ONLY use
 * the actions listed", which the model read as "even listed actions may be
 * forbidden" and over-refused legitimate work like "close the general ticket".
 * The directive tier is now told plainly that everything listed is allowed.
 */
export function buildSystemPrompt(tier = 'owner') {
  const allowed = ACTION_SCHEMA.filter((a) => tier === 'owner' || a.risk !== 'owner');
  const schema = allowed.map((a) => `- ${a.action} ${JSON.stringify(a.args)} :: ${a.desc}`).join('\n');

  const scope = tier === 'owner'
    ? [
        'You may use EVERY action listed below. All of them are permitted.',
        '',
        'How to choose:',
        '- closing ONE open ticket ("close this ticket", "close the general ticket") -> ticket_close; desk_department only locks a panel line and does NOT close open tickets',
        '- "close/lock/open <department> line/panel" (general, internal affairs, high rank, partnership, staff partnership, applications) -> desk_department',
        '- "close all tickets", "close the desk", "shut the desk" -> desk_status with status "closed"',
        '- "make the desk busy" -> desk_status with status "busy"',
        '- "open all", "reopen tickets", "set the desk online" -> desk_status with status "online"',
        '- "ban/jail <name>" where <name> is NOT a Discord id (no 17-20 digit number, no <@...>) -> erlc_action, in-game',
        '- "kick/ban/timeout <Discord id or <@...>>" -> the matching Discord action',
        '- Duration words like "7 days", "2 hours", "permanently" go in duration_days / minutes / null.',
        '- "send a message in game", "announce in game", "in-game ban/kick/jail <player> for <reason>" -> erlc_action (player is a Roblox username, text holds the reason)',
        '- "list infractions", "show <user> infractions" -> infraction_list; "revoke/remove <user> infraction" -> infraction_revoke',
        '- "revoke/demote <user> promotion" -> promotion_revoke',
        '- "dm/message <user> <text>" -> dm_user (private DM)',
        '- "schedule/plan/set up a meeting" -> meeting_schedule; "postpone the meeting" -> meeting_postpone; "cancel the meeting" -> meeting_cancel; "list meetings" -> meeting_list',
        '- Convert meeting times ("tomorrow 7pm", "next Friday 8pm") into an ISO datetime string YYYY-MM-DDTHH:MM.'
      ].join('\n')
    : [
        'You may use EVERY action listed below. All of them are permitted for this caller.',
        'The actions NOT listed (bans, kicks, timeouts, purges, announcements, channel locks, nicknames, roles, in-game commands, restarts) belong to the bot owner. If the request needs one of those, reply with action "unsupported".',
        '',
        'How to choose:',
        '- closing ONE open ticket ("close this ticket", "close the general ticket") -> ticket_close; desk_department only locks a panel line and does NOT close open tickets',
        '- "close/lock/open <department> line/panel" (general, internal affairs, high rank, partnership, staff partnership, applications) -> desk_department',
        '- "close all tickets", "close the desk", "shut the desk" -> desk_status with status "closed"',
        '- "make the desk busy" -> desk_status with status "busy"',
        '- "open all", "reopen tickets", "set the desk online" -> desk_status with status "online"',
        '- provider/token/credit questions -> provider_status, but ONLY when explicitly asked',
        '- "ban/kick/jail <RobloxName> in game for <reason>" -> erlc_action (Roblox username, reason in text)',
        '- "list infractions" -> infraction_list; "revoke <user> infraction" -> infraction_revoke; "revoke <user> promotion" -> promotion_revoke',
        '- "dm <user> <text>" -> dm_user',
        '- "schedule/plan a meeting" -> meeting_schedule; "postpone the meeting" -> meeting_postpone; "cancel the meeting" -> meeting_cancel; "list meetings" -> meeting_list',
        '- Convert meeting times ("tomorrow 7pm") into an ISO datetime string YYYY-MM-DDTHH:MM.'
      ].join('\n');

  return `${SYSTEM_PROMPT.replace('__SCHEMA__', schema)}\n\n${scope}`;
}

/** Extracts the first JSON object from a model response. */
export function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  // Walk forward counting braces so trailing prose never breaks the parse.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ── Local fallback parser ─────────────────────────────────────────────────────
// Used when the gateway is unreachable. Handles the phrasings staff actually
// type most often, so `-ai` never becomes a dead command.

/** Strips a leading "please", "can you", etc. so the regexes stay simple. */
function tidy(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^\s*(please|pls|can you|could you|hey|bot|ai)\s+/, '')
    .trim();
}

function normalisePanelType(input) {
  if (!input) return null;
  const map = {
    hub: 'session', session: 'session',
    ticket: 'ticket', tickets: 'ticket',
    verify: 'verify', verification: 'verify',
    application: 'application', applications: 'application', staff: 'application',
    information: 'information', info: 'information',
    shop: 'shop', media: 'shop'
  };
  return map[String(input).toLowerCase().trim()] ?? null;
}

/**
 * Pulls the suggestion body out of "make a suggestion that ...".
 *
 * This is deliberately a verbatim substring of what the user typed. A suggestion
 * card is posted publicly under the author's name, so the AI must never rewrite,
 * summarise or "improve" their words — the model does exactly that unprompted.
 */
export function extractSuggestionBody(raw) {
  const text = String(raw)
    .replace(/^.*?\bsuggestion\b\s*/i, '')
    // Strip only the connective the user typed, never content words.
    .replace(/^(?:that|to|saying|say|for|about|is)\s+/i, '')
    .trim();
  return text || null;
}

/**
 * The AI paraphrases free text ("hi from the team" -> "Hi from the team!"), and a
 * suggestion is posted publicly under its author's name. The model is therefore
 * trusted to pick the ACTION but never to author the BODY.
 *
 * @returns {string|null} Verbatim text, or null to keep the model's version.
 */
function authoritativeSuggestionText(rawRequest) {
  const direct = extractSuggestionBody(rawRequest);
  if (direct) return direct;
  // "post a suggestion: <text>" / "suggest <text>" without the word "that".
  const alt = String(rawRequest).match(/\bsuggest(?:ion)?\b\s*[:\-]\s*(.+)$/i)?.[1]?.trim();
  return alt || null;
}

function guessPanelFromText(t) {
  if (/verify|verification/.test(t)) return 'verify';
  if (/application|staff app/.test(t)) return 'application';
  if (/information|\binfo\b|rules/.test(t)) return 'information';
  if (/shop|store|donat/.test(t)) return 'shop';
  if (/ticket|support|assistance/.test(t)) return 'ticket';
  if (/session/.test(t)) return 'session';
  return null;
}

function departmentFromText(t) {
  if (/staff\s*partner/.test(t)) return 'staff_partnership';
  if (/high\s*rank|\bhr\b|\bshr\b/.test(t)) return 'highrank';
  if (/internal|\bia\b/.test(t)) return 'ia';
  if (/partner/.test(t)) return 'partnership';
  if (/application|\bapps?\b/.test(t)) return 'applications';
  if (/general/.test(t)) return 'general';
  return null;
}

/**
 * Pulls the first duration phrase ("3 days", "2 hours", "permanent") out of text.
 * The look-behind stops it latching onto a digit inside a long snowflake.
 */
function durationFromText(t) {
  const text = String(t).toLowerCase();
  const perm = text.match(/\b(permanently|permanent|forever|indefinite)\b/);
  if (perm) return perm[0];
  const numeric = text.match(/(?<![\d.])\d+(?:\.\d+)?\s*(?:ms|milli ?seconds?|s|secs?|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wks|weeks)\b/);
  return numeric?.[0] ?? null;
}

/** Pulls a meeting title out of "schedule a meeting to discuss X". */
export function extractMeetingTitle(raw) {
  const text = String(raw)
    .replace(/<@!?\d{17,20}>|<#\d{17,20}>|<@&\d{17,20}>|\b\d{17,20}\b/g, ' ')
    .replace(/^.*?\b(meeting|briefing|training)\b\s*/i, '')
    .replace(
      /\b(schedule|plan|set up|organize|organise|arrange|book|create|a|an|the|at|on|for|about|to|please|in|tomorrow|today|tonight|next|this|morning|evening|afternoon)\b/ig,
      ' '
    )
    .replace(/\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b/ig, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/ig, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:,\-]+|[\s:,\-]+$/g, '')
    .trim();
  return text ? text.slice(0, 120) : 'Staff Meeting';
}

/** Strips the command tokens out of a request to leave the human reason. */
function reasonFromText(raw, tokens) {
  let text = raw;
  for (const token of tokens) {
    if (!token) continue;
    const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'ig'), ' ');
  }
  // Drop the duration clause ("for 3 days") — it is captured separately.
  text = text.replace(durationFromText(text) ?? '\u0000', ' ');
  text = text.replace(/\bfor\b/ig, ' ');
  // Tidy leftover mention punctuation. The id was already tokenised away, so a
  // bare "<@" / "@" / ">" can survive; strip all of them.
  text = text.replace(/<@!?>?/g, ' ').replace(/[<>]/g, ' ').replace(/(^|\s)@/g, '$1');
  text = text.replace(/\s{2,}/g, ' ').replace(/^[-:,\s]+|[-:,\s]+$/g, '').trim();
  return text ? text.slice(0, 400) : 'No reason provided';
}

/**
 * Parses an in-game ER:LC request from free text.
 * The player is the first remaining word once the verbs and filler are gone.
 */
function parseErclLocally(raw, t) {
  const act = (verb, player, text) => ({
    action: 'erlc_action',
    args: { verb, player, text },
    reply: `${verb} for ${player ?? 'the player'} sent in-game.`
  });

  let verb = null;
  if (/\bunban\b/.test(t)) verb = 'unban';
  else if (/\bunjail\b|\brelease\b/.test(t)) verb = 'unjail';
  else if (/\bjail\b/.test(t)) verb = 'jail';
  else if (/\b(pm|dm)\b/.test(t)) verb = 'pm';
  else if (/\b(announce|broadcast)\b/.test(t)) verb = 'message';
  else if (/\bhint\b/.test(t)) verb = 'hint';
  else if (/\b(kick|yeet)\b/.test(t)) verb = 'kick';
  else if (/\bban\b/.test(t)) verb = 'ban';
  if (!verb) return null;

  // Strip the verb and filler words so the first survivor is the username.
  let body = raw.replace(new RegExp(`\\b${verb}\\b`, 'ig'), ' ');
  if (verb === 'pm') body = body.replace(/\b(pm|dm)\b/ig, ' ');
  body = body.replace(/\b(in ?game|erlc|roblox|player|named|called|username|the|to|please|send)\b/ig, ' ');
  const name = body.trim().match(/^@?([A-Za-z][A-Za-z0-9_]{1,19})\b/)?.[1] ?? null;

  const tail = raw.split(/\bto\b/i).slice(1).join(' to ').trim();
  if (verb === 'pm') return act('pm', name, tail);
  if (verb === 'message') return act('message', null, raw.split(/\b(announce|broadcast)\b/i).slice(1).join(' ').trim());
  if (verb === 'hint') return act('hint', null, raw.split(/\bhint\b/i).slice(1).join(' ').trim());
  // Jail / unjail / kick / ban take no message body.
  return act(verb, name, null);
}

/**
 * Deterministic intent parser used as the offline fallback for the model.
 * Always returns a well-formed intent object.
 */
export function parseLocally(request) {
  const raw = String(request || '').trim();
  if (!raw) return { action: 'ai_help', args: {}, reply: 'Here is everything the AI engine can do.' };
  const t = tidy(raw);
  const ticketUser = extractUserId(raw);

  // ── Meetings ────────────────────────────────────────────────────────────────
  // Checked FIRST: "list meetings" / "postpone the meeting" would otherwise be
  // swallowed by the help rule or the session rules below.
  if (/\b(postpone|push back|reschedule|delay|move)\b/.test(t) && /\bmeeting|briefing|muster\b/.test(t)) {
    const by = durationFromText(t);
    return {
      action: 'meeting_postpone',
      args: { by: by || '1 hour', reason: reasonFromText(raw, ['postpone', 'push', 'back', 'reschedule', 'delay', 'move', 'the', 'meeting']) },
      reply: 'Postponing the next meeting.'
    };
  }
  if (/\b(cancel|call off|scrap|call off)\b/.test(t) && /\bmeeting|briefing\b/.test(t)) {
    return {
      action: 'meeting_cancel',
      args: { reason: reasonFromText(raw, ['cancel', 'call', 'off', 'scrap', 'the', 'meeting']) },
      reply: 'Cancelling the next meeting.'
    };
  }
  if (/\b(list|show|what|upcoming|view)\b/.test(t) && /\bmeetings?\b/.test(t)) {
    return { action: 'meeting_list', args: {}, reply: 'Listing scheduled meetings.' };
  }
  if (/\b(schedule|plan|set ?up|organi[sz]e|arrange|book|hold|run)\b/.test(t) && /\bmeeting|briefing|muster\b/.test(t)) {
    const attendees = [...raw.matchAll(/<@!?(\d{17,20})>/g)].map((m) => m[1]);
    if (!attendees.length && /\bstaff\b/.test(t)) attendees.push('staff');
    const start = durationFromText(t) || (/tomorrow/.test(t) ? 'tomorrow' : /tonight/.test(t) ? 'tonight' : null);
    return {
      action: 'meeting_schedule',
      args: {
        title: extractMeetingTitle(raw),
        start: start || 'in 1 hour',
        location: extractChannelId(raw),
        attendees: attendees.length ? attendees : ['staff'],
        agenda: null,
        reminders: true
      },
      reply: 'Scheduling the meeting and notifying everyone.'
    };
  }

  // ── Staff records: infractions ──────────────────────────────────────────────
  if (/\binfractions?\b/.test(t)) {
    if (/\b(revoke|remove|delete|clear|cancel|appeal|overturn|drop|expunge)\b/.test(t)) {
      return {
        action: 'infraction_revoke',
        args: {
          user_id: ticketUser,
          id: null,
          reason: reasonFromText(raw, ['revoke', 'remove', 'delete', 'clear', 'cancel', 'appeal', 'overturn', 'drop', 'expunge', 'infraction', 'infractions', ticketUser])
        },
        reply: 'Revoking that infraction.'
      };
    }
    return { action: 'infraction_list', args: { user_id: ticketUser, limit: 10 }, reply: 'Listing staff infractions.' };
  }

  // ── Staff records: promotions ───────────────────────────────────────────────
  if (
    /\b(promotion|promote|rank ?up|demotion|demote)\b/.test(t) &&
    /\b(revoke|remove|undo|reverse|cancel|take back|demote|strip)\b/.test(t) &&
    ticketUser
  ) {
    return {
      action: 'promotion_revoke',
      args: {
        user_id: ticketUser,
        reason: reasonFromText(raw, ['revoke', 'remove', 'undo', 'reverse', 'cancel', 'take', 'back', 'demote', 'strip', 'promotion', 'promote', 'the', ticketUser]),
        notes: null
      },
      reply: `Revoking the promotion for <@${ticketUser}>.`
    };
  }

  // ── Direct message ──────────────────────────────────────────────────────────
  if (/^(?:please\s+)?(dm|message|pm)\b/.test(t) && ticketUser && !/erlc|in ?game|roblox/.test(t)) {
    const text = raw
      .replace(/^.*?\b(dm|message|pm)\b\s*/i, '')
      .replace(/<@!?\d{17,20}>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s:,\-]+|[\s:,\-]+$/g, '')
      .trim();
    if (text) return { action: 'dm_user', args: { user_id: ticketUser, text }, reply: `DMing <@${ticketUser}>.` };
  }

  // ── Help / directory ────────────────────────────────────────────────────────
  if (/^(help|what can you do|commands|list|guide|options)\b/.test(t)) {
    return { action: 'ai_help', args: {}, reply: 'Here is everything the AI engine can do.' };
  }
  if (/^(command directory|command guide|show commands|show (the )?command (directory|guide)|open (the )?command (directory|guide))\b/.test(t)) {
    return { action: 'commands_guide', args: {}, reply: 'Opening the interactive command directory.' };
  }
  // ── Provider status — ONLY on an explicit ask (never shown otherwise) ──────
  if (/^(?:please\s+)?(providers?|provider status|ai providers|tokens?|credits?|api (status|health)|gateway status|ai (status|health))\b/.test(t)) {
    return { action: 'provider_status', args: {}, reply: 'Checking the AI providers.' };
  }

  // ── Session vote ────────────────────────────────────────────────────────────
  if (/\b(vote|session vote|start a session|open a session|launch a session)\b/.test(t)) {
    const needed = t.match(/(\d{1,3})\s*(?:users?|members?|people|votes?|players?)/);
    const dur = t.match(/\b(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)\b/);
    return {
      action: 'session_vote',
      args: {
        needed: needed ? Number(needed[1]) : 5,
        duration: normaliseVoteDuration(dur ? `${dur[1]}${dur[2][0]}` : null),
        ping_role_id: ticketUser
      },
      reply: 'Opening a session vote.'
    };
  }

  // ── Session shutdown ────────────────────────────────────────────────────────
  if (/\b(shutdown|shut down|end(ing)? (the )?session|close (the )?session|stop (the )?session|session (is )?(over|closed))\b/.test(t)) {
    return { action: 'session_shutdown', args: {}, reply: 'Closing the session and notifying every voter.' };
  }

  // ── Panels ──────────────────────────────────────────────────────────────────
  if (/\bpanel\b/.test(t) || /\bpost (a|the)\b/.test(t)) {
    const explicit = t.match(/panel\s*(hub|ticket|verify|verification|application|staff|information|info|shop|session|media)/)?.[1];
    const type = normalisePanelType(explicit || guessPanelFromText(t));
    if (type) return { action: 'panel_post', args: { type }, reply: `Posting the ${type} panel.` };
  }

  // ── Ticket info (this channel) ─────────────────────────────────────────────
  if (/^(ticket info|ticket details|show ticket info|which ticket|what ticket)\b/.test(t)) {
    return { action: 'ticket_info', args: {}, reply: 'Reading the open ticket.' };
  }

  // ── Close the OPEN ticket in this channel ──────────────────────────────────
  // Singular "ticket" + a close verb = the actual ticket channel (transcript
  // archive + delete). Plural "tickets", "desk", "panel", "department" and
  // "all" keep their panel meaning further down.
  if (
    /\b(close|resolve|shut|archive|wrap up|end)\b/.test(t) &&
    /\bticket\b/.test(t) &&
    !/\btickets\b/.test(t) &&
    !/\b(all|desk|panel|department|line)\b/.test(t) &&
    !/\bthe session\b/.test(t)
  ) {
    return { action: 'ticket_close', args: {}, reply: 'Closing the open ticket in this channel.' };
  }

  // ── Ticket desk ─────────────────────────────────────────────────────────────
  if (/\bbusy\b/.test(t) && !/erlc|in ?game/.test(t)) {
    return { action: 'desk_status', args: { status: 'busy' }, reply: 'Setting the desk to Busy.' };
  }
  if (/\b(close all|close the desk|close tickets|desk closed|close the support)\b/.test(t)) {
    return { action: 'desk_status', args: { status: 'closed' }, reply: 'Closing the ticket desk.' };
  }
  if (/\b(open all|open the desk|reopen tickets|desk online|set (the )?desk online)\b/.test(t)) {
    return { action: 'desk_status', args: { status: 'online' }, reply: 'Opening the ticket desk.' };
  }
  if (/\b(close|lock|shut)\b/.test(t) && /\b(tickets?|departments?|general|internal|ia|high ?rank|partners?(?:hip)?|applications?|apps?)\b/.test(t)) {
    const dept = departmentFromText(t);
    if (dept) return { action: 'desk_department', args: { department: dept, open: false }, reply: `Locking ${dept}.` };
  }
  if (/\b(open|unlock|enable)\b/.test(t) && /\b(tickets?|departments?|general|internal|ia|high ?rank|partners?(?:hip)?|applications?|apps?)\b/.test(t)) {
    const dept = departmentFromText(t);
    if (dept) return { action: 'desk_department', args: { department: dept, open: true }, reply: `Opening ${dept}.` };
  }
  if (/\b(desk|support)\b.*\b(status|availability|open departments|how many)\b/.test(t) || /^(status|desk status|desk info)$/.test(t)) {
    return { action: 'desk_info', args: {}, reply: 'Checking the ticket desk.' };
  }
  if (/\b(close|open)\b.*\bticket desk\b/.test(t)) {
    const open = /\bopen\b/.test(t);
    return { action: 'desk_status', args: { status: open ? 'online' : 'closed' }, reply: open ? 'Opening the ticket desk.' : 'Closing the ticket desk.' };
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  if (/\btop suggestion|best suggestion|highest rated suggestion\b/.test(t)) {
    return { action: 'suggestion_top', args: {}, reply: 'Pulling the top suggestion.' };
  }
  if (/\bsuggestion\b/.test(t)) {
    const text = extractSuggestionBody(raw);
    if (text) return { action: 'suggestion_create', args: { text }, reply: 'Posting your suggestion.' };
  }

  // ── Nicknames & roles (owner) ──────────────────────────────────────────────
  if (ticketUser && /\b(nick ?name|nickname|rename)\b/.test(t)) {
    const cleared = /\b(clear|remove|reset|delete|none|default)\b/.test(t);
    let nickname = '';
    if (!cleared) {
      nickname = raw
        .replace(/^.*?\b(?:nick ?name|nickname|rename)\b/i, ' ')
        .replace(/<@!?\d{17,20}>|\b\d{17,20}\b/g, ' ')
        .replace(/\b(set|change|to|as|of|the|a|an|for|on|member|user|please|their|his|her)\b/ig, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s:,\-]+|[\s:,\-]+$/g, '')
        .trim()
        .slice(0, 32);
    }
    return {
      action: 'nick',
      args: { user_id: ticketUser, nickname },
      reply: cleared ? `Clearing the nickname of <@${ticketUser}>.` : `Setting the nickname of <@${ticketUser}>.`
    };
  }
  if (ticketUser && /\b(add|remove|give|take|strip|grant)\b/.test(t) && /\b(role|rank)\b/.test(t)) {
    const op = /\b(remove|take|strip)\b/.test(t) ? 'remove' : 'add';
    const role = raw
      .replace(/<@!?\d{17,20}>|\b\d{17,20}\b/g, ' ')
      .replace(/\b(add|remove|give|take|strip|grant|the|a|an|role|rank|to|from|on|member|user|please|of|their|his|her|as|this)\b/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s:,\-]+|[\s:,\-]+$/g, '')
      .trim()
      .slice(0, 100);
    return {
      action: 'role_grant',
      args: { op, user_id: ticketUser, role },
      reply: `${op === 'add' ? 'Adding' : 'Removing'} a role on <@${ticketUser}>.`
    };
  }

  // ── Ticket members ──────────────────────────────────────────────────────────
  if (/\b(add|unadd|remove)\b/.test(t) && /\b(ticket|user|member)\b/.test(t) && ticketUser) {
    const op = /\b(unadd|remove)\b/.test(t) ? 'unadd' : 'add';
    return { action: 'ticket_member', args: { op, user_id: ticketUser }, reply: `${op === 'add' ? 'Adding' : 'Removing'} <@${ticketUser}> from this ticket.` };
  }

  // ── Polls ───────────────────────────────────────────────────────────────────
  if (/\bpoll\b/.test(t)) {
    const body = raw
      .replace(/^.*?\bpoll\b\s*/i, '')
      .replace(/^(?:about|on|for|regarding|the question(?: is)?|is|are)\s+/i, '')
      .trim();
    let question = body;
    let pollOptions = [];
    const sep = body.includes(':') ? ':' : body.includes(' - ') ? ' - ' : null;
    if (sep) {
      const idx = body.indexOf(sep);
      question = body.slice(0, idx).trim();
      pollOptions = body.slice(idx + sep.length).split(/\s*[;|]\s*|\s+(?:or|vs)\.?\s+/i).map((s) => s.trim()).filter(Boolean);
    } else {
      const parts = body.split(/\s*[;|]\s*|\s+(?:or|vs)\.?\s+/i).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        question = parts.shift();
        pollOptions = parts;
      }
    }
    if (question) {
      return { action: 'poll', args: { question, options: pollOptions.slice(0, 10) }, reply: 'Posting a poll.' };
    }
  }

  // ── Member lookups (whois / avatar) ────────────────────────────────────────
  if (/\b(whois|who is)\b/.test(t) && ticketUser && !/\bonline\b/.test(t)) {
    return { action: 'whois', args: { user_id: ticketUser }, reply: 'Pulling that member card.' };
  }
  if (/^(?:please\s+)?(whois|who is|member info|user info|check me|check myself)\b/.test(t) && !/\b(online|staff|host|playing)\b/.test(t)) {
    return { action: 'whois', args: { user_id: null }, reply: 'Pulling your member card.' };
  }
  if (/\b(avatar|pfp|profile pic(?:ture)?)\b/.test(t)) {
    return { action: 'avatar', args: { user_id: ticketUser }, reply: 'Fetching that avatar.' };
  }

  // ── Discord server overview (NOT the ER:LC game stats) ─────────────────────
  if (
    /\b(guild info|discord server|server overview|how many members|member count|how many (roles|channels|people|users))\b/.test(t) &&
    !/erlc|in ?game|roblox|player/.test(t)
  ) {
    return { action: 'guild_info', args: {}, reply: 'Pulling the Discord server overview.' };
  }

  // ── Bot vitals ──────────────────────────────────────────────────────────────
  if (/^(?:please\s+)?(bot ping|bot stats|bot status|ping|uptime|latency)\b/.test(raw.toLowerCase())) {
    return { action: 'bot_stats', args: {}, reply: 'Checking bot vitals.' };
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  if (/\b(player ?count|how many players|server stats|queue|who'?s online|player list|server info)\b/.test(t)) {
    return { action: 'server_stats', args: {}, reply: 'Pulling live ER:LC statistics.' };
  }

  // ── Retrigger ───────────────────────────────────────────────────────────────
  if (/\b(retrigger|reboot|restart|resync|re-?sync|refresh everything|reload everything)\b/.test(t)) {
    return { action: 'retrigger', args: {}, reply: 'Running a full re-sync.' };
  }

  // ── In-game ER:LC ───────────────────────────────────────────────────────────
  // Checked BEFORE Discord moderation so "kick the player in game" is not read
  // as a Discord kick.
  if (/erlc|in ?game|roblox/.test(t) || /\b(jail|unjail|yeet)\b/.test(t) || (!ticketUser && /\b(kick|ban|hint|announce|broadcast)\b/.test(t))) {
    const erlc = parseErclLocally(raw, t);
    if (erlc) return erlc;
  }

  // ── Discord moderation ──────────────────────────────────────────────────────
  if (/\b(lift|remove|undo|revoke)\b/.test(t) && /\bban\b/.test(t) && ticketUser) {
    return { action: 'unban', args: { user_id: ticketUser, reason: 'Ban lifted by staff' }, reply: `Unbanning <@${ticketUser}>.` };
  }
  // Bare "unban <user>" (no lift/undo word) still means a Discord unban.
  if (/^unban\b/.test(t) && ticketUser) {
    return { action: 'unban', args: { user_id: ticketUser, reason: 'Ban lifted by staff' }, reply: `Unbanning <@${ticketUser}>.` };
  }
  if (/\b(untimeout|untime ?out|clear (the )?timeout|remove timeout|unmute)\b/.test(t) && ticketUser) {
    return { action: 'untimeout', args: { user_id: ticketUser, reason: 'Timeout cleared' }, reply: `Clearing the timeout on <@${ticketUser}>.` };
  }
  if (/\b(ban|permaban|perm ban)\b/.test(t) && ticketUser) {
    const dur = parseDuration(durationFromText(t), { unit: 'day' });
    return {
      action: 'ban',
      args: { user_id: ticketUser, reason: reasonFromText(raw, ['ban', 'permaban', ticketUser]), delete_days: 0, duration_days: dur?.durationDays ?? null },
      reply: `Banning <@${ticketUser}>.`
    };
  }
  if (/\b(kick|yeet|remove from server)\b/.test(t) && ticketUser) {
    return { action: 'kick', args: { user_id: ticketUser, reason: reasonFromText(raw, ['kick', 'yeet', ticketUser]) }, reply: `Kicking <@${ticketUser}>.` };
  }
  if (/\b(timeout|mute|silence)\b/.test(t) && ticketUser) {
    const parsed = parseDuration(durationFromText(t), { unit: 'minute' });
    const mins = clampNumber(parsed?.ms ? parsed.ms / 60_000 : 10, 1, 40320, 10);
    return { action: 'timeout', args: { user_id: ticketUser, minutes: mins, reason: reasonFromText(raw, ['timeout', 'mute', 'silence', ticketUser]) }, reply: `Timing out <@${ticketUser}> for ${mins} minute(s).` };
  }
  if (/\b(purge|bulk ?delete|prune)\b/.test(t)) {
    const amount = Number(t.match(/(\d{1,3})/)?.[1]) || 10;
    return { action: 'purge', args: { amount, reason: 'Bulk message clear' }, reply: `Deleting the last ${amount} messages.` };
  }

  // ── Channel lock ────────────────────────────────────────────────────────────
  if (/\block\b/.test(t) && /\b(channel|chat)\b/.test(t)) {
    return { action: 'channel_lock', args: { locked: true, reason: 'AI channel control' }, reply: 'Locking this channel.' };
  }
  if (/\bunlock\b/.test(t) && /\b(channel|chat)\b/.test(t)) {
    return { action: 'channel_lock', args: { locked: false, reason: 'AI channel control' }, reply: 'Unlocking this channel.' };
  }

  // ── Slowmode ───────────────────────────────────────────────────────────────
  if (/\bslow ?mode\b/.test(t)) {
    if (/\b(off|disable|disabled|stop|none|0)\b/.test(t)) {
      return { action: 'slowmode', args: { seconds: 0 }, reply: 'Turning slowmode off.' };
    }
    const smMins = t.match(/(\d{1,4})\s*(?:m|min|mins|minutes?)\b/);
    const smSecs = t.match(/(\d{1,4})\s*(?:s|sec|secs|seconds?)\b/);
    const smBare = t.match(/(\d{1,4})/);
    const seconds = Math.min(smMins ? Number(smMins[1]) * 60 : smSecs ? Number(smSecs[1]) : smBare ? Number(smBare[1]) : 30, 21600);
    return { action: 'slowmode', args: { seconds }, reply: `Setting slowmode to ${seconds}s.` };
  }

  // ── Pin the latest (or replied-to) message ─────────────────────────────────
  if (/^(?:please\s+)?pin\b/.test(t) || /\bpin (this|it|the last|the latest|last message)\b/.test(t)) {
    return { action: 'pin_message', args: {}, reply: 'Pinning that message.' };
  }

  // ── Hide / reveal this channel (owner) ─────────────────────────────────────
  if (/\b(hide|invisible)\b/.test(t) && /\b(channel|chat|this)\b/.test(t)) {
    return { action: 'channel_hide', args: { hidden: true }, reply: 'Hiding this channel from @everyone.' };
  }
  if (/\b(unhide|reveal|make visible|visible again)\b/.test(t) && /\b(channel|chat|this)\b/.test(t)) {
    return { action: 'channel_hide', args: { hidden: false }, reply: 'Revealing this channel.' };
  }

  // ── Announcements ───────────────────────────────────────────────────────────
  if (/\b(say|announce|announcement)\b/.test(t)) {
    const text = raw.replace(/^.*?\b(say|announce|announcement)\b\s*/i, '').trim();
    if (text) return { action: 'say', args: { channel_id: extractChannelId(raw), text }, reply: 'Posting your announcement.' };
  }

  return { action: 'unsupported', args: {}, reply: 'I could not map that to a command.' };
}

// ── Intent resolution ─────────────────────────────────────────────────────────

/**
 * Coerces a raw model payload into the shape the executor expects.
 * Returns null when the action is unknown or the tier may not run it.
 */
export function normaliseIntent(payload, tier) {
  if (!payload || typeof payload !== 'object') return null;
  const action = String(payload.action || '').trim();
  if (!ALL_ACTIONS.has(action)) return null;

  // The model never gets to escalate: re-check the tier against our own table.
  if (tier !== 'owner' && OWNER_ONLY_ACTIONS.has(action)) return null;

  const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
  const reply = typeof payload.reply === 'string' ? payload.reply.trim().slice(0, 300) : '';
  return { action, args, reply };
}

/**
 * Resolves a natural-language request into a validated intent.
 *
 * Strategy: ask the gateway first, sanity-check the answer, and fall back to the
 * local parser when the gateway errors out or returns something unusable.
 * `source` reports which path produced the result.
 *
 * IMPORTANT: the fallback goes through `normaliseIntent` too. Without that the
 * offline parser would hand back an owner-only action to the directive tier,
 * because only the model path used to be permission-checked.
 */
export async function resolveIntent(request, { tier = 'owner' } = {}) {
  // Local path first-class citizen: same validation, same permission gate.
  const localFallback = () => {
    const parsed = parseLocally(request);
    const gated = normaliseIntent(
      { action: parsed.action, args: parsed.args, reply: parsed.reply },
      tier
    );
    // A null here means the parser matched something this tier may not run.
    // Report it as restricted so the caller shows a clear refusal.
    if (!gated) {
      return {
        action: parsed.action === 'unsupported' ? 'unsupported' : 'restricted',
        args: {},
        reply: parsed.reply,
        restrictedAction: parsed.action,
        source: 'local'
      };
    }
    return { ...gated, source: 'local' };
  };

  if (!aiConfigured()) return localFallback();

  let lastError = null;
  try {
    const { text: raw, provider } = await callAIProvider([
      { role: 'system', content: buildSystemPrompt(tier) },
      { role: 'user', content: String(request).slice(0, 1200) }
    ]);
    const intent = normaliseIntent(extractJson(raw), tier);
    if (intent) {
      // Suggestions are authored verbatim, never paraphrased by the model.
      if (intent.action === 'suggestion_create') {
        const verbatim = authoritativeSuggestionText(request);
        if (verbatim) intent.args.text = verbatim;
      }
      return { ...intent, source: 'model', provider };
    }
    lastError = new Error(`${provider} returned an unusable intent.`);
  } catch (err) {
    lastError = err;
    console.warn(`[ai] all providers unavailable, using local parser: ${err.message}`);
  }

  const local = localFallback();

  // Only surface a notice when EVERY provider is genuinely down. A partial
  // outage — or one unusable answer — is not worth alarming anyone about, since
  // the local parser already handled the request silently.
  const down = AI_PROVIDERS.filter((p) => (breakers.get(p.name)?.until ?? 0) > Date.now());
  if (AI_PROVIDERS.length > 0 && down.length === AI_PROVIDERS.length) {
    const daily = down.find((p) => breakers.get(p.name)?.reason === 'daily-limit');
    const checkin = down.find((p) => breakers.get(p.name)?.reason === 'needs-checkin');
    if (daily) {
      local.gatewayNotice =
        `⏳ All AI providers are busy (${daily.name}'s free daily limit is used up, resets ` +
        `<t:${Math.floor(breakers.get(daily.name).until / 1000)}:R>) — I used my built-in parser.`;
    } else if (checkin) {
      local.gatewayNotice =
        `🔑 All AI providers are busy right now — I used my built-in parser. ` +
        `(${checkin.name} needs its daily check-in at https://freetheai.org/checkin.)`;
    }
  }
  return local;
}

// ── Help content ─────────────────────────────────────────────────────────────

/**
 * Structured `-ai help` content, shared by the Components V2 help card that
 * index.js sends (DM-first, so only the requester sees it) and the plain-text
 * fallback below.
 *
 * Style rules: no emoji, no backticks — headings, bold group titles and
 * blockquotes only, so the card reads like a clean panel.
 *
 * Provider/token status is deliberately NOT part of help — it only appears
 * when someone explicitly asks for it (`-ai providers` -> provider_status).
 *
 * @returns {{ groups: Array<{title: string, items: string[]}>,
 *             ownerGroups: Array<{title: string, items: string[]}>,
 *             examples: string[], examplesOwner: string[], note: string }}
 */
export function aiHelpSections(tier) {
  const groups = [
    {
      title: 'Sessions and panels',
      items: [
        'start a session vote with 5 users for 2 hours',
        'close the session',
        'post the session panel'
      ]
    },
    {
      title: 'Ticket desk',
      items: [
        'make the ticket desk busy',
        'open internal affairs',
        'close all tickets',
        'what is the desk status'
      ]
    },
    {
      title: 'Tickets',
      items: [
        'close this ticket',
        'close the general ticket',
        'ticket info',
        'add @user to this ticket'
      ]
    },
    {
      title: 'Channel tools',
      items: ['slowmode 30', 'pin the last message']
    },
    {
      title: 'Community',
      items: [
        'make a suggestion that we add more staff',
        'show the top suggestion',
        'poll Friday or Saturday: session; no session'
      ]
    },
    {
      title: 'Info',
      items: [
        'how many players are online',
        'whois @user',
        'avatar @user',
        'discord server info',
        'bot stats',
        'show the command directory'
      ]
    },
    {
      title: 'Staff records',
      items: ['list infractions', 'list @user infractions', 'revoke @user infraction', 'revoke @user promotion']
    },
    {
      title: 'Messages',
      items: [
        'dm @user you are invited to the meeting',
        'send a message in game we are full',
        'in game ban RobloxName for exploiting'
      ]
    },
    {
      title: 'Meetings',
      items: [
        'schedule a meeting in 2 hours to discuss staffing',
        'schedule a staff meeting tomorrow at 7pm',
        'postpone the meeting by 1 hour',
        'cancel the meeting',
        'list meetings'
      ]
    },
    {
      title: 'In-game',
      items: [
        'jail RobloxName',
        'unjail RobloxName',
        'announce we are full',
        'hint roadblock ahead',
        'pm RobloxName to join staff'
      ]
    }
  ];

  const ownerGroups = [
    {
      title: 'Moderation',
      items: [
        'ban @user for 7 days for spamming',
        'unban @user',
        'kick @user for raiding',
        'timeout @user for 2 hours',
        'purge 25'
      ]
    },
    {
      title: 'Server',
      items: [
        'say Session starts in 5 minutes',
        'lock this channel',
        'hide this channel',
        'set nickname of @user to Helper',
        'give @user the Moderator role'
      ]
    },
    { title: 'System', items: ['retrigger the bot'] }
  ];

  const examples = ['close this ticket', 'start a session vote with 5 users for 2 hours', 'schedule a meeting in 2 hours to discuss staffing'];
  const examplesOwner = [...examples, 'ban @user for 3 days for advertising'];
  const note = 'Type -ai providers when you want live provider status — it is never shown otherwise.';

  return { groups, ownerGroups, examples, examplesOwner, note, tier };
}

/** Renders one help group as markdown lines. */
function renderHelpGroup(group) {
  return [`**${group.title}**`, ...group.items.map((i) => `> ${i}`)].join('\n');
}

/** Plain-text rendering of the help sections (fallback path). */
export function buildAiHelpText(tier) {
  const { groups, ownerGroups, examples, examplesOwner, note } = aiHelpSections(tier);
  const lines = [
    '## AI Command Engine',
    '*Say what you want in plain English — it gets done.*',
    '',
    '### Available to you',
    ...groups.flatMap((g) => [renderHelpGroup(g), ''])
  ];
  if (tier === 'owner') {
    lines.push('### Owner', ...ownerGroups.flatMap((g) => [renderHelpGroup(g), '']));
  }
  lines.push(
    '### Examples',
    ...(tier === 'owner' ? examplesOwner : examples).map((e) => `> -ai ${e}`),
    '',
    `-# ${note}`
  );
  return lines.join('\n');
}

// ── Executor ──────────────────────────────────────────────────────────────────

/** Builds a compact audit line for the AI action log. */
function auditLine(message, intent, ok, detail) {
  const via = intent.provider ? ` via **${intent.provider}**` : intent.source === 'local' ? ' via built-in parser' : '';
  return (
    `🤖 **AI Command**\n` +
    `> **Request:** \`${message.content.slice(0, 200)}\`\n` +
    `> **User:** <@${message.author.id}> (${message.author.tag})\n` +
    `> **Action:** \`${intent.action}\`${via}\n` +
    `> **Args:** \`${JSON.stringify(intent.args).slice(0, 500)}\`\n` +
    `> **Tier:** ${intent.tier}\n` +
    `> **Result:** ${ok ? '✅ Success' : '❌ Failed'}${detail ? ` — ${detail}` : ''}\n` +
    `> **Channel:** <#${message.channelId}> · <t:${Math.floor(Date.now() / 1000)}:f>`
  );
}

/**
 * Executes a resolved intent against the running bot.
 *
 * @param {object} intent  Output of resolveIntent().
 * @param {object} ctx     Runtime context injected by index.js (bot helpers,
 *                         datastores and log channels).
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function executeIntent(intent, ctx) {
  const { message } = ctx;
  const args = intent.args ?? {};
  const owner = intent.tier === 'owner';

  // Anything owner-only is re-checked here — the resolver check is not trusted.
  if (!owner && OWNER_ONLY_ACTIONS.has(intent.action)) {
    return { ok: false, message: '❌ That action is restricted to the bot owner.' };
  }

  try {
    switch (intent.action) {
      // ── Sessions ──────────────────────────────────────────────────────────
      case 'session_vote': {
        const needed = clampNumber(args.needed, 2, 200, 5);
        const duration = normaliseVoteDuration(args.duration);
        const result = await ctx.startSessionVote({
          message,
          needed,
          duration,
          roleId: ctx.resolvePingRole(args.ping_role_id),
          hostName: message.author.globalName ?? message.author.username
        });
        return { ok: result.ok, message: result.message };
      }

      case 'session_shutdown': {
        const { delivered, voterCount } = await ctx.executeShutdown(
          ctx.client, message.guildId, message.channelId, message.author
        );
        return {
          ok: true,
          message: `🔒 Session closed in <#${message.channelId}>${voterCount ? ` — **${delivered}/${voterCount}** voters DM'd.` : '.'}`
        };
      }

      // ── Panels ────────────────────────────────────────────────────────────
      case 'panel_post': {
        const type = String(args.type || '').toLowerCase();
        if (!PANEL_TYPES.has(type)) {
          return { ok: false, message: `❌ Unknown panel type. Choose one of: ${[...PANEL_TYPES].join(', ')}.` };
        }
        // Session panels go to the dedicated session area unless the request
        // pinned an explicit channel — other panels stay in the current one.
        const targetChannel = args.channel_id
          ? await ctx.client.channels.fetch(String(args.channel_id)).catch(() => null)
          : type === 'session'
            ? null
            : message.channel;
        if (!targetChannel?.isTextBased?.()) return { ok: false, message: '❌ I could not find that channel.' };
        const result = await ctx.postPanelByType(message, type, targetChannel, null);
        return { ok: true, message: `✅ ${result}` };
      }

      // ── Ticket desk ───────────────────────────────────────────────────────
      case 'desk_status': {
        const status = ['online', 'busy', 'closed'].includes(String(args.status)) ? String(args.status) : 'online';
        const cats = ctx.ticketDeskState.categories;
        ctx.ticketDeskState.status = status;
        // "online" and "closed" also flip every department, matching `-open all`.
        if (status === 'online' || status === 'closed') {
          for (const key of ['general', 'ia', 'highrank', 'partnership', 'staff_partnership']) {
            cats[key] = status === 'online';
          }
        }
        ctx.saveTicketDeskState();
        await ctx.refreshAllTicketPanels(ctx.client, message.channel);
        const icon = status === 'online' ? '🟢' : status === 'busy' ? '🟠' : '🔴';
        const note = status === 'closed' ? ' Open tickets are untouched — `close this ticket` closes one.' : '';
        return { ok: true, message: `${icon} Ticket desk is now **${status}**. The panel has been refreshed.${note}` };
      }

      case 'desk_department': {
        const dept = normaliseDepartment(args.department);
        if (!dept) {
          return { ok: false, message: '❌ Unknown department. Try: general, ia, highrank, partnership, staff_partnership or applications.' };
        }
        const open = args.open !== false && args.open !== 'false';
        if (dept === 'applications') {
          ctx.appGateState.ingame = open;
          ctx.saveAppGateState();
          await ctx.refreshAllAppPanels(ctx.client);
        } else {
          ctx.ticketDeskState.categories[dept] = open;
          if (open && ctx.ticketDeskState.status === 'closed') ctx.ticketDeskState.status = 'online';
          ctx.saveTicketDeskState();
          await ctx.refreshAllTicketPanels(ctx.client);
        }
        return {
          ok: true,
          message: open
            ? `🔓 Opened **${dept.replace(/_/g, ' ')}**.`
            : `🔒 Locked **${dept.replace(/_/g, ' ')}** ticket-panel line — new tickets are blocked, open tickets are untouched (say \`close this ticket\` to close one).`
        };
      }

      case 'desk_info': {
        const d = ctx.ticketDeskState;
        const yn = (v) => (v ? '🟢 Open' : '🔴 Closed');
        const statusLabel = d.status === 'online' ? '🟢 Online' : d.status === 'busy' ? '🟠 Busy' : '🔴 Closed';
        return {
          ok: true,
          message:
            `## Ticket Desk — ${statusLabel}\n` +
            `> • **General Support:** ${yn(d.categories.general)}\n` +
            `> • **Internal Affairs:** ${yn(d.categories.ia)}\n` +
            `> • **High Rank Support:** ${yn(d.categories.highrank)}\n` +
            `> • **Partnership:** ${yn(d.categories.partnership)}\n` +
            `> • **Staff Partnership:** ${yn(d.categories.staff_partnership)}\n` +
            `> • **Staff Applications:** ${yn(ctx.appGateState.ingame)}`
        };
      }

      // ── Suggestions ───────────────────────────────────────────────────────
      case 'suggestion_create': {
        const text = String(args.text ?? '').trim().slice(0, 900);
        if (!text) return { ok: false, message: '❌ A suggestion needs some text.' };
        return await ctx.createSuggestion({
          message,
          text,
          authorId: message.author.id,
          authorAvatar: message.author.displayAvatarURL({ size: 128 })
        });
      }

      case 'suggestion_top': {
        return await ctx.topSuggestion();
      }

      // ── Ticket members ────────────────────────────────────────────────────
      case 'ticket_member': {
        const op = args.op === 'unadd' ? 'unadd' : 'add';
        const target = ctx.resolveMember(String(args.user_id ?? ''), message.guild);
        if (!target) return { ok: false, message: '❌ I could not find that member in this server.' };
        if (!ctx.getActiveTicket(message.channel)) return { ok: false, message: '❌ This channel is not an active ticket.' };
        if (op === 'add') {
          await message.channel.permissionOverwrites.create(target.id, { ViewChannel: true, SendMessages: true });
        } else {
          await message.channel.permissionOverwrites.create(target.id, { ViewChannel: false, SendMessages: false }).catch(() => null);
        }
        return { ok: true, message: `${op === 'add' ? '✅ Added' : '✅ Removed'} <@${target.id}> ${op === 'add' ? 'to' : 'from'} this ticket.` };
      }

      // ── Info ──────────────────────────────────────────────────────────────
      case 'server_stats': {
        const stats = await ctx.fetchServerStats();
        const status = ctx.serverStatus(stats);
        return {
          ok: true,
          message:
            `## 📊 Alabama State Roleplay — Live\n` +
            `> • **Status:** ${status.label}\n` +
            `> • **Players:** **${ctx.playersText(stats)}**\n` +
            `> • **Queue:** ${ctx.queueText(stats)}\n` +
            `> • **In-game staff:** **${Number(stats?.staff) || 0}**\n` +
            `> • **Join code:** \`${ctx.sessionCode()}\`\n` +
            `> • **Join:** ${ctx.joinUrl()}`
        };
      }

      case 'commands_guide': {
        await ctx.handleCommandsGuideCommand(message, false);
        return { ok: true, message: '📖 Command directory opened above.' };
      }

      case 'ai_help': {
        return { ok: true, message: buildAiHelpText(intent.tier), help: true };
      }

      // The resolver matched a real action but this tier may not run it.
      case 'restricted': {
        const blocked = intent.restrictedAction ? String(intent.restrictedAction).replace(/_/g, ' ') : 'that action';
        return {
          ok: false,
          message:
            `❌ ${blocked} is owner-only. Ask the bot owner to run it.\n` +
            `> Type -ai help to see everything available to you.`
        };
      }

      // Nothing matched — either the request is nonsense, or (for the directive
      // tier) it needed an action they are not allowed to use.
      case 'unsupported': {
        return {
          ok: false,
          message:
            `❌ I could not work out what to run for that.\n` +
            `> Type -ai help to see everything available to you.`
        };
      }

      // ── Discord moderation ─────────────────────────────────────────────────
      case 'ban': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a user to ban — mention them or give me their user ID.' };
        if (userId === message.author.id) return { ok: false, message: '❌ You cannot ban yourself.' };
        const reason = String(args.reason || 'No reason provided').slice(0, 400);
        const deleteDays = clampNumber(args.delete_days, 0, 7, 0);
        const durationDays = args.duration_days === null || args.duration_days === undefined
          ? null
          : clampNumber(args.duration_days, 1, 36500, null);
        return await ctx.banUser({ guild: message.guild, userId, reason, deleteDays, durationDays, by: message.author });
      }

      case 'unban': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a user to unban — give me their user ID.' };
        const ban = await message.guild.bans.fetch(userId).catch(() => null);
        if (!ban) return { ok: false, message: '❌ That user is not banned.' };
        await message.guild.members.unban(userId, `${args.reason || 'Ban lifted'} (by ${message.author.tag})`);
        const tag = ban.user?.tag ? ` (\`${ban.user.tag}\`)` : '';
        return { ok: true, message: `✅ Unbanned <@${userId}>${tag}.` };
      }

      case 'kick': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member to kick — mention them or give me their user ID.' };
        if (userId === message.author.id) return { ok: false, message: '❌ You cannot kick yourself.' };
        const reason = String(args.reason || 'No reason provided').slice(0, 400);
        return await ctx.kickUser({ guild: message.guild, userId, reason, by: message.author });
      }

      case 'timeout': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member to time out — mention them or give me their user ID.' };
        if (userId === message.author.id) return { ok: false, message: '❌ You cannot time yourself out.' };
        const parsed = parseDuration(args.minutes ?? args.duration, { unit: 'minute' });
        const minutes = clampNumber(parsed?.ms ? parsed.ms / 60_000 : 10, 1, 40320, 10);
        const reason = String(args.reason || 'No reason provided').slice(0, 400);
        return await ctx.timeoutUser({ guild: message.guild, userId, minutes, reason, by: message.author });
      }

      case 'untimeout': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member — mention them or give me their user ID.' };
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (!member) return { ok: false, message: '❌ That member is not in the server.' };
        if (!member.isCommunicationDisabled()) return { ok: false, message: '❌ That member is not timed out.' };
        await member.timeout(null, `${args.reason || 'Timeout cleared'} (by ${message.author.tag})`);
        return { ok: true, message: `✅ Cleared the timeout on <@${userId}>.` };
      }

      case 'purge': {
        const amount = clampNumber(args.amount, 1, 100, 10);
        const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
        if (!deleted) return { ok: false, message: '❌ I could not delete messages here (check Manage Messages).' };
        const count = deleted.size ?? 0;
        return { ok: true, message: `🧹 Deleted **${count}** message${count === 1 ? '' : 's'} in this channel.` };
      }

      // ── Server control ────────────────────────────────────────────────────
      case 'say': {
        const text = String(args.text || '').trim().slice(0, 1800);
        if (!text) return { ok: false, message: '❌ I need some text to announce.' };
        const channel = args.channel_id
          ? await ctx.client.channels.fetch(String(args.channel_id)).catch(() => null)
          : message.channel;
        if (!channel?.isTextBased?.()) return { ok: false, message: '❌ I could not find that channel.' };
        await channel.send({ content: text, allowedMentions: { parse: ['users'] } });
        return { ok: true, message: `📢 Posted in <#${channel.id}>.` };
      }

      case 'channel_lock': {
        const locked = args.locked !== false && args.locked !== 'false';
        const reason = String(args.reason || 'AI channel control').slice(0, 400);
        await ctx.setChannelLock(message.channel, locked, reason);
        return { ok: true, message: locked ? '🔒 This channel is now locked.' : '🔓 This channel is now unlocked.' };
      }

      case 'retrigger': {
        await ctx.handleRetriggerCommand(message, false);
        return { ok: true, message: '♻️ Emergency re-sync complete.' };
      }

      // ── In-game ER:LC ─────────────────────────────────────────────────────
      case 'erlc_action': {
        const verb = String(args.verb || '').toLowerCase().trim();
        const allowed = ['pm', 'message', 'hint', 'jail', 'unjail', 'kick', 'ban', 'unban'];
        if (!allowed.includes(verb)) {
          return { ok: false, message: `❌ Unknown in-game action. Choose one of: ${allowed.join(', ')}.` };
        }
        const player = args.player ? String(args.player).trim().slice(0, 32) : null;
        if (verb !== 'message' && verb !== 'hint' && !player) {
          return { ok: false, message: '❌ Tell me which Roblox username to act on.' };
        }
        const text = args.text ? String(args.text).slice(0, 400) : null;
        if (['pm', 'message', 'hint'].includes(verb) && !text) {
          return { ok: false, message: '❌ Tell me what the message should say.' };
        }
        return await ctx.erlcAction({ verb, player, text, message });
      }

      // ── Ticket lifecycle ────────────────────────────────────────────────────
      case 'ticket_close': {
        const ticket = ctx.getActiveTicket?.(message.channel);
        if (!ticket) {
          return {
            ok: false,
            message:
              '❌ There is no open ticket in this channel.\n' +
              '> To lock a department of the ticket panel instead, say e.g. `close the general department`.'
          };
        }
        await ctx.closeTicket(message.channel, ticket, message.author.tag, message.author.id);
        return {
          ok: true,
          message: `🔒 **Closing ticket:** ${ticket.categoryName || 'Ticket'} — the transcript is being archived and this channel deletes itself in a few seconds.`
        };
      }

      case 'ticket_info': {
        const ticket = ctx.getActiveTicket?.(message.channel);
        if (!ticket) return { ok: false, message: '❌ There is no open ticket in this channel.' };
        const opened = Number.isFinite(ticket.createdAt) ? `<t:${Math.floor(ticket.createdAt)}:R>` : 'unknown';
        return {
          ok: true,
          message:
            `## 🎫 Active Ticket\n` +
            `> **Category:** ${ticket.categoryName || ticket.categoryKey || 'unknown'}\n` +
            `> **Author:** <@${ticket.authorId}>\n` +
            `> **Claimed by:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*Unclaimed*'}\n` +
            `> **Opened:** ${opened}\n` +
            `> **Reason:** ${ticket.reason || '*No reason given*'}\n` +
            `> **Channel:** <#${message.channelId}>`
        };
      }

      // ── Channel tools ───────────────────────────────────────────────────────
      case 'slowmode': {
        if (!message.channel?.isTextBased?.() || typeof message.channel.edit !== 'function') {
          return { ok: false, message: '❌ I cannot set slowmode in this channel.' };
        }
        const seconds = clampNumber(args.seconds, 0, 21600, 0);
        await message.channel.edit({ rateLimitPerUser: seconds });
        return {
          ok: true,
          message: seconds
            ? `🐢 Slowmode is now **${seconds}s** in <#${message.channelId}>.`
            : `⚡ Slowmode turned off in <#${message.channelId}>.`
        };
      }

      case 'pin_message': {
        const refId = message.reference?.messageId;
        let target = refId ? await message.channel.messages.fetch(refId).catch(() => null) : null;
        if (!target) {
          const recent = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
          target = recent?.find((m) => m.id !== message.id) ?? null;
        }
        if (!target) return { ok: false, message: '❌ I could not find a message to pin.' };
        if (target.pinned) return { ok: false, message: 'ℹ️ That message is already pinned.' };
        await target.pin().catch((err) => {
          throw new Error(`Could not pin (Manage Messages needed): ${err.message}`);
        });
        return { ok: true, message: `📌 Pinned a message in <#${message.channelId}>.` };
      }

      case 'channel_hide': {
        if (typeof message.channel.permissionOverwrites?.edit !== 'function') {
          return { ok: false, message: '❌ I cannot change visibility for this channel type.' };
        }
        const hidden = args.hidden !== false && args.hidden !== 'false';
        await message.channel.permissionOverwrites.edit(
          message.guild.id,
          { ViewChannel: !hidden },
          { reason: `Visibility changed by ${message.author.tag} via AI` }
        );
        return {
          ok: true,
          message: hidden ? '🙈 This channel is now hidden from everyone.' : '👀 This channel is visible to everyone again.'
        };
      }

      // ── Community & information ─────────────────────────────────────────────
      case 'poll': {
        const question = String(args.question ?? '').trim().slice(0, 250);
        const rawOptions = Array.isArray(args.options) ? args.options : String(args.options ?? '').split(/[;|]/);
        const options = rawOptions.map((o) => String(o).trim()).filter(Boolean).slice(0, 10);
        if (!question) return { ok: false, message: '❌ A poll needs a question.' };
        if (options.length < 2) {
          return {
            ok: false,
            message: '❌ A poll needs at least 2 options — separate them with `;`.\n> Example: `poll Friday or Saturday: session; no session`'
          };
        }
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const body = `📊 **${question}**\n\n` + options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
        const sent = await message.channel.send({ content: body, allowedMentions: { parse: [] } });
        for (let i = 0; i < options.length; i++) {
          await sent.react(emojis[i]).catch(() => {});
        }
        return { ok: true, message: `📊 Poll posted in <#${message.channelId}>.` };
      }

      case 'whois': {
        const userId = ctx.resolveUserId(args.user_id ?? null) ?? message.author.id;
        const member = await message.guild.members.fetch(userId).catch(() => null);
        const user = member?.user ?? (await ctx.client.users.fetch(userId).catch(() => null));
        if (!user) return { ok: false, message: '❌ I could not find that user.' };
        const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
        if (!member) {
          return {
            ok: true,
            message:
              `## 👤 ${user.tag}\n` +
              `> **ID:** \`${user.id}\`\n` +
              `> **Account created:** ${created}\n` +
              `> *Not in this server.*`
          };
        }
        const joined = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'unknown';
        const roles = member.roles.cache
          .filter((r) => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position);
        const roleList = roles.first(15).map((r) => `**${r.name}**`).join(' · ') || '*None*';
        const extra = roles.size > 15 ? ` (+${roles.size - 15} more)` : '';
        const top = member.roles.highest && member.roles.highest.id !== message.guild.id
          ? `**${member.roles.highest.name}**`
          : '*None*';
        return {
          ok: true,
          message:
            `## 👤 ${user.tag}${member.nickname ? ` (\`${member.nickname}\`)` : ''}\n` +
            `> **ID:** \`${user.id}\`\n` +
            `> **Account created:** ${created}\n` +
            `> **Joined server:** ${joined}\n` +
            `> **Timeout:** ${member.isCommunicationDisabled() ? '🔇 Yes' : 'No'}\n` +
            `> **Top role:** ${top}\n` +
            `> **Roles (${roles.size}):** ${roleList}${extra}`
        };
      }

      case 'avatar': {
        const userId = ctx.resolveUserId(args.user_id ?? null) ?? message.author.id;
        const user = await ctx.client.users.fetch(userId).catch(() => null);
        if (!user) return { ok: false, message: '❌ I could not find that user.' };
        const url = user.displayAvatarURL({ size: 512, dynamic: true });
        await message.channel.send({
          embeds: [{ color: 0x5865f2, title: `Avatar — ${user.tag}`, url, image: { url } }],
          allowedMentions: { parse: [] }
        });
        return { ok: true, message: `🖼 Avatar for **${user.tag}** posted above.` };
      }

      case 'guild_info': {
        const g = message.guild;
        if (!g) return { ok: false, message: '❌ This only works inside a server.' };
        return {
          ok: true,
          message:
            `## 🌐 ${g.name}\n` +
            `> **Members:** ${g.memberCount}\n` +
            `> **Roles:** ${g.roles.cache.size} · **Channels:** ${g.channels.cache.size}\n` +
            `> **Owner:** ${g.ownerId ? `<@${g.ownerId}>` : 'unknown'}\n` +
            `> **Created:** <t:${Math.floor(g.createdTimestamp / 1000)}:R>\n` +
            `> **Boosts:** ${g.premiumSubscriptionCount ?? 0} (level ${g.premiumTier})`
        };
      }

      case 'bot_stats': {
        const up = ctx.client.uptime ?? 0;
        const h = Math.floor(up / 3_600_000);
        const m = Math.floor(up / 60_000) % 60;
        const s = Math.floor(up / 1000) % 60;
        const rssMb = process.memoryUsage().rss / 1_048_576;
        const ping = Math.round(ctx.client.ws?.ping ?? 0);
        return {
          ok: true,
          message:
            `## 🤖 Bot Stats\n` +
            `> **Gateway ping:** ${ping}ms\n` +
            `> **Uptime:** ${h}h ${m}m ${s}s\n` +
            `> **Memory:** ${rssMb.toFixed(0)} MB\n` +
            `> **Servers:** ${ctx.client.guilds.cache.size}`
        };
      }

      case 'provider_status': {
        const rows = providerStatus().map((p) => {
          if (!p.open) return `> 🟢 **${p.name}** — ready (${p.models.length} model${p.models.length === 1 ? '' : 's'})`;
          const why = {
            'daily-limit': 'free daily limit used up',
            'rate-limited': 'rate limited',
            'needs-checkin': 'needs its daily check-in',
            unauthorized: 'key rejected',
            error: 'unavailable'
          }[p.reason] ?? p.reason;
          return `> 🔴 **${p.name}** — ${why}, retries <t:${Math.floor(p.retryAt / 1000)}:R>`;
        });
        return {
          ok: true,
          message: `## 🧠 AI Providers\n${rows.length ? rows.join('\n') : '> No provider keys are configured — the built-in parser handles everything.'}`
        };
      }

      // ── Staff records ───────────────────────────────────────────────────────
      case 'infraction_list': {
        const userId = ctx.resolveUserId(args.user_id ?? null);
        const limit = clampNumber(args.limit, 1, 25, 10);
        return await ctx.listInfractions({ userId, limit, guild: message.guild });
      }

      case 'infraction_revoke': {
        const userId = ctx.resolveUserId(args.user_id ?? null);
        return await ctx.revokeInfraction({
          guild: message.guild,
          userId,
          id: args.id ? String(args.id) : null,
          reason: String(args.reason || 'Revoked by staff').slice(0, 400),
          by: message.author
        });
      }

      case 'promotion_revoke': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member — mention them or give me their user id.' };
        return await ctx.revokePromotion({
          guild: message.guild,
          userId,
          reason: String(args.reason || 'Promotion revoked').slice(0, 400),
          notes: args.notes ? String(args.notes).slice(0, 400) : null,
          by: message.author
        });
      }

      // ── Direct messages ─────────────────────────────────────────────────────
      case 'dm_user': {
        const userId = ctx.resolveUserId(args.user_id, message);
        const text = String(args.text ?? '').trim().slice(0, 1800);
        if (!userId) return { ok: false, message: '❌ I need a member to DM.' };
        if (!text) return { ok: false, message: '❌ Tell me what the message should say.' };
        return await ctx.dmMember({ userId, text, by: message.author });
      }

      // ── Meetings ────────────────────────────────────────────────────────────
      case 'meeting_schedule': {
        return await ctx.scheduleMeeting({
          guild: message.guild,
          channel: message.channel,
          title: String(args.title || 'Staff Meeting').slice(0, 120),
          start: args.start ?? null,
          location: args.location ?? null,
          attendees: args.attendees ?? ['staff'],
          agenda: args.agenda ? String(args.agenda).slice(0, 800) : null,
          reminders: args.reminders !== false && args.reminders !== 'false',
          by: message.author
        });
      }

      case 'meeting_postpone': {
        return await ctx.postponeMeeting({
          guild: message.guild,
          by: String(args.by || '1 hour'),
          reason: args.reason ? String(args.reason).slice(0, 300) : null,
          user: message.author
        });
      }

      case 'meeting_cancel': {
        return await ctx.cancelMeeting({
          guild: message.guild,
          reason: args.reason ? String(args.reason).slice(0, 300) : null,
          user: message.author
        });
      }

      case 'meeting_list': {
        return await ctx.listMeetings({ guild: message.guild });
      }

      // ── Owner extras ────────────────────────────────────────────────────────
      case 'nick': {
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member — mention them or give me their user id.' };
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (!member) return { ok: false, message: '❌ That member is not in the server.' };
        const nickname = String(args.nickname ?? '').trim().slice(0, 32);
        await member.setNickname(
          nickname || null,
          `Nickname ${nickname ? 'set' : 'cleared'} by ${message.author.tag} via AI`
        );
        return {
          ok: true,
          message: nickname
            ? `✏️ Nickname of <@${userId}> is now **${nickname}**.`
            : `🧹 Nickname of <@${userId}> cleared.`
        };
      }

      case 'role_grant': {
        const op = args.op === 'remove' ? 'remove' : 'add';
        const userId = ctx.resolveUserId(args.user_id, message);
        if (!userId) return { ok: false, message: '❌ I need a member — mention them or give me their user id.' };
        const query = String(args.role ?? '').trim().replace(/^<@&|>$/g, '');
        if (!query) return { ok: false, message: '❌ Tell me which role to add or remove (name or id).' };
        const roles = message.guild.roles.cache;
        const role = /^\d{17,20}$/.test(query)
          ? roles.get(query) ?? null
          : roles.find((r) => r.name.toLowerCase() === query.toLowerCase()) ??
            roles.find((r) => r.name.toLowerCase().includes(query.toLowerCase()));
        if (!role) return { ok: false, message: `❌ I could not find a role matching \`${query.slice(0, 50)}\`.` };
        const me = message.guild.members.me;
        if (me && role.position >= me.roles.highest.position) {
          return { ok: false, message: '❌ That role is higher than my highest role.' };
        }
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (!member) return { ok: false, message: '❌ That member is not in the server.' };
        if (op === 'add') {
          if (member.roles.cache.has(role.id)) return { ok: true, message: `ℹ️ <@${userId}> already has **${role.name}**.` };
          await member.roles.add(role, `Role added by ${message.author.tag} via AI`);
          return { ok: true, message: `✅ Added **${role.name}** to <@${userId}>.` };
        }
        if (!member.roles.cache.has(role.id)) return { ok: true, message: `ℹ️ <@${userId}> does not have **${role.name}**.` };
        await member.roles.remove(role, `Role removed by ${message.author.tag} via AI`);
        return { ok: true, message: `🗑 Removed **${role.name}** from <@${userId}>.` };
      }

      default:
        return { ok: false, message: '❌ I do not know how to do that yet.' };
    }
  } catch (err) {
    console.error(`[ai] action ${intent.action} failed:`, err);
    return { ok: false, message: `❌ That failed: ${err.message}`.slice(0, 500) };
  }
}

/** Writes the AI audit line to the security log, best-effort. */
export async function logAiAction(ctx, intent, result) {
  try {
    const channel = await ctx.client.channels.fetch(ctx.securityLogChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    await channel.send({
      content: auditLine(ctx.message, intent, result.ok, result.message?.slice(0, 200)),
      allowedMentions: { parse: [] }
    });
  } catch (err) {
    console.warn(`[ai] audit log failed: ${err.message}`);
  }
}
