/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MEETING SCHEDULER  —  `-ai schedule a meeting ...`
 *
 *  Staff plan a meeting, the bot:
 *    • DMs every attendee an RSVP card (Can attend / Cannot attend / Maybe)
 *    • posts an announcement in the channel with the same buttons
 *    • schedules reminder DMs 7 days prior and the morning of
 *    • `-ai postpone the meeting by 2 hours` shifts the time and EDITS every
 *      card in place, so nobody is pinged twice
 *    • `-ai cancel the meeting` tells everyone it is off
 *
 *  State lives in meetings.json and is re-armed on boot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_ATTENDEES = 250;

/** @type {Map<string, object>} */
const meetings = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

const cfg = {
  client: null,
  storeFile: null,
  tzOffset: -6
};

// ── Persistence ──────────────────────────────────────────────────────────────

export function loadMeetings() {
  try {
    if (!cfg.storeFile || !fs.existsSync(cfg.storeFile)) return 0;
    const raw = JSON.parse(fs.readFileSync(cfg.storeFile, 'utf8'));
    for (const [id, rec] of Object.entries(raw)) meetings.set(id, rec);
    return meetings.size;
  } catch (err) {
    console.error('Could not read meetings.json:', err.message);
    return 0;
  }
}

function saveMeetings() {
  try {
    const flat = {};
    for (const [id, rec] of meetings) flat[id] = rec;
    fs.writeFileSync(cfg.storeFile, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save meetings.json:', err.message);
  }
}

/** Wires the scheduler to the running bot. Call once at boot. */
export function initMeetingService({ client, storeFile, tzOffset }) {
  cfg.client = client;
  if (storeFile) cfg.storeFile = storeFile;
  if (Number.isFinite(Number(tzOffset))) cfg.tzOffset = Number(tzOffset);
  loadMeetings();
  armAll();
  return meetings.size;
}

// ── Time parsing ─────────────────────────────────────────────────────────────

/** UTC epoch (ms) for a wall-clock time expressed in the configured offset. */
function wallClock(baseDate, hour, minute) {
  const shifted = new Date(baseDate.getTime() + cfg.tzOffset * HOUR);
  const utc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    hour,
    minute
  );
  return utc - cfg.tzOffset * HOUR;
}

/**
 * Reads a meeting time out of free text.
 * Supports: ISO ("2026-03-14T19:00"), "in 2 hours", "tomorrow at 7pm",
 * "tonight", "at 18:30". Returns null when nothing usable is found — the
 * caller then refuses instead of guessing.
 */
export function parseWhen(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  const now = new Date();

  // 1. Relative — checked FIRST so a duration is never mistaken for a date.
  //    Covers "in 2 hours", "2 hours", "in 3 days", "45 minutes", "3d".
  const rel = text.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2][0];
    const ms = unit === 'm' ? 60_000 : unit === 'h' ? HOUR : unit === 'd' ? DAY : 604_800_000;
    return now.getTime() + n * ms;
  }

  // 2. Optional time of day: "at 7pm", "at 18:30", "19:00".
  let hour = null;
  let minute = 0;
  const ampm = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    hour = Number(ampm[1]) % 12;
    if (ampm[3] === 'pm') hour += 12;
    minute = Number(ampm[2] ?? 0);
  } else {
    const h24 = text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
    if (h24) {
      hour = Number(h24[1]);
      minute = Number(h24[2]);
    }
  }

  // Always the NEXT occurrence, so these branches can never return the past.
  const upcoming = (base, h, m) => {
    const ts = wallClock(base, h, m);
    return ts > now.getTime() ? ts : ts + DAY;
  };

  // 3. Day words, resolved against the server's local wall clock.
  if (/\btomorrow\b/.test(text)) return wallClock(new Date(now.getTime() + DAY), hour ?? 19, minute);
  if (/\b(tonight|this evening|today)\b/.test(text)) return upcoming(now, hour ?? 19, minute);
  if (hour !== null) return upcoming(now, hour, minute);

  // 4. Absolute: "2026-03-14T19:00".
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ](\d{1,2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    return wallClock(new Date(Date.UTC(+y, +mo - 1, +d, 12)), +(h ?? 19), +(mi ?? 0));
  }

  return null;
}
// ── Cards ────────────────────────────────────────────────────────────────────

const RSVP_LABEL = { yes: 'Can attend', no: 'Cannot attend' };

/** Thin divider used between card sections. */
const divider = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

/** The two RSVP buttons — they work in DMs and in the channel. */
function rsvpRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`meet_yes_${id}`).setLabel('Can attend').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`meet_no_${id}`).setLabel('Cannot attend').setStyle(ButtonStyle.Danger)
  );
}

