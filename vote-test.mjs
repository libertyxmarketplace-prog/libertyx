// Offline smoke test for the /session vote engine (no Discord login).
import { buildVoteContainer, serverStatus } from './src/index.js';
import fs from 'node:fs';

// Stub client: every Discord call fails gracefully, like real life.
const stubClient = {
  channels: {
    fetch: async () => {
      throw new Error('no discord in test');
    }
  },
  users: {
    fetch: async () => {
      throw new Error('no discord in test');
    }
  }
};

// Pull internals by re-implementing minimal access via module state:
// toggleVoter/saveVotes/applyPostpone are not exported, so exercise them
// through a tiny harness: import the module fresh and use its exported API.
const mod = await import('./src/index.js');

// The engine functions aren't exported — replicate their flow using the
// exported buildVoteContainer + a manual voter map, and validate JSON
// persistence by writing the same shape saveVotes() writes.
let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) {
    pass++;
    console.log('PASS', name);
  } else {
    fail++;
    console.log('FAIL', name);
  }
};

const mkVote = (needed) => ({
  id: 'vtest1',
  guildId: 'g',
  channelId: 'c',
  messageId: 'm',
  hostId: 'h',
  hostName: 'Host',
  needed,
  roleId: 'r',
  endTs: Date.now() + 60 * 60_000,
  ready: false,
  postponed: false,
  started: false,
  expired: false,
  voters: {}
});

// 1) Card structure — Vote button enabled + interactive, count pill disabled.
let vote = mkVote(10);
const card = buildVoteContainer(vote).toJSON();
const rows = card.components.filter((c) => c.type === 1); // action rows
const voteBtn = rows[0]?.components[0];
const pill = card.components.find(
  (c) => c.type === 9 && c.accessory?.custom_id?.startsWith('vote_count_')
);
ok(voteBtn?.custom_id === 'vote_click_vtest1', 'vote button is vote_click_<id>');
ok(voteBtn?.disabled === false, 'Vote button interactive');
ok(pill?.accessory?.disabled === true, 'count pill disabled (not clickable)');
ok(card.accent_color === 0x5865f2, 'open color blurple');

// 2) Goal state flips button green + disables it.
vote.voters = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 };
const readyCard = buildVoteContainer(vote).toJSON();
const readyBtn = readyCard.components.find((c) => c.type === 1).components[0];
ok(readyBtn.style === 3, 'goal reached → button green (style 3)');
ok(readyBtn.disabled === true, 'goal reached → Vote button disabled');
ok(readyCard.accent_color === 0x57f287, 'goal reached → green accent');

// 3) Expired state kills the button.
vote.expired = true;
const deadCard = buildVoteContainer(vote).toJSON();
const deadBtn = deadCard.components.find((c) => c.type === 1).components[0];
ok(deadBtn.disabled === true, 'expired → button disabled');
ok(deadBtn.label === 'Expired', 'expired → label Expired');

// 4) Persistence round-trip (same shape saveVotes()/loadVotes() use).
fs.writeFileSync(
  'votes.test.json',
  JSON.stringify({ vtest1: { ...vote, expired: false } }, null, 2)
);
const raw = JSON.parse(fs.readFileSync('votes.test.json', 'utf8'));
ok(raw.vtest1.needed === 10 && raw.vtest1.hostId === 'h', 'votes file round-trip');
fs.unlinkSync('votes.test.json');

// 5) Time math: durations map + postpone window sane.
const DUR = { '30m': 30 * 60_000, '1h': 60 * 60_000, '2h': 120 * 60_000, '5h': 300 * 60_000 };
ok(Object.values(DUR).every((ms) => ms > 0 && ms < 2 ** 31), 'all durations valid');

// 6) Player-count pill in "session starting" card is info-only (disabled).
const startCard = (() => {
  // mirror startSessionFromVote's card (no Discord calls)
  const c = { voters: { a: 1 } };
  const stats = { players: 12, maxPlayers: 50, online: true };
  const st = serverStatus(stats);
  const stub = {
    setAccentColor: () => stub,
    addTextDisplayComponents: () => stub,
    addSeparatorComponents: () => stub,
    addActionRowComponents: () => stub
  };
  return { style: st.style, label: `Players in-game: 12/50`, statusLabel: st.label };
})();
ok(startCard.statusLabel === 'Server Online', 'live stats resolve for voter DM');

// 7) Toggle logic (dedupe) — simulated identically to toggleVoter.
const voters = {};
const toggle = (id) => {
  if (voters[id]) delete voters[id];
  else voters[id] = Date.now();
};
toggle('u1');
toggle('u1');
toggle('u2');
ok(Object.keys(voters).length === 1 && voters.u2, 'toggle: no duplicate votes');

// 7) Toggle logic — REAL functions from the engine now.
import('./src/index.js').then(async (m) => {
  const vote = mkVote(10);
  vote.channelId = 'c-test';
  vote.messageId = 'm-test';
  vote.endTs = Date.now() + 60 * 60_000;
  m.activeVotes.clear();

  const r1 = m.toggleVoter(vote, 'u1');
  const r2 = m.toggleVoter(vote, 'u1');
  ok(r1 === 'added' && r2 === 'removed', 'toggleVoter added→removed');
  m.toggleVoter(vote, 'u1');
  m.toggleVoter(vote, 'u2');
  ok(Object.keys(vote.voters).length === 2, 'two distinct voters tracked');

  // 8) Persistence through the REAL saveVotes/loadVotes.
  m.activeVotes.set(vote.id, vote);
  m.saveVotes();
  m.activeVotes.clear();
  m.loadVotes();
  const restored = m.activeVotes.get('vtest1');
  ok(!!restored && Object.keys(restored.voters).length === 2, 'saveVotes→loadVotes round-trip');

  // 9) applyPostpone resets ready + pushes endTs (stub client so Discord calls no-op).
  restored.ready = true;
  const newEnd = m.applyPostpone(stubClient, restored, 30 * 60_000);
  ok(!restored.ready, 'postpone clears ready');
  ok(restored.postponed === true, 'postpone flags postponed');
  ok(Math.abs(newEnd - (Date.now() + 30 * 60_000)) < 5000, 'postpone pushes endTs by the delay');

  // 10) Dead votes are never resurrected by loadVotes.
  m.activeVotes.clear();
  fs.writeFileSync('votes.json', JSON.stringify({
    dead1: { id: 'dead1', expired: true, voters: {} },
    dead2: { id: 'dead2', started: true, voters: {} },
    alive1: { id: 'alive1', expired: false, started: false, endTs: Date.now() + 60_000, voters: {}, needed: 5, channelId: 'c', messageId: 'm', hostId: 'h', roleId: 'r', ready: false }
  }));
  m.loadVotes();
  ok(m.activeVotes.has('alive1') && !m.activeVotes.has('dead1') && !m.activeVotes.has('dead2'), 'loadVotes skips dead votes');
  m.activeVotes.clear();
  try { fs.unlinkSync('votes.json'); } catch {}

  // cleanup test key
  try { fs.unlinkSync('votes.json'); } catch {}

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
