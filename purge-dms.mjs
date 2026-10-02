/**
 * Deletes the bot's own DM messages from the last N days (default 30).
 *
 * Discord provides NO endpoint to list a bot's DM channels (GET
 * /users/@me/channels returns []) and this bot has no GUILD_MEMBERS intent, so
 * the recipient ids are taken from the bot's own data stores (infractions,
 * tickets, suggestions, …) plus any channels passed via --channel.
 *
 * Only messages authored by THIS bot inside the window are touched. Opening a
 * DM notifies nobody and deleting a message never notifies the recipient.
 *
 *   node purge-dms.mjs --dry-run                  preview, delete nothing
 *   node purge-dms.mjs --days 30                  delete the last 30 days
 *   node purge-dms.mjs --user 1234567890          just one person
 *   node purge-dms.mjs --channel id1,id2          also scan those channels
 *   node purge-dms.mjs --pace 300                 slower, gentler on rate limits
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const root = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const val = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};

const dryRun = has('--dry-run');
const days = Number(val('--days', 30));
const onlyUser = val('--user', null);
const maxMembers = Number(val('--limit', 5000));
const pace = Number(val('--pace', 250)); // ms between API calls

const token = (process.env.DISCORD_TOKEN || '').trim();
const guildId = (process.env.GUILD_ID || '').trim();
if (!token) { console.error('Missing DISCORD_TOKEN'); process.exit(1); }
if (!guildId && !onlyUser) { console.error('Missing GUILD_ID'); process.exit(1); }

const rest = new REST({ version: '10' }).setToken(token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const me = await rest.get(Routes.user());
const cutoff = Date.now() - days * 86_400_000;
console.log(`Bot:      ${me.username} (${me.id})`);
console.log(`Window:   last ${days} days — on or after ${new Date(cutoff).toISOString().slice(0, 10)}`);
console.log(`Mode:     ${dryRun ? 'DRY RUN (nothing will be deleted)' : 'DELETE'}`);
console.log('');

// ── Candidate recipients ─────────────────────────────────────────────────────
// Discord gives this bot neither a DM-channel list (GET /users/@me/channels
// returns []) nor a member roster (the GUILD_MEMBERS intent is off), so the
// reliable source of user ids is the bot's own data stores plus any channels
// you pass with --channel.
function collectCandidates() {
  const ids = new Set();
  if (onlyUser) ids.add(onlyUser);

  const files = fs
    .readdirSync(root)
    .filter((f) => f.endsWith('.json') && f !== 'package-lock.json');
  for (const file of files) {
    let raw = '';
    try { raw = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
    for (const m of raw.matchAll(/\b\d{17,20}\b/g)) ids.add(m[0]);
  }

  ids.delete(me.id);
  ids.delete(guildId);
  return [...ids];
}

/** Adds every message author from the given channels to the candidate set. */
async function addChannelAuthors(ids, channelIds) {
  for (const channelId of channelIds) {
    const messages = await rest.get(Routes.channelMessages(channelId), { query: { limit: 100 } }).catch(() => []);
    if (!Array.isArray(messages)) continue;
    for (const m of messages) if (m.author?.id && m.author.id !== me.id) ids.add(m.author.id);
    await sleep(pace);
  }
}

const channelArg = val('channel', '');
const historyChannels = channelArg ? channelArg.split(',').map((s) => s.trim()).filter(Boolean) : [];

let userIds = collectCandidates();
if (historyChannels.length) await addChannelAuthors(userIds, historyChannels);
userIds = userIds.slice(0, maxMembers);
console.log(`Candidates to check: ${userIds.length}${historyChannels.length ? ` (+ authors of ${historyChannels.length} channel(s))` : ''}\n`);

// ── Walk, read, delete ───────────────────────────────────────────────────────
let dmOk = 0;
let dmBlocked = 0;
let scanned = 0;
let hit = 0;
let deleted = 0;
let failed = 0;
let outside = 0;

for (let i = 0; i < userIds.length; i++) {
  const uid = userIds[i];
  if (i > 0 && i % 100 === 0) {
    console.log(`  … ${i}/${userIds.length} checked · ${hit} matched · ${deleted} deleted`);
  }

  // Opening a DM channel creates nothing visible and notifies no one.
  let channel;
  try {
    channel = await rest.post(Routes.userChannels(), { body: { recipient_id: uid } });
  } catch {
    dmBlocked++; // user has DMs closed — nothing to delete anyway
    await sleep(pace);
    continue;
  }
  if (!channel?.id) { dmBlocked++; continue; }
  dmOk++;
  await sleep(pace);

  let messages = [];
  let before = null;
  // Page backwards until we reach the edge of the window — deleting a page
  // pulls older messages into view, so a single fetch is never enough.
  while (true) {
    const query = { limit: 100 };
    if (before) query.before = before;
    const page = await rest.get(Routes.channelMessages(channel.id), { query }).catch(() => null);
    if (!Array.isArray(page) || !page.length) break;
    messages.push(...page);
    const oldest = Date.parse(page[page.length - 1].timestamp);
    if (!Number.isFinite(oldest) || oldest < cutoff) break;
    if (page.length < 100) break;
    before = page[page.length - 1].id;
    await sleep(pace);
  }
  if (!messages.length) continue;
  scanned++;

  for (const m of messages) {
    if (m.author?.id !== me.id) continue;
    const ts = Date.parse(m.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) { outside++; continue; }
    hit++;

    if (dryRun) {
      console.log(`  [dry-run] ${m.id} -> ${uid}  ${new Date(ts).toISOString().slice(0, 10)}`);
      continue;
    }
    try {
      await rest.delete(Routes.channelMessage(channel.id, m.id));
      deleted++;
    } catch {
      failed++;
    }
    await sleep(pace);
  }
  await sleep(pace);
}

console.log('');
console.log(`DM channels opened : ${dmOk}   (blocked/DMs closed: ${dmBlocked})`);
console.log(`Channels with history: ${scanned}`);
console.log(`Bot DMs in window    : ${hit}   (older than window: ${outside})`);
console.log(dryRun ? `Would delete        : ${hit}` : `Deleted             : ${deleted}   failed: ${failed}`);
if (dryRun) console.log('\nRun without --dry-run to delete them.');
