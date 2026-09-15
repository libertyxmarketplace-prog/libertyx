import fs from 'node:fs';
const p = 'src/index.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/\r\n/g, '\n');
fs.writeFileSync(p, s);
console.log('normalized to LF, len=' + s.length);
