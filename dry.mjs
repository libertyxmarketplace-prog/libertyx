import { buildContainer, buildSessionPayload, buildSessionText } from './src/index.js';
const stats = {
  serverName: 'Alabama State Roleplay | VC - Only',
  ownerName: 'Rose',
  serverCode: 'ALABAM',
  joinUrl: 'https://policeroleplay.community/join/ALABAM',
  players: 0,
  maxPlayers: 50,
  queue: 0,
  staff: 0,
  online: false,
  lastUpdated: '5:00 PM'
};
console.log('--- TEXT ---');
console.log(buildSessionText(stats));
console.log('--- CONTAINER ---');
const c = buildContainer(stats).toJSON();
console.log('accent=' + c.accent_color + ' kids=' + c.components.map((k) => k.type).join(','));
for (const k of c.components) {
  if (k.type === 10) console.log('T10: ' + JSON.stringify(k.content).slice(0, 160));
  if (k.type === 14) console.log('SEP14 divider=' + k.divider);
  if (k.type === 1) console.log('ROW1: ' + k.components.map((b) => (b.disabled ? '[x]' : '[>]') + b.label + '#' + (b.custom_id || 'link')).join(' | '));
}
console.log('--- PAYLOAD ---');
const p = await buildSessionPayload();
console.log('flags=' + p.flags + ' top=' + p.components[0].type + ' n=' + p.components[0].components.length);
