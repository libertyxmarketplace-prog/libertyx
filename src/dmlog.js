/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BOT DM LOG
 *
 *  Records the id of every DM the bot sends, so they can be cleaned up later
 *  with `node cleanup-dms.mjs`.
 *
 *  Discord exposes no API to enumerate a bot's DM history, so without a record
 *  of the message ids there is no way to find those messages again.
 *
 *  File: bot_dms.json  —  { "<messageId>": { userId, at, kind } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';

const MAX_ENTRIES = 5000;

let storeFile = null;
let log = new Map();

export function initDmLog(file) {
  storeFile = file;
  try {
    if (file && fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      log = new Map(Object.entries(raw));
    }
  } catch (err) {
    console.error('Could not read bot_dms.json:', err.message);
    log = new Map();
  }
  return log.size;
}

function persist() {
  if (!storeFile) return;
  try {
    // Keep the file bounded — drop the oldest entries first.
    if (log.size > MAX_ENTRIES) {
      const sorted = [...log.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
      for (const [id] of sorted.slice(0, log.size - MAX_ENTRIES)) log.delete(id);
    }
    const flat = {};
    for (const [id, rec] of log) flat[id] = rec;
    fs.writeFileSync(storeFile, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save bot_dms.json:', err.message);
  }
}

/** Records a DM the bot just sent. Never throws. */
export function recordDm(userId, messageId, kind = 'generic') {
  if (!userId || !messageId) return;
  log.set(String(messageId), { userId: String(userId), at: Date.now(), kind });
  persist();
}

/** Every recorded DM, for the cleanup script. */
export const listRecordedDms = () => [...log.entries()].map(([messageId, rec]) => ({ messageId, ...rec }));

/** Clears the log (used by `cleanup-dms.mjs --purge`). */
export function clearDmLog() {
  log = new Map();
  persist();
}
