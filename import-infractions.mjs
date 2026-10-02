/**
 * Imports historical staff infractions from the infraction channel into
 * infractions.json, so `-ai list infractions` includes the old ones.
 *
 * The bot has always POSTED infraction cards but never stored them, so this
 * one-off reads the channel history back and records what it finds.
 *
 *   node import-infractions.mjs --dry-run    preview, write nothing
 *   node import-infractions.mjs --limit 300  scan the last 300 messages
 *
 * Idempotent: each record is keyed by its Discord message id, so re-running
 * never creates duplicates.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

// STAFF_CONFIG.derankChannelId — where /staff infraction posts its cards.
const CHANNEL_ID = '1235012685968572538';
const root = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(root, 'infractions.json');

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const SCAN_LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 300 : 300;

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) { console.error('Missing DISCORD_TOKEN'); process.exit(1); }
const rest = new REST({ version: '10' }).setToken(token);

const readStore = () => {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
};

/** Recursively collects every TextDisplay (type 10) in a Components V2 message. */
function collectText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const n of node) collectText(n, out); return out; }
  if (node.type === 10 && typeof node.content === 'string') out.push(node.content);
  if (node.components) collectText(node.components, out);
  return out;
}

const firstMatch = (text, re) => text.match(re)?.[1]?.trim() || null;

function parseCard(text) {
  if (!/##\s*Staff Infraction Notice/.test(text)) return null;
  const targetId = firstMatch(text, /\*\*Staff Member:\*\*\s*<@!?(\d{17,20})>/);
  if (!targetId) return null;
  const type = firstMatch(text, /\*\*Infraction Type:\*\*\s*(.+)/);
  const moderatorId = firstMatch(text, /\*\*Issued By:\*\*\s*<@!?(\d{17,20})>/);
  const reason = firstMatch(text, /\*\*Reason for Infraction\*\*\s*\n\s*>\s*(.+)/);
  const notes = firstMatch(text, /\*\*Next Steps & Guidelines\*\*\s*\n\s*>\s*(.+)/);
  return { targetId, type: type || 'Infraction', moderatorId, reason: reason || 'No reason recorded', notes };
}

// ── Fetch channel history ────────────────────────────────────────────────────
const messages = [];
let before = null;
while (messages.length < SCAN_LIMIT) {
  const query = { limit: Math.min(100, SCAN_LIMIT - messages.length) };
  if (before) query.before = before;
  const batch = await rest.get(Routes.channelMessages(CHANNEL_ID), { query }).catch((err) => {
    console.error('Failed to read channel:', err?.status, err?.message);
    return [];
  });
  if (!Array.isArray(batch) || !batch.length) break;
  messages.push(...batch);
  before = batch[batch.length - 1].id;
  if (batch.length < 100) break;
}

console.log(`Scanned ${messages.length} message(s) in ${CHANNEL_ID}`);

// ── Parse + merge ────────────────────────────────────────────────────────────
const store = readStore();
let imported = 0;
let already = 0;
let skipped = 0;

for (const msg of messages) {
  if (msg.author?.id === undefined) continue;
  const text = collectText(msg.components).join('\n');
  const parsed = parseCard(text);
  if (!parsed) { skipped++; continue; }

  const id = `inf_${msg.id}`; // keyed by message id => idempotent
  if (store[id]) { already++; continue; }

  store[id] = {
    id,
    guildId: msg.guild_id || null,
    targetId: parsed.targetId,
    targetTag: null,
    type: parsed.type,
    reason: parsed.reason,
    notes: parsed.notes,
    moderatorId: parsed.moderatorId || msg.author.id,
    moderatorTag: msg.author.username || null,
    createdAt: Date.parse(msg.timestamp) || Date.now(),
    imported: true,
    sourceMessageId: msg.id,
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null
  };
  imported++;
}

const total = Object.keys(store).length;
console.log(`New: ${imported}   Already present: ${already}   Not infraction cards: ${skipped}`);
console.log(`Infraction log would hold ${total} record(s).`);

if (dryRun) {
  console.log('Dry run — nothing written.');
  process.exit(0);
}

fs.writeFileSync(STORE, JSON.stringify(store, null, 2), 'utf8');
console.log(`Wrote ${STORE}`);
