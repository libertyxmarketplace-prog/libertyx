import { SeparatorBuilder } from 'discord.js';
const s = new SeparatorBuilder().setDivider(true);
console.log(JSON.stringify(s.toJSON()));
const s2 = new SeparatorBuilder();
console.log(JSON.stringify(s2.toJSON()));
console.log('proto:', Object.getOwnPropertyNames(SeparatorBuilder.prototype).join(','));
