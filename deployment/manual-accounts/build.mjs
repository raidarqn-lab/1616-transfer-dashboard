import fs from 'node:fs';
const files=['auth-handler.js','../../firebase-verifier.js','runtime.ts'];
fs.writeFileSync(new URL('index.bundled.ts',import.meta.url),files.map(path=>fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'')).join('\n'));