/**
 * The meeting card — a compact Components V2 panel.
 * Headings, bold labels and blockquotes only: no emoji, no tally line.
 *
 * @param {object} meeting
 * @param {'invite'|'reminder'|'postponed'|'cancelled'|'start'} variant
 * @param {string|null} forUserId set for DM cards so they show YOUR reply
 */
function buildCard(meeting, variant = 'invite', forUserId = null) {
  const card = new ContainerBuilder();
  try {
    card.setAccentColor(variant === 'cancelled' ? 0x80848e : variant === 'postponed' ? 0xfee75c : 0x5865f2);
  } catch { /* accent is cosmetic */ }

  const heading = {
    cancelled: '## Meeting Cancelled',
    postponed: '## Meeting Postponed',
    reminder: '## Meeting Reminder',
    start: '## Meeting Starting Now'
  }[variant] || '## Meeting Invitation';

  card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading}\n**${meeting.title}**`));
  card.addSeparatorComponents(divider());

  const secs = Math.floor(meeting.startTs / 1000);
  const fields = [
    `**When**  <t:${secs}:F>  ·  <t:${secs}:R>`,
    `**Where**  ${meeting.location || 'Not set'}`,
    `**Host**  <@${meeting.hostId}>`
  ];
  if (meeting.agenda) fields.push(`**Agenda**  ${meeting.agenda}`);
  if (meeting.postponedCount) {
    fields.push(
      `**Postponed**  ${meeting.postponedCount} time(s)` +
        (meeting.lastPostponeReason ? ` — ${meeting.lastPostponeReason}` : '')
    );
  }
  if (variant === 'cancelled' && meeting.cancelReason) fields.push(`**Reason**  ${meeting.cancelReason}`);
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.join('\n')));

  if (variant !== 'cancelled') {
    if (forUserId) {
      const status = meeting.rsvp?.[forUserId]?.status;
      const reply = status === 'yes' ? 'Can attend' : status === 'no' ? 'Cannot attend' : 'No response yet';
      card.addSeparatorComponents(divider());
      card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Your reply**\n> ${reply}`));
    }
    card.addActionRowComponents(rsvpRow(meeting.id));
  }

  card.addSeparatorComponents(divider());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Reminders are sent 7 days before and the morning of the meeting.')
  );
  return card;
}

/** Builds the Components V2 payload for a meeting card (exported for tests). */
export function cardPayload(meeting, variant, forUserId = null) {
  return {
    components: [buildCard(meeting, variant, forUserId).toJSON()],
    flags: MessageFlags.IsComponentsV2
  };
}
// ── Delivery helpers ─────────────────────────────────────────────────────────

/** Sends a DM and returns the message (or null when DMs are closed). */
async function sendDm(userId, payload) {
  try {
    const user = await cfg.client.users.fetch(userId);
    return await user.send(payload);
  } catch {
    return null;
  }
}

/** Edits a previously sent DM in place — used by postpone so nobody is re-pinged. */
async function editDm(userId, messageId, payload) {
  if (!messageId) return false;
  try {
    const user = await cfg.client.users.fetch(userId);
    const channel = await user.createDM();
    const msg = await channel.messages.fetch(messageId);
    await msg.edit(payload);
    return true;
  } catch {
    return false;
  }
}

/** Edits the channel announcement in place. */
async function editAnnouncement(meeting, payload) {
  if (!meeting.channelId || !meeting.messageId) return false;
  try {
    const channel = await cfg.client.channels.fetch(meeting.channelId);
    if (!channel?.isTextBased?.()) return false;
    const msg = await channel.messages.fetch(meeting.messageId);
    await msg.edit(payload);
    return true;
  } catch {
    return false;
  }
}

/** Turns the AI's `attendees` argument into a concrete list of user ids. */
async function resolveAttendees(guild, attendees) {
  const ids = new Set();
  let everyone = false;
  const list = Array.isArray(attendees) ? attendees : [attendees];
  for (const raw of list) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (/^(everyone|all|@everyone|here)$/i.test(value)) {
      everyone = true;
      continue;
    }
    const uid = value.match(/\d{17,20}/)?.[0];
    if (uid) ids.add(uid);
  }
  return { ids, everyone };
}

/** Expands "staff" into every member wearing the Staff Team role. */
async function staffMemberIds(guild, staffRoleId) {
  await guild.members.fetch().catch(() => null);
  const ids = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (staffRoleId && member.roles.cache.has(staffRoleId)) ids.push(member.id);
  }
  return ids;
}

// ── Reminder timers ──────────────────────────────────────────────────────────

function clearTimers() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

