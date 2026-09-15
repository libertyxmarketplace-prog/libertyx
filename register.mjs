import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { sessionCommand } from './src/index.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const r = await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: [sessionCommand.toJSON()] }
);
console.log(
  'REGISTERED:',
  r.map((c) => c.name + '/' + (c.options || []).map((o) => o.name).join(',')).join(' | ')
);
process.exit(0);
