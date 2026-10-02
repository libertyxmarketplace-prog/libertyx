/**
 * Quietly deletes DM messages the bot sent.
 *
 * Discord notifies nobody when a message is deleted, so this is silent for the
 * recipient — they will simply see the message is gone.
 *
 * IMPORTANT: Discord provides no API to enumerate a bot's DM history, so only
 * messages whose ids we recorded can be removed:
 *   • meetings.json  — meeting invite / reminder / postpone cards
 *   • bot_dms.json   — every DM the bot sends from this build onwards
 *
 * Usage:
 *   node cleanup-dms.mjs             delete every tracked DM, keep the records
 *   node cleanup-dms.mjs --dry-run   list what would be deleted
 *   node cleanup-dms.mjs --purge     delete them AND clear the tracking records
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const purge = process.argv.includes('--purge');
const rest = new REST({ version: '10' }).setToken(token);

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return null;
  }
};
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2), 'utf8');

// ── Collect every tracked message id ────────────────────────────────────────
const targets = [];
const meetings = readJson('meetings.json');
if (meetings) {
  for (const [id, m] of Object.entries(meetings)) {
    for (const [userId, entry] of Object.entries(m.rsvp || {})) {
      if (entry?.dmMessageId) targets.push({ userId, messageId: entry.dmMessageId, source: `meeting ${id}` });
    }
    for (const [userId, messageId] of Object.entries(m.dmMessages || {})) {
      targets.push({ userId, messageId, source: `meeting ${id}` });
    }
  }
}
const dmLog = readJson('bot_dms.json');
if (dmLog) {
  for (const [messageId, rec] of Object.entries(dmLog)) {
    if (rec?.userId) targets.push({ userId: rec.userId, messageId, source: rec.kind || 'dm log' });
  }
}

const seen = new Set();
const queue = targets.filter((t) => t.userId && t.messageId && !seen.has(t.messageId) && seen.add(t.messageId));

console.log(`Tracked bot DM messages: ${queue.length}`);
if (!queue.length) {
  console.log('Nothing to delete.');
  process.exit(0);
}

if (dryRun) {
  for (const t of queue) console.log(`  [dry-run] ${t.messageId} -> ${t.userId} (${t.source})`);
  process.exit(0);
}

// ── Delete ──────────────────────────────────────────────────────────────────
const dmChannelFor = new Map();
let deleted = 0;
let skipped = 0;

for (const t of queue) {
  try {
    let channelId = dmChannelFor.get(t.userId);
    if (!channelId) {
      const channel = await rest.post(Routes.userChannels(t.userId));
      channelId = channel.id;
      dmChannelFor.set(t.userId, channelId);
    }
    await rest.delete(Routes.channelMessage(channelId, t.messageId));
    deleted++;
    console.log(`  deleted ${t.messageId} (to ${t.userId}, ${t.source})`);
  } catch (err) {
    skipped++;
    const reason = err?.message || err?.code || 'unknown';
    // 404 = already gone, which is the outcome we wanted anyway.
    console.log(`  skipped ${t.messageId} (to ${t.userId}): ${reason}`);
  }
  // Stay comfortably under Discord's rate limits.
  await new Promise((r) => setTimeout(r, 350));
}

console.log(`\nDeleted: ${deleted}   Already gone / failed: ${skipped}`);

// ── Optionally clear the records so they are not retried ────────────────────
if (purge) {
  if (meetings) {
    for (const m of Object.values(meetings)) {
      for (const entry of Object.values(m.rsvp || {})) {
        if (entry) entry.dmMessageId = null;
      }
      m.dmMessages = {};
    }
    writeJson('meetings.json', meetings);
    console.log('Cleared meeting DM ids.');
  }
  if (dmLog) {
    writeJson('bot_dms.json', {});
    console.log('Cleared bot_dms.json.');
  }
}
