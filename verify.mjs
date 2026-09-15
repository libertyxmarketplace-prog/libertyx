import {
  buildContainer,
  buildSessionText,
  serverStatus
} from './src/index.js';

const base = {
  serverName: 'Alabama State Roleplay | VC - Only',
  ownerName: 'Rose',
  players: 0,
  maxPlayers: 50,
  queue: 0,
  staff: 0,
  online: false,
  updatedAt: 1757700000
};

console.log('text-ok:', buildSessionText(base).split('\n')[0]);
console.log('status0:', serverStatus(base).label);
console.log('status15:', serverStatus({ ...base, online: true, players: 15 }).label);
console.log('status35:', serverStatus({ ...base, online: true, players: 35 }).label);
console.log('status50:', serverStatus({ ...base, online: true, players: 50 }).label);
const c = buildContainer({ ...base, online: true, players: 15 }).toJSON();
console.log('container-kids:', c.components.length, 'accent:', c.accent_color);
process.exit(0);
