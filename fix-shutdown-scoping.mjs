import fs from 'node:fs';

const path = 'src/index.js';
let src = fs.readFileSync(path, 'utf8');

// This script moves the DM loop INTO the shutdown handler and fixes scoping.
// The shutdown handler currently uses `delivered` at its editReply but it was
// only declared in unreachable code after the panel handler, causing the
// "V.2 ERLC is thinking..." timeout.

const NEWLINE = '\n';

// --- Step 1: remove the unreachable DM block that sits AFTER the panel handler ---
// Anchor: the line right before the unreachable block starts.
const unReachStart = `${NEWLINE}${NEWLINE}        // DM everyone who voted - red "Session Closed" card.`;
const unReachEndMarker = `        return;\n      }\n\n`;

let idxStart = src.indexOf(unReachStart);
if (idxStart === -1) {
  console.error('Unreachable DM block start not found');
  process.exit(1);
}

// Find the end of the unreachable block: it's the `}` followed by two newlines
// that closes the panel handler's scope.
let idxEnd = src.indexOf(unReachEndMarker, idxStart);
if (idxEnd === -1) {
  console.error('Unreachable DM block end not found');
  process.exit(1);
}
idxEnd += unReachEndMarker.length;

src = src.slice(0, idxStart) + src.slice(idxEnd);

// --- Step 2: insert the DM loop INSIDE the shutdown handler, right before its editReply ---
// The shutdown handler's editReply at the end uses `delivered` - we insert the
// DM loop immediately before it. Note: we use `closedStats` here (the shutdown
// handler already fetched it at the top of the block).
const shutdownAnchor = `${NEWLINE}        await interaction.editReply({${NEWLINE}          content: \`🔒 Session closed - Session Closed card posted in <#`;

let anchorIdx = src.indexOf(shutdownAnchor);
if (anchorIdx === -1) {
  console.error('Shutdown editReply anchor not found');
  process.exit(1);
}

// Back up to the start of that line.
let lineStart = src.lastIndexOf(`${NEWLINE}        `, anchorIdx);
if (lineStart === -1) {
  console.error('Could not find start of shutdown editReply line');
  process.exit(1);
}

const dmBlock =
  `${NEWLINE}        // DM everyone who voted - red "Session Closed" card.\n` +
  `        let delivered = 0;\n` +
  `        for (const voterId of voterSet) {\n` +
  `          if (\n` +
  `            await dmUser(client, voterId, {\n` +
  `              components: [buildSessionClosedDM(closedStats).toJSON()],\n` +
  `              flags: MessageFlags.IsComponentsV2\n` +
  `            })\n` +
  `          ) {\n` +
  `            delivered += 1;\n` +
  `          }\n` +
  `        }\n\n`;

src = src.slice(0, lineStart) + dmBlock + src.slice(lineStart);

fs.writeFileSync(path, src, 'utf8');
console.log('Fixed: DM loop moved inside shutdown handler, stats -> closedStats.');
