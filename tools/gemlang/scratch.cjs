const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'src', 'data', 'modules');
const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.json'));

let out = '';
for (const file of files) {
  const content = fs.readFileSync(path.join(modulesDir, file), 'utf-8');
  const mod = JSON.parse(content);
  out += `\n--- ${file} : ${mod.title} ---\n`;
  for (const sentence of mod.sentences || []) {
    out += `[${sentence.id}] ${sentence.spanish} | ${sentence.english}\n`;
  }
}
fs.writeFileSync('all_sentences.txt', out);
console.log('done');