/** 09:00 (configured offset) on the day the meeting starts. */
function morningOf(startTs) {
  const shifted = new Date(startTs + cfg.tzOffset * HOUR);
  const utc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    9,
    0
  );
  return utc - cfg.tzOffset * HOUR;
}

function arm(id, kind, at) {
  const key = `${id}:${kind}`;
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const delay = Math.max(1000, at - Date.now());
  const timer = setTimeout(() => {
    timers.delete(key);
    fireReminder(id, kind).catch((err) => console.warn('[meetings] reminder failed:', err.message));
  }, delay);
  timer.unref?.();
  timers.set(key, timer);
}

/** (Re)arms every pending reminder for every scheduled meeting. */
export function armAll() {
  clearTimers();
  for (const meeting of meetings.values()) {
    if (meeting.status !== 'scheduled') continue;
    const now = Date.now();
    if (meeting.reminders) {
      const weekAt = meeting.startTs - 7 * DAY;
      if (!meeting.sentWeek && weekAt > now) arm(meeting.id, 'week', weekAt);
      const morningAt = morningOf(meeting.startTs);
      if (!meeting.sentMorning && morningAt > now) arm(meeting.id, 'morning', morningAt);
    }
    if (!meeting.sentStart && meeting.startTs > now) arm(meeting.id, 'start', meeting.startTs);
  }
}
/** Fires a reminder / start ping. Edits the existing DM where possible. */
async function fireReminder(id, kind) {
  const meeting = meetings.get(id);
  if (!meeting || meeting.status !== 'scheduled') return;

  if (kind === 'start') {
    meeting.status = 'started';
    meeting.sentStart = true;
    saveMeetings();
    await editAnnouncement(meeting, cardPayload(meeting, 'start')).catch(() => null);
    for (const uid of Object.keys(meeting.rsvp || {})) {
      if (meeting.rsvp[uid]?.status === 'no') continue;
      await sendDm(uid, cardPayload(meeting, 'start', uid)).catch(() => null);
    }
    return;
  }

  const variant = 'reminder';
  for (const uid of meeting.attendees || []) {
    const mine = meeting.rsvp?.[uid];
    // Always edit in place so the person is not pinged twice; only a first-time
    // reminder falls back to a fresh DM.
    const edited = await editDm(uid, mine?.dmMessageId, cardPayload(meeting, variant, uid));
    if (!edited) {
      const msg = await sendDm(uid, cardPayload(meeting, variant, uid));
      if (msg && mine) mine.dmMessageId = msg.id;
    }
  }
  if (kind === 'week') meeting.sentWeek = true;
  if (kind === 'morning') meeting.sentMorning = true;
  saveMeetings();
}

// ── Public AI-facing operations ──────────────────────────────────────────────

