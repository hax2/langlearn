const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'src', 'data', 'modules-manifest.json');
const modulesDir = path.join(__dirname, 'src', 'data', 'modules');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
let failures = 0;

for (const manifestModule of manifest) {
  const modulePath = path.join(modulesDir, manifestModule.file);

  if (!fs.existsSync(modulePath)) {
    console.error(`Missing module file: ${manifestModule.file}`);
    failures++;
    continue;
  }

  const moduleData = JSON.parse(fs.readFileSync(modulePath, 'utf-8'));
  let sentenceCount = Array.isArray(moduleData.sentences) ? moduleData.sentences.length : 0;
  if (moduleData.specialPractice === 'ser-estar-rules' && Array.isArray(moduleData.rules)) {
    sentenceCount = moduleData.rules.reduce((total, rule) => {
      const examples = Array.isArray(rule.examples) ? rule.examples.length : 0;
      const translations = Array.isArray(rule.translations) ? rule.translations.length : 0;
      return total + examples + translations;
    }, 0);
  }

  if (moduleData.id !== manifestModule.id) {
    console.error(
      `ID mismatch for ${manifestModule.file}: manifest has ${manifestModule.id}, file has ${moduleData.id}`
    );
    failures++;
  }

  if (sentenceCount !== manifestModule.sentenceCount) {
    console.error(
      `Count mismatch for ${manifestModule.id}: manifest has ${manifestModule.sentenceCount}, file has ${sentenceCount}`
    );
    failures++;
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log('Module data ok');
