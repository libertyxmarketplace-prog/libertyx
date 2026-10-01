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

/** Returns the permission tier of a Discord user for the AI engine. */
export function aiAccessTier(userId) {
  if (!userId) return 'none';
  if (userId === AI_OWNER_ID) return 'owner';
  if (userId === AI_DIRECTIVE_ID) return 'directive';
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
  { action: 'unban', risk: 'owner', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Lift a Discord ban.' },
  { action: 'kick', risk: 'owner', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Kick a member from the server.' },
  { action: 'timeout', risk: 'owner', args: { user_id: 'snowflake', minutes: 'int 1-40320', reason: 'string' }, desc: 'Timeout (mute) a member for a number of minutes.' },
  { action: 'untimeout', risk: 'owner', args: { user_id: 'snowflake', reason: 'string' }, desc: 'Clear an active timeout.' },
  { action: 'purge', risk: 'owner', args: { amount: 'int 1-100', reason: 'string' }, desc: 'Bulk delete recent messages in this channel.' },
  { action: 'say', risk: 'owner', args: { channel_id: 'snowflake or null', text: 'string' }, desc: 'Send an announcement as the bot.' },
  { action: 'channel_lock', risk: 'owner', args: { locked: 'boolean', reason: 'string' }, desc: 'Lock or unlock the current channel for @everyone.' },
  { action: 'retrigger', risk: 'owner', args: {}, desc: 'Emergency re-sync: re-register commands, reload every datastore, restart loops.' },
  {
    action: 'erlc_action',
    risk: 'owner',
    args: { verb: "'pm'|'message'|'hint'|'jail'|'unjail'|'kick'|'ban'|'unban'", player: 'roblox username', text: 'string or null' },
    desc: 'Execute an in-game ER:LC command against a player.'
  }
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
        '- "close/lock/open <department>" (general, internal affairs, high rank, partnership, staff partnership, applications) -> desk_department',
        '- "close all tickets", "close the desk", "shut the desk" -> desk_status with status "closed"',
        '- "make the desk busy" -> desk_status with status "busy"',
        '- "open all", "reopen tickets", "set the desk online" -> desk_status with status "online"',
        '- "ban/jail <name>" where <name> is NOT a Discord id (no 17-20 digit number, no <@...>) -> erlc_action, in-game',
        '- "kick/ban/timeout <Discord id or <@...>>" -> the matching Discord action',
        '- Duration words like "7 days", "2 hours", "permanently" go in duration_days / minutes / null.'
      ].join('\n')
    : [
        'You may use EVERY action listed below. All of them are permitted for this caller.',
        'The actions NOT listed (bans, kicks, timeouts, purges, announcements, channel locks, in-game commands, restarts) belong to the bot owner. If the request needs one of those, reply with action "unsupported".',
        '',
        'How to choose:',
        '- "close/lock/open <department>" (general, internal affairs, high rank, partnership, staff partnership, applications) -> desk_department',
        '- "close all tickets", "close the desk", "shut the desk" -> desk_status with status "closed"',
        '- "make the desk busy" -> desk_status with status "busy"',
        '- "open all", "reopen tickets", "set the desk online" -> desk_status with status "online"'
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

  // ── Help / directory ────────────────────────────────────────────────────────
  if (/^(help|what can you do|commands|list|guide|options)\b/.test(t)) {
    return { action: 'ai_help', args: {}, reply: 'Here is everything the AI engine can do.' };
  }
  if (/^(command directory|command guide|show commands)\b/.test(t)) {
    return { action: 'commands_guide', args: {}, reply: 'Opening the interactive command directory.' };
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

  // ── Ticket members ──────────────────────────────────────────────────────────
  if (/\b(add|unadd|remove)\b/.test(t) && /\b(ticket|user|member)\b/.test(t) && ticketUser) {
    const op = /\b(unadd|remove)\b/.test(t) ? 'unadd' : 'add';
    return { action: 'ticket_member', args: { op, user_id: ticketUser }, reply: `${op === 'add' ? 'Adding' : 'Removing'} <@${ticketUser}> from this ticket.` };
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

  // Explain WHY we fell back. Silent degradation is confusing — the user needs
  // to know whether the AI is genuinely offline or just busy elsewhere.
  const down = AI_PROVIDERS.filter((p) => (breakers.get(p.name)?.until ?? 0) > Date.now());
  if (down.length === AI_PROVIDERS.length && down.length > 0) {
    const daily = down.find((p) => breakers.get(p.name)?.reason === 'daily-limit');
    const checkin = down.find((p) => breakers.get(p.name)?.reason === 'needs-checkin');
    if (daily) {
      local.gatewayNotice =
        `⏳ Every AI provider is unavailable (${daily.name}'s free daily limit is used up, resets ` +
        `<t:${Math.floor(breakers.get(daily.name).until / 1000)}:R>). I used my built-in parser instead.`;
    } else if (checkin) {
      local.gatewayNotice =
        `🔑 Every AI provider is unavailable (${checkin.name} needs its daily web check-in at ` +
        `https://freetheai.org/checkin). I used my built-in parser instead.`;
    } else {
      local.gatewayNotice = '⚠️ Every AI provider is unavailable right now — I used my built-in parser instead.';
    }
  } else if (down.length > 0) {
    // Some providers are down but we still got an answer from another one; only
    // reach this branch when the chain failed for a non-breaker reason.
    local.gatewayNotice = '⚠️ Some AI providers are unavailable — I used my built-in parser instead.';
  } else if (lastError) {
    local.gatewayNotice = '⚠️ The AI providers did not return a usable answer — I used my built-in parser instead.';
  }
  return local;
}

// ── Help text ─────────────────────────────────────────────────────────────────

/** Builds the `-ai help` card body as markdown, scoped to the caller's tier. */
export function buildAiHelpText(tier) {
  const directive = [
    '**Sessions** — `start a session vote with 5 users for 2 hours` · `close the session` · `post the session panel`',
    '**Tickets** — `make the ticket desk busy` · `close the general ticket` · `open internal affairs` · `close all tickets` · `add <@user> to this ticket`',
    '**Community** — `make a suggestion that we add more staff` · `show the top suggestion`',
    '**Info** — `how many players are online` · `show the command directory`'
  ];
  const owner = [
    '**Moderation** — `ban <@user> for 7 days for spamming` · `unban <@user>` · `kick <@user> for raiding` · `timeout <@user> for 2 hours` · `purge 25`',
    '**Server** — `say Session starts in 5 minutes` · `lock this channel` · `post the verification panel`',
    '**In-game** — `jail RobloxName` · `unjail RobloxName` · `announce we are full` · `hint roadblock ahead` · `pm RobloxName to join staff`',
    '**System** — `retrigger the bot` · `how many players are online`'
  ];
  const lines = [
    '## 🤖 AI Command Engine',
    'Type a request in plain English and I will run it for you.',
    '',
    '### Directive Team — available to you',
    ...directive.map((l) => `- ${l}`)
  ];
  if (tier === 'owner') {
    lines.push('', '### Owner — additionally available to you', ...owner.map((l) => `- ${l}`));
  }
  lines.push(
    '',
    '### Examples',
    '> `-ai start a session vote with 5 users`',
    '> `-ai close the general ticket`',
    '> `-ai ban @user for 3 days for advertising`',
    '',
    '### AI providers',
    ...providerStatus().map((p) => {
      if (!p.open) return `> 🟢 **${p.name}** — ready (${p.models.length} model${p.models.length === 1 ? '' : 's'})`;
      const why = {
        'daily-limit': 'free daily limit used up',
        'rate-limited': 'rate limited',
        'needs-checkin': 'needs its daily check-in',
        unauthorized: 'key rejected',
        error: 'unavailable'
      }[p.reason] ?? p.reason;
      return `> 🔴 **${p.name}** — ${why}, retries <t:${Math.floor(p.retryAt / 1000)}:R>`;
    }),
    '',
    `-# Owner <@${AI_OWNER_ID}> · Directive Team <@${AI_DIRECTIVE_ID}>`
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
        const targetChannel = args.channel_id
          ? await ctx.client.channels.fetch(String(args.channel_id)).catch(() => null)
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
        return { ok: true, message: `${icon} Ticket desk is now **${status}**. The panel has been refreshed.` };
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
        return { ok: true, message: `${open ? '🔓 Opened' : '🔒 Locked'} **${dept.replace(/_/g, ' ')}**.` };
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
        const blocked = intent.restrictedAction
          ? `\`${intent.restrictedAction}\``
          : 'that action';
        return {
          ok: false,
          message:
            `❌ ${blocked} is restricted to the bot owner.\n` +
            `> Ask <@${AI_OWNER_ID}> to run it, or type \`-ai help\` to see what you can run.`
        };
      }

      // Nothing matched — either the request is nonsense, or (for the directive
      // tier) it needed an action they are not allowed to use.
      case 'unsupported': {
        if (intent.tier === 'owner') {
          return {
            ok: false,
            message:
              `❌ I could not work out what to do with that.\n` +
              `> Try \`-ai help\` to see everything I can run.`
          };
        }
        return {
          ok: false,
          message:
            `❌ I could not do that — it needs a permission you do not have.\n` +
            `> Ask <@${AI_OWNER_ID}> to run it, or type \`-ai help\` to see what you can run.`
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