/**
 * `-ai schedule a meeting ...`
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function scheduleMeeting({ guild, channel, title, start, location, attendees, agenda, reminders, by, staffRoleId, raw }) {
  // Use the parsed/model value first. If it is unusable OR lands in the past,
  // fall back to what the human actually typed — the model sometimes invents a
  // stale date when it does not know what day it is.
  let when = parseWhen(start);
  const stale = !when || when - Date.now() < 60_000;
  if (stale && raw) {
    const fallback = parseWhen(String(raw).replace(/^.*?-ai\s+/i, ''));
    if (fallback && fallback - Date.now() >= 60_000) when = fallback;
  }

  if (!when) {
    return {
      ok: false,
      message: '❌ I could not read that time. Try "in 2 hours", "tomorrow at 7pm" or 2026-03-14T19:00.'
    };
  }
  if (when - Date.now() < 60_000) {
    return {
      ok: false,
      message:
        `❌ I read that as <t:${Math.floor(when / 1000)}:F>, which has already passed.\n` +
        `> Try a relative time instead — "in 2 hours" or "tomorrow at 7pm".`
    };
  }

  const { ids, everyone } = await resolveAttendees(guild, attendees);
  if (everyone && guild) {
    for (const member of guild.members.cache.values()) {
      if (!member.user?.bot) ids.add(member.id);
    }
  }
  // Anything that is not an explicit id means "the staff team".
  if (!ids.size) (await staffMemberIds(guild, staffRoleId)).forEach((id) => ids.add(id));

  // Idempotency guard: if another instance (or a double-fired event) already
  // created this exact meeting, reuse it instead of DMing everyone twice.
  loadMeetings(); // pick up anything another instance wrote to the shared file
  const existing = [...meetings.values()].find(
    (m) => m.status === 'scheduled' && m.title === (title || 'Staff Meeting') && Math.abs(m.startTs - when) < 60_000
  );
  if (existing) {
    return {
      ok: true,
      message:
        `ℹ️ **${existing.title}** is already scheduled for <t:${Math.floor(existing.startTs / 1000)}:F> — ` +
        `I did not send duplicate invites.\n` +
        `> Use -ai postpone the meeting or -ai cancel the meeting to change it.`
    };
  }

  const id = `mtg${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;
  const meeting = {
    id,
    guildId: guild?.id ?? null,
    hostId: by.id,
    hostTag: by.tag,
    title: title || 'Staff Meeting',
    startTs: when,
    location: location || null,
    agenda: agenda || null,
    attendees: [...ids].slice(0, MAX_ATTENDEES),
    rsvp: {},
    status: 'scheduled',
    reminders: reminders !== false,
    sentWeek: false,
    sentMorning: false,
    sentStart: false,
    postponedCount: 0,
    lastPostponeReason: null,
    cancelReason: null,
    channelId: channel?.id ?? null,
    messageId: null,
    createdAt: Date.now()
  };

  // Announcement first, so the buttons exist in-channel too.
  if (channel?.isTextBased?.()) {
    try {
      const sent = await channel.send(cardPayload(meeting, 'invite'));
      meeting.messageId = sent.id;
    } catch (err) {
      console.warn('[meetings] could not post announcement:', err.message);
    }
  }

  // DM every attendee and remember each message id for in-place edits.
  let delivered = 0;
  for (const uid of meeting.attendees) {
    const msg = await sendDm(uid, cardPayload(meeting, 'invite', uid));
    if (msg) {
      delivered++;
      meeting.rsvp[uid] = meeting.rsvp[uid] || { status: null, dmMessageId: null };
      meeting.rsvp[uid].dmMessageId = msg.id;
    }
  }

  meetings.set(id, meeting);
  saveMeetings();
  armAll();

  return {
    ok: true,
    message:
      `✅ **${meeting.title}** scheduled for <t:${Math.floor(when / 1000)}:F> (<t:${Math.floor(when / 1000)}:R>).\n` +
      `> **Invites delivered:** ${delivered}/${meeting.attendees.length}\n` +
      `> **Reminders:** ${meeting.reminders ? '7 days prior + the morning of' : 'off'}${meeting.messageId ? `\n> **Announcement:** <#${meeting.channelId}>` : ''}`
  };
}
/** `-ai postpone the meeting by <duration>` */
export async function postponeMeeting({ guild, by, reason, user }) {
  const meeting = [...meetings.values()]
    .filter((m) => m.status === 'scheduled' && (!m.guildId || m.guildId === guild?.id))
    .sort((a, b) => a.startTs - b.startTs)[0];
  if (!meeting) return { ok: false, message: '❌ There is no scheduled meeting to postpone.' };

  const delta = parseDurationMs(by);
  if (!delta) return { ok: false, message: `❌ I could not read the duration "${by}". Try "1 hour" or "3 days".` };

  meeting.startTs += delta;
  meeting.postponedCount = (meeting.postponedCount || 0) + 1;
  meeting.lastPostponeReason = reason || null;
  meeting.sentWeek = false;
  meeting.sentMorning = false;
  meeting.sentStart = false;
  saveMeetings();

  const when = `<t:${Math.floor(meeting.startTs / 1000)}:F> (<t:${Math.floor(meeting.startTs / 1000)}:R>)`;
  await editAnnouncement(meeting, cardPayload(meeting, 'postponed')).catch(() => null);

  // Edit each attendee's DM in place — nobody is pinged a second time.
  let edited = 0;
  for (const uid of meeting.attendees) {
    const entry = meeting.rsvp?.[uid];
    if (await editDm(uid, entry?.dmMessageId, cardPayload(meeting, 'postponed', uid))) edited++;
  }
  armAll();

  return {
    ok: true,
    message:
      `🕒 **${meeting.title}** postponed to ${when}.\n` +
      `> **Cards updated in place:** ${edited}/${meeting.attendees.length} (no double pings)\n` +
      (reason ? `> **Reason:** ${reason}\n` : '')
  };
}

/** `-ai cancel the meeting` */
export async function cancelMeeting({ guild, reason, user }) {
  const meeting = [...meetings.values()]
    .filter((m) => m.status === 'scheduled' && (!m.guildId || m.guildId === guild?.id))
    .sort((a, b) => a.startTs - b.startTs)[0];
  if (!meeting) return { ok: false, message: '❌ There is no scheduled meeting to cancel.' };

  meeting.status = 'cancelled';
  meeting.cancelReason = reason || null;
  saveMeetings();
  clearTimers();
  armAll();

  await editAnnouncement(meeting, cardPayload(meeting, 'cancelled')).catch(() => null);
  let notified = 0;
  for (const uid of meeting.attendees) {
    const entry = meeting.rsvp?.[uid];
    if (await editDm(uid, entry?.dmMessageId, cardPayload(meeting, 'cancelled', uid))) notified++;
  }

  return { ok: true, message: `🚫 **${meeting.title}** cancelled. ${notified} attendee(s) notified.` };
}

