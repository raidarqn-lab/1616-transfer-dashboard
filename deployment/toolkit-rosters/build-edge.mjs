import fs from 'node:fs';
const files=['bounty-errors.js','roster-refresh.js','toolkit-contact-lookup.js','dated-toolkit-rosters.js','index.ts'];
const bundle=files.map(name=>fs.readFileSync(new URL(name,import.meta.url),'utf8').replace(/^import .*;\n/gm,'')).join('\n');
fs.writeFileSync(new URL('index.bundled.ts',import.meta.url),bundle);
