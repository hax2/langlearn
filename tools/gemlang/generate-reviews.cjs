/**
 * Generate review modules that recap the last 3 modules by mixing up sentences.
 * 
 * For every group of 3 numbered chapters (module-1..3, module-4..6, etc.),
 * we create a review module that picks ~5 sentences from each of the 3 modules
 * (15 total) and shuffles them together.
 * 
 * Usage: node generate-reviews.cjs
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'src', 'data', 'modules');
const MANIFEST_PATH = path.join(__dirname, 'src', 'data', 'modules-manifest.json');
const SENTENCES_PER_MODULE = 5; // pick 5 sentences from each of the 3 modules = 15 total

// Seeded random for reproducibility
function seededRandom(seed) {
  let h = seed;
  return function () {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0x100000000;
  };
}

// Fisher-Yates shuffle with seeded RNG
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick n evenly-spaced items from array (deterministic)
function pickSpread(arr, n, rng) {
  if (arr.length <= n) return [...arr];
  const shuffled = shuffle(arr, rng);
  return shuffled.slice(0, n);
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  // Find all numbered chapter modules (module-1 through module-24)
  // These are the core curriculum modules we want to create reviews for
  const chapterModules = manifest.filter(m =>
    /^module-\d+$/.test(m.id) && parseInt(m.id.replace('module-', ''), 10) <= 24
  );

  // Group into sets of 3
  const groups = [];
  for (let i = 0; i < chapterModules.length; i += 3) {
    const group = chapterModules.slice(i, i + 3);
    if (group.length === 3) {
      groups.push(group);
    }
  }

  console.log(`Found ${chapterModules.length} chapter modules, creating ${groups.length} review modules.\n`);

  const reviewManifestEntries = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const moduleNums = group.map(m => parseInt(m.id.replace('module-', ''), 10));
    const reviewId = `review-${moduleNums.join('-')}`;
    const reviewFile = `${reviewId}.json`;
    const seed = moduleNums.reduce((a, b) => a * 100 + b, 42);
    const rng = seededRandom(seed);

    console.log(`Creating ${reviewId}: reviewing chapters ${moduleNums.join(', ')}`);

    // Load each module and pick sentences
    const allPicked = [];
    const sourceModuleTitles = [];

    for (const mod of group) {
      const modulePath = path.join(MODULES_DIR, mod.file);
      const moduleData = JSON.parse(fs.readFileSync(modulePath, 'utf-8'));
      sourceModuleTitles.push(moduleData.title);

      const picked = pickSpread(moduleData.sentences, SENTENCES_PER_MODULE, rng);
      // Tag each sentence with its source for the review ID prefix
      const tagged = picked.map((s, idx) => ({
        ...s,
        id: `${reviewId}-from-m${parseInt(mod.id.replace('module-', ''), 10)}-s${idx + 1}`
      }));
      allPicked.push(...tagged);
    }

    // Shuffle all picked sentences together
    const shuffledSentences = shuffle(allPicked, rng);

    // Build the review module JSON
    const shortTitles = sourceModuleTitles.map(t => {
      // Extract just the topic part: "Chapter 3: Descriptions" -> "Descriptions"
      const match = t.match(/:\s*(.+)$/);
      return match ? match[1] : t;
    });

    const reviewModule = {
      id: reviewId,
      title: `🔄 Review: Chapters ${moduleNums.join(', ')}`,
      description: `Mixed practice from ${shortTitles.join(', ')}.`,
      level: group[0].level,
      type: 'review',
      reviewsModules: group.map(m => m.id),
      sentences: shuffledSentences,
      grammarExplanation: `Time to review! This module mixes sentences from the last 3 chapters you studied:\n\n• ${sourceModuleTitles.join('\n• ')}\n\nThe sentences are shuffled so you can't rely on context — you'll need to recall the vocabulary and grammar from each chapter on your own. Take your time and listen carefully!`
    };

    // Write review module file
    const outPath = path.join(MODULES_DIR, reviewFile);
    fs.writeFileSync(outPath, JSON.stringify(reviewModule, null, 2) + '\n');
    console.log(`  → Wrote ${reviewFile} (${shuffledSentences.length} sentences)`);

    // Store manifest entry
    reviewManifestEntries.push({
      entry: {
        id: reviewId,
        title: reviewModule.title,
        description: reviewModule.description,
        type: 'review',
        level: reviewModule.level,
        sentenceCount: shuffledSentences.length,
        file: reviewFile
      },
      // Insert after the last module in this group
      afterModuleId: group[group.length - 1].id
    });
  }

  // Now update the manifest — insert review entries after their respective groups
  // Work backwards so indices don't shift
  const newManifest = [...manifest];
  
  // First, remove any existing review entries
  for (let i = newManifest.length - 1; i >= 0; i--) {
    if (newManifest[i].id && newManifest[i].id.startsWith('review-')) {
      newManifest.splice(i, 1);
    }
  }

  // Insert new review entries after their target modules
  for (const { entry, afterModuleId } of reviewManifestEntries.reverse()) {
    const idx = newManifest.findIndex(m => m.id === afterModuleId);
    if (idx >= 0) {
      newManifest.splice(idx + 1, 0, entry);
      console.log(`  → Inserted ${entry.id} after ${afterModuleId} in manifest`);
    } else {
      console.warn(`  ⚠ Could not find ${afterModuleId} in manifest, appending ${entry.id}`);
      newManifest.push(entry);
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 2) + '\n');
  console.log(`\n✅ Updated manifest with ${reviewManifestEntries.length} review modules.`);
  console.log(`Total manifest entries: ${newManifest.length}`);
}

main();