/** `-ai list meetings` */
export async function listMeetings({ guild }) {
  const rows = [...meetings.values()]
    .filter((m) => !m.guildId || m.guildId === guild?.id)
    .sort((a, b) => a.startTs - b.startTs);
  if (!rows.length) return { ok: true, message: '📭 There are no meetings scheduled.' };

  const lines = rows.map((m, i) => {
    const rsvp = m.rsvp || {};
    const yes = Object.values(rsvp).filter((r) => r.status === 'yes').length;
    const nope = Object.values(rsvp).filter((r) => r.status === 'no').length;
    const maybe = Object.values(rsvp).filter((r) => r.status === 'maybe').length;
    const status = m.status === 'scheduled' ? '' : ` **(${m.status})**`;
    return (
      `${i + 1}. **${m.title}**${status} — <t:${Math.floor(m.startTs / 1000)}:F> (<t:${Math.floor(m.startTs / 1000)}:R>)\n` +
      `> Where: ${m.location || '*not set*'} · Host: <@${m.hostId}>\n` +
      `> RSVPs: ✅ ${yes} · ❌ ${nope} · 🤔 ${maybe} · Attendees: ${(m.attendees || []).length}`
    );
  });
  return { ok: true, message: `## Scheduled Meetings\n${lines.join('\n\n')}` };
}
// ── Buttons ──────────────────────────────────────────────────────────────────

/**
 * Handles a meeting RSVP button, in a DM or in the channel.
 * Edits the card in place so the tally stays accurate and nothing is re-pinged.
 * @returns {Promise<boolean>} true when the customId belonged to a meeting.
 */
export async function handleMeetingButton(interaction) {
  const match = /^meet_(yes|no|maybe)_(.+)$/.exec(interaction.customId || '');
  if (!match) return false;
  const status = match[1];
  const id = match[2];

  // Another instance may own this meeting. Re-read the shared store before
  // giving up, so a stale in-memory copy never shows "no longer exists".
  let meeting = meetings.get(id);
  if (!meeting) {
    loadMeetings();
    meeting = meetings.get(id);
  }

  if (!meeting) {
    await interaction
      .reply({
        content:
          'That meeting is no longer available — it may have been cancelled or the record has been cleared.\n' +
          '> Ask the host for the current details.',
        flags: MessageFlags.Ephemeral
      })
      .catch(() => null);
    return true;
  }

  if (meeting.status === 'cancelled') {
    await interaction
      .reply({ content: 'That meeting was cancelled.', flags: MessageFlags.Ephemeral })
      .catch(() => null);
    return true;
  }

  meeting.rsvp = meeting.rsvp || {};
  const previous = meeting.rsvp[interaction.user.id]?.status;
  meeting.rsvp[interaction.user.id] = {
    ...(meeting.rsvp[interaction.user.id] || {}),
    status,
    at: Date.now()
  };
  saveMeetings();

  // The card is rebuilt for this viewer so "Your reply" is correct.
  const payload = cardPayload(meeting, meeting.status === 'started' ? 'start' : 'invite', interaction.user.id);
  try {
    if (interaction.message && typeof interaction.message.edit === 'function') {
      await interaction.message.edit(payload);
    } else if (typeof interaction.update === 'function') {
      await interaction.update(payload);
    }
  } catch {
    // Fall through to a plain acknowledgement so the click still registers.
  }

  const label = RSVP_LABEL[status] || 'No response yet';
  const suffix = previous && previous !== status ? ` (was ${RSVP_LABEL[previous] || previous})` : '';
  await interaction
    .followUp({ content: `Your reply is **${label}**${suffix}.`, flags: MessageFlags.Ephemeral })
    .catch(() => null);
  return true;
}

/** Local duration parser ("2 hours", "3 days", "90 minutes") -> milliseconds. */
function parseDurationMs(input) {
  const text = String(input || '').trim().toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)\b/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2][0];
  const ms = unit === 'm' ? 60_000 : unit === 'h' ? HOUR : unit === 'd' ? DAY : 604_800_000;
  return n * ms;
}

/** Snapshot of the pending meetings, handy for tests / diagnostics. */
export const listScheduledMeetings = () => [...meetings.values()];