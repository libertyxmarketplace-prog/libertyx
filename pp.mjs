https://media.discordapp.net/attachments/1543836515656802504/1548521705939533824/image-removebg-preview_9.png?ex=6aa75cb8&is=6aa60b38&hm=2d442eec01099be7b0f251c26b31aad53e76b0c4e84d559fad3f4c6ace0a64bd&=&format=webp&quality=lossless&width=768&height=73const fs = await import('node:fs');
let s = fs.readFileSync('src/index.js', 'utf8');
const out = [];
out.push('CRLF count: ' + ((s.match(/\r\n/g) || []).length));
out.push('has divider-placeholder: ' + s.includes('divider-placeholder'));
fs.writeFileSync('patch-status.txt', out.join('\n'));
console.log(out.join(' | '));
