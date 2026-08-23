import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Tutorial from './Tutorial';
import { hasSeenTutorial, markTutorialSeen } from '../utils/tutorialStorage';
import './LessonPlayer.css';

/* helpers */
const cleanWord = (w) => w.replace(/[.,¿?¡!]/g, '');

/** Collect every unique word->meaning pair from all sentences in a module,
 *  and merge in any mnemonic / explanation from the module-level vocabulary. */
const buildVocabTable = (sentences, vocabulary = {}) => {
  const map = new Map();
  sentences.forEach((s) => {
    const meanings = s.wordMeanings || {};
    Object.entries(meanings).forEach(([word, meaning]) => {
      const key = word.toLowerCase();
      if (!map.has(key)) {
        const vocabEntry = vocabulary[key] || {};
        map.set(key, {
          word,
          meaning,
          mnemonic: vocabEntry.mnemonic || null,
          explanation: vocabEntry.explanation || null,
        });
      }
    });
  });
  return Array.from(map.values());
};

/** Deterministic pseudo-random from a seed string */
const seededRandom = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h);
};

/**
 * Build a merged list of regular sentence items + translation-challenge items.
 * A challenge is inserted after every `interval` sentences.
 * Each challenge picks one sentence from the preceding batch.
 */
const buildMergedItems = (sentences, moduleId, interval) => {
  const items = [];
  let sentenceCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    items.push({ type: 'sentence', data: sentences[i], originalIndex: i });
    sentenceCount++;

    if (interval > 0 && sentenceCount === interval && i < sentences.length - 1) {
      const batchStart = i - (interval - 1);
      let candidateIndexes = [];
      for (let idx = batchStart; idx < i; idx++) {
        candidateIndexes.push(idx);
      }

      if (candidateIndexes.length === 0 && i > 0) {
        candidateIndexes = Array.from({ length: i }, (_, idx) => idx);
      }

      if (candidateIndexes.length === 0) {
        sentenceCount = 0;
        continue;
      }

      const seed = `${moduleId}-challenge-${items.length}`;
      const pick = seededRandom(seed) % candidateIndexes.length;
      const chosenSentence = sentences[candidateIndexes[pick]];

      items.push({
        type: 'challenge',
        data: chosenSentence,
        batchStart,
        batchEnd: i,
      });
      sentenceCount = 0;
    }
  }
  return items;
};

/** Build challenge-only items for pure testing mode */
const buildTestingItems = (sentences) =>
  sentences.map((sentence, index) => ({
    type: 'challenge',
    data: sentence,
    batchStart: index,
    batchEnd: index,
  }));

const SER_ESTAR_RULE_ORDER = [
  'identity-definition',
  'location-position',
  'origin-material',
  'conditions',
  'characteristics',
  'emotions',
  'occupation-relationship',
  'progressive',
  'time-events',
  'mixed-review',
];

const SER_FORMS = new Set(['soy', 'eres', 'es', 'somos', 'son']);
const ESTAR_FORMS = new Set(['estoy', 'estás', 'está', 'estamos', 'están']);

const SER_ESTAR_WORD_MEANINGS = {
  a: 'to / at',
  abierta: 'open',
  abogado: 'lawyer',
  abogada: 'lawyer',
  abuelos: 'grandparents',
  al: 'to the / at the',
  alto: 'tall',
  altos: 'tall',
  Ahora: 'now',
  amable: 'kind',
  amiga: 'friend',
  amigo: 'friend',
  amigos: 'friends',
  Ana: 'Ana',
  animal: 'animal',
  anillos: 'rings',
  aprendiendo: 'learning',
  Argentina: 'Argentina',
  asustado: 'scared',
  aquí: 'here',
  banco: 'bank',
  boda: 'wedding',
  café: 'coffee',
  caliente: 'hot',
  cansados: 'tired',
  casa: 'house / home',
  capital: 'capital',
  cerca: 'near',
  centro: 'center',
  chaqueta: 'jacket',
  Chile: 'Chile',
  chocolate: 'chocolate',
  ciudad: 'city',
  clase: 'class',
  clases: 'classes',
  coche: 'car',
  comiendo: 'eating',
  concierto: 'concert',
  contentos: 'happy',
  contigo: 'with you',
  correcta: 'correct',
  cumpleaños: 'birthday',
  cuaderno: 'notebook',
  cuero: 'leather',
  curioso: 'curious',
  de: 'of / from',
  debajo: 'under',
  del: 'of the / from the',
  delante: 'in front',
  diccionarios: 'dictionaries',
  difíciles: 'difficult',
  diez: 'ten',
  director: 'director',
  doctora: 'doctor',
  domingo: 'Sunday',
  durmiendo: 'sleeping',
  el: 'the',
  El: 'the',
  Ella: 'she',
  Ellas: 'they',
  Ellos: 'they',
  emocionados: 'excited',
  en: 'in / at',
  enfermo: 'sick',
  enseñando: 'teaching',
  es: 'is',
  escuela: 'school',
  escuchando: 'listening',
  España: 'Spain',
  español: 'Spanish',
  está: 'is',
  estamos: 'are',
  están: 'are',
  estás: 'are',
  estoy: 'am',
  eres: 'are',
  estudiante: 'student',
  estudiantes: 'students',
  estudiando: 'studying',
  Este: 'this',
  este: 'this',
  Estos: 'these',
  estos: 'these',
  examen: 'exam',
  ejercicios: 'exercises',
  explicando: 'explaining',
  feliz: 'happy',
  felices: 'happy',
  fiesta: 'party',
  fría: 'cold',
  frías: 'cold',
  gato: 'cat',
  grande: 'big',
  gramática: 'grammar',
  hablando: 'speaking',
  habitación: 'room',
  hermano: 'brother',
  hermana: 'sister',
  hermanas: 'sisters',
  hoy: 'today',
  ingeniero: 'engineer',
  interesante: 'interesting',
  jardín: 'garden',
  jueves: 'Thursday',
  julio: 'July',
  jugando: 'playing',
  la: 'the',
  La: 'the',
  las: 'the',
  Las: 'the',
  leyendo: 'reading',
  libro: 'book',
  libros: 'books',
  lado: 'side',
  limpios: 'clean',
  lunes: 'Monday',
  Luis: 'Luis',
  llaves: 'keys',
  Los: 'the',
  madera: 'wood',
  Madrid: 'Madrid',
  madre: 'mother',
  mañana: 'tomorrow / morning',
  Marta: 'Marta',
  mesa: 'table',
  México: 'Mexico',
  mi: 'my',
  Mi: 'my',
  misma: 'same',
  mejor: 'best',
  manos: 'hands',
  míos: 'mine',
  mis: 'my',
  Mis: 'my',
  música: 'music',
  muy: 'very',
  entrevista: 'interview',
  nervioso: 'nervous',
  niño: 'boy',
  niños: 'children',
  noche: 'night',
  nosotros: 'we',
  Nosotros: 'we',
  nuestros: 'our',
  Nuestros: 'our',
  ocho: 'eight',
  oficina: 'office',
  orgullosa: 'proud',
  orgullosos: 'proud',
  oscura: 'dark',
  padres: 'parents',
  pacientes: 'patient',
  parque: 'park',
  padre: 'father',
  pastel: 'cake',
  persona: 'person',
  platos: 'plates',
  película: 'movie',
  plata: 'silver',
  por: 'by / in',
  preocupados: 'worried',
  pregunta: 'question',
  profesor: 'teacher',
  profesora: 'teacher',
  profesores: 'teachers',
  problema: 'problem',
  primo: 'cousin',
  puerta: 'door',
  perro: 'dog',
  Perú: 'Peru',
  resultado: 'result',
  regla: 'rule',
  reunión: 'meeting',
  rápido: 'fast',
  rojo: 'red',
  sala: 'room',
  salir: 'to leave',
  simpáticos: 'nice',
  son: 'are',
  somos: 'are',
  soy: 'am',
  su: 'his / her',
  sillas: 'chairs',
  sopa: 'soup',
  sucio: 'dirty',
  teléfono: 'phone',
  tienda: 'store',
  triste: 'sad',
  trabajando: 'working',
  tranquilo: 'calm',
  tres: 'three',
  tú: 'you',
  Tú: 'you',
  tuyo: 'yours',
  Ustedes: 'you all',
  útiles: 'useful',
  vaso: 'glass',
  vecinos: 'neighbors',
  viernes: 'Friday',
  vidrio: 'glass',
  un: 'a / an',
  Yo: 'I',
  zapatos: 'shoes',
};

const getSerEstarFamily = (example) => {
  const answer = example?.correct?.toLowerCase();
  if (SER_FORMS.has(answer)) return 'ser';
  if (ESTAR_FORMS.has(answer)) return 'estar';
  return null;
};

const getSerEstarExampleText = (example) =>
  `${example?.prompt || ''} ${example?.correct || ''} ${example?.continuation || ''}`
    .replace(/\s+/g, ' ')
    .trim();

const pickCycled = (items, index) => items.length ? items[index % items.length] : null;

const buildSerEstarItems = (module) => {
  if (module.specialPractice !== 'ser-estar-rules' || !Array.isArray(module.rules)) {
    return null;
  }

  const items = [];
  const orderedRules = [...module.rules].sort((a, b) => {
    const aIndex = SER_ESTAR_RULE_ORDER.indexOf(a.id);
    const bIndex = SER_ESTAR_RULE_ORDER.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const ruleFamilyCounts = new Map(
    orderedRules.map((rule) => [
      rule.id,
      new Set(rule.examples.map((example) => getSerEstarFamily(example)).filter(Boolean)).size,
    ])
  );

  const examplePool = orderedRules.flatMap((rule) =>
    rule.examples.map((example) => ({
      rule,
      example,
      family: getSerEstarFamily(example),
      isMixedRule: ruleFamilyCounts.get(rule.id) > 1,
    }))
  );

  orderedRules.forEach((rule, ruleIndex) => {
    const currentRuleExamples = rule.examples.map((example) => ({
      rule,
      example,
      family: getSerEstarFamily(example),
    }));

    const ruleFamilies = new Set(currentRuleExamples.map((entry) => entry.family).filter(Boolean));
    let mixedExamples;

    if (ruleFamilies.size > 1) {
      mixedExamples = currentRuleExamples.slice(0, 10);
    } else {
      const ruleFamily = currentRuleExamples[0]?.family;
      const oppositeExamples = examplePool.filter((entry) =>
        !entry.isMixedRule && entry.family && entry.family !== ruleFamily
      );
      const remainingRuleExamples = currentRuleExamples.slice(2);
      mixedExamples = [
        ...currentRuleExamples.slice(0, 2),
        ...Array.from({ length: 8 }, (_, offset) => {
          const useOpposite = offset % 2 === 0;
          if (useOpposite && oppositeExamples.length > 0) {
            return pickCycled(oppositeExamples, ruleIndex * 4 + offset);
          }
          return pickCycled(remainingRuleExamples.length ? remainingRuleExamples : currentRuleExamples, offset);
        }),
      ].filter(Boolean);
    }

    const seenChoiceTexts = new Set();
    mixedExamples = mixedExamples.filter(({ example }) => {
      const text = getSerEstarExampleText(example);
      if (!text || seenChoiceTexts.has(text)) return false;
      seenChoiceTexts.add(text);
      return true;
    });

    mixedExamples.forEach(({ rule: sourceRule, example }, exampleIndex) => {
      items.push({
        type: 'ser-estar-choice',
        id: `${rule.id}-choice-${exampleIndex + 1}`,
        rule: sourceRule,
        phaseRule: rule,
        data: example,
        exampleIndex,
        ruleIndex,
        baseIndex: items.length,
      });
    });
    rule.translations.forEach((translation, translationIndex) => {
      items.push({
        type: 'ser-estar-translation',
        id: `${rule.id}-translation-${translationIndex + 1}`,
        rule,
        data: translation,
        ruleIndex,
        baseIndex: items.length,
      });
    });
  });

  return items;
};

const mergeInsertedPracticeItems = (baseItems, insertedItems) => {
  if (!insertedItems.length) return baseItems;
  const byAfterIndex = new Map();
  insertedItems.forEach((inserted) => {
    const current = byAfterIndex.get(inserted.afterBaseIndex) || [];
    current.push(inserted.item);
    byAfterIndex.set(inserted.afterBaseIndex, current);
  });

  const merged = [];
  baseItems.forEach((item) => {
    merged.push(item);
    const inserts = byAfterIndex.get(item.baseIndex);
    if (inserts) merged.push(...inserts);
  });
  return merged;
};

let speakTimeoutId = null;
let currentAudio = null;
const audioCache = new Map();
const MAX_AUDIO_CACHE_SIZE = 40;

const resolvePublicAsset = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//.test(assetPath)) return assetPath;
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
};

const stopSpanishAudio = () => {
  if (speakTimeoutId) {
    clearTimeout(speakTimeoutId);
    speakTimeoutId = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  window.speechSynthesis.cancel();
};

const speakWithBrowserTts = (text, rate) => {
  speakTimeoutId = setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = rate;
    window.speechSynthesis.speak(u);
    speakTimeoutId = null;
  }, 0);
};

const pruneAudioCache = () => {
  while (audioCache.size > MAX_AUDIO_CACHE_SIZE) {
    const oldestSrc = audioCache.keys().next().value;
    const oldestAudio = audioCache.get(oldestSrc);
    if (oldestAudio === currentAudio) {
      audioCache.delete(oldestSrc);
      audioCache.set(oldestSrc, oldestAudio);
      continue;
    }
    audioCache.delete(oldestSrc);
  }
};

const preloadAudio = (audioSrc) => {
  if (!audioSrc) return null;

  const cachedAudio = audioCache.get(audioSrc);
  if (cachedAudio) {
    audioCache.delete(audioSrc);
    audioCache.set(audioSrc, cachedAudio);
    return cachedAudio;
  }

  const audio = new Audio(audioSrc);
  audio.preload = 'auto';
  audioCache.set(audioSrc, audio);
  pruneAudioCache();

  try {
    audio.load();
  } catch (err) {
    console.warn('Failed to preload audio:', err);
  }

  return audio;
};

/** Speak a Spanish word/phrase */
const PREFERRED_AUDIO_VOICE = 'es-ES-Chirp3-HD-Umbriel';

const pickAudioSrc = (audioEntry) => {
  if (Array.isArray(audioEntry)) {
    const choices = audioEntry.filter(Boolean);
    if (!choices.length) return null;
    const preferredChoice = choices.find((choice) => choice.includes(PREFERRED_AUDIO_VOICE));
    if (preferredChoice) return preferredChoice;
    return choices[Math.floor(Math.random() * choices.length)];
  }
  return audioEntry || null;
};

const shouldFallbackAfterAudioPlayError = (error) => {
  const name = error?.name || '';
  return name !== 'NotAllowedError' && name !== 'AbortError';
};

const speakSpanish = (text, rate = 0.85, audioSrc = null) => {
  if (!text) return;

  stopSpanishAudio();

  if (!audioSrc) {
    speakWithBrowserTts(text, rate);
    return;
  }

  const audio = preloadAudio(audioSrc);
  currentAudio = audio;

  try {
    audio.currentTime = 0;
  } catch (err) {
    console.warn('Failed to reset audio position:', err);
  }

  const targetRate = Math.min(Math.max(rate / 0.85, 0.75), 1.35);

  // Safely set the initial playback rate
  try {
    audio.defaultPlaybackRate = targetRate;
    audio.playbackRate = targetRate;
  } catch (err) {
    console.warn('Failed to set initial playback rate:', err);
  }

  // Defer/reset setting playback rate to metadata load and play events
  audio.onloadedmetadata = () => {
    try {
      audio.playbackRate = targetRate;
    } catch (err) {
      console.warn('Failed to set playback rate on loadedmetadata:', err);
    }
  };

  audio.onplay = () => {
    try {
      audio.playbackRate = targetRate;
    } catch (err) {
      console.warn('Failed to set playback rate on play:', err);
    }
  };

  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
  };

  let usedFallback = false;
  const fallbackOnce = () => {
    if (usedFallback) return;
    usedFallback = true;
    speakWithBrowserTts(text, rate);
  };

  audio.onerror = (e) => {
    console.error('Audio element error, falling back to TTS:', e);
    if (currentAudio === audio) currentAudio = null;
    fallbackOnce();
  };

  audio.play().catch((error) => {
    console.error('Audio play failed:', error);
    if (currentAudio === audio) currentAudio = null;
    if (shouldFallbackAfterAudioPlayError(error)) fallbackOnce();
  });
};

const KbdHint = ({ show, children }) => {
  if (!show) return null;
  return <kbd className="kbd-hint">{children}</kbd>;
};

const LessonProgress = ({ current, total, label = 'Sentence' }) => {
  const safeTotal = Math.max(total || 0, 1);
  const safeCurrent = Math.min(Math.max(current || 0, 0), safeTotal);
  const percentage = Math.round((safeCurrent / safeTotal) * 100);
  const pipCount = Math.min(safeTotal, 24);
  const pips = Array.from({ length: pipCount }, (_, index) => {
    const threshold = Math.ceil(((index + 1) / pipCount) * safeTotal);
    return {
      id: index,
      isFilled: safeCurrent >= threshold,
    };
  });

  return (
    <div
      className="lesson-progress"
      style={{ '--lesson-progress': `${percentage}%` }}
      role="progressbar"
      aria-label={`${label} ${safeCurrent} of ${safeTotal}`}
      aria-valuemin="0"
      aria-valuemax={safeTotal}
      aria-valuenow={safeCurrent}
    >
      <div className="lesson-progress-copy">
        <span className="lesson-progress-step">{label}</span>
        <span className="lesson-progress-count">{safeCurrent} / {safeTotal}</span>
      </div>
      <div className="lesson-progress-track" aria-hidden="true">
        <div className="lesson-progress-fill" />
        <div className="lesson-progress-marker" />
        <div className="lesson-progress-pips">
          {pips.map((pip) => (
            <span
              key={pip.id}
              className={`lesson-progress-pip ${pip.isFilled ? 'is-filled' : ''}`}
            />
          ))}
        </div>
      </div>
      <span className="lesson-progress-percent">{percentage}%</span>
    </div>
  );
};

const LessonPlayer = ({
  module,
  modules,
  moduleIndex,
  practiceMode,
  settings,
  onBack,
  backLabel = 'Dashboard',
  onNextModule,
  saveModuleProgress,
  completeModule,
  getSavedIndex,
}) => {
  const isPureTestingMode = practiceMode === 'testing';
  const isSerEstarSpecial = module.specialPractice === 'ser-estar-rules' && !isPureTestingMode;
  const challengeInterval = settings?.challengeInterval ?? 5;
  const swipeEnabled = settings?.swipeToNext ?? true;

  // Build merged items once for initial index calculation
  const initialMergedItems = useMemo(() => {
    if (isSerEstarSpecial) return buildSerEstarItems(module) || [];
    if (isPureTestingMode) return buildTestingItems(module.sentences);
    return buildMergedItems(module.sentences, module.id, challengeInterval);
  }, [module, isPureTestingMode, isSerEstarSpecial, challengeInterval]);

  // Convert sentence-level progress to merged-items index
  const savedSentenceCount = getSavedIndex ? getSavedIndex(module.id, practiceMode) : 0;
  const resumeIndex = useMemo(() => {
    if (savedSentenceCount <= 0) return 0;
    let sentencesSeen = 0;
    for (let i = 0; i < initialMergedItems.length; i++) {
      const item = initialMergedItems[i];
      if (isPureTestingMode ? item.type === 'challenge' : item.type === 'sentence') {
        sentencesSeen++;
      }
      if (sentencesSeen >= savedSentenceCount) {
        return Math.min(i + 1, initialMergedItems.length - 1);
      }
    }
    return 0;
  }, [savedSentenceCount, initialMergedItems, isPureTestingMode]);

  const [currentIndex, setCurrentIndex] = useState(resumeIndex);
  const [spanishRevealed, setSpanishRevealed] = useState(() => !!settings?.autoRevealSpanish);
  const [englishRevealed, setEnglishRevealed] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(null);
  const [challengeAnswerRevealed, setChallengeAnswerRevealed] = useState(false);
  const [extraItems, setExtraItems] = useState([]);
  const [insertedPracticeItems, setInsertedPracticeItems] = useState([]);
  const [choiceSelection, setChoiceSelection] = useState(null);
  const [answeredChoiceIds, setAnsweredChoiceIds] = useState(() => new Set());
  const [audioManifest, setAudioManifest] = useState({});
  const [audioManifestReady, setAudioManifestReady] = useState(false);
  const [wordAudioManifest, setWordAudioManifest] = useState({});
  const [isDesktop, setIsDesktop] = useState(false);
  const isStoryModule = !!module.type && module.type === 'story';
  const isReviewModule = !!module.type && module.type === 'review';
  const [showGrammarIntro, setShowGrammarIntro] = useState(
    () => !!((module.grammarExplanation || module.storyIntro) && practiceMode !== 'testing')
  );
  const [hasAssessed, setHasAssessed] = useState(false);
  const needsTutorial = !hasSeenTutorial();
  const [showTutorial, setShowTutorial] = useState(() => needsTutorial && !showGrammarIntro);
  const [showResumeToast, setShowResumeToast] = useState(() => resumeIndex > 0);

  // ── Swipe gesture state ──
  const swipeRef = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState(false); // 'left' | 'right' | 'down' | false
  const [slideInDir, setSlideInDir] = useState(null); // 'from-left' | 'from-right' | 'from-below' | null
  const swipeStartRef = useRef({ x: 0, y: 0, time: 0, swiping: false, swipeDir: null, scrollLocked: false });
  const suppressWordClickUntilRef = useRef(0);
  const selectedAudioSrcRef = useRef(new Map());
  const SWIPE_THRESHOLD = 60; // px to trigger navigation
  const SWIPE_DOWN_THRESHOLD = 80; // px to trigger mark-for-later
  const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms for fast flick

  // Dismiss resume toast after a moment
  useEffect(() => {
    if (showResumeToast) {
      const timer = setTimeout(() => setShowResumeToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showResumeToast]);

  // Clean up pending speech synthesis timeouts on unmount
  useEffect(() => {
    return () => {
      stopSpanishAudio();
    };
  }, []);

  const resetRevealState = useCallback(() => {
    setSpanishRevealed(!!settings?.autoRevealSpanish);
    setEnglishRevealed(false);
    setActiveWordIndex(null);
    setChallengeAnswerRevealed(false);
    setChoiceSelection(null);
  }, [settings?.autoRevealSpanish]);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.matchMedia('(min-width: 1024px)').matches);
    };

    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(resolvePublicAsset('audio/manifest.json'))
      .then((response) => (response.ok ? response.json() : {}))
      .then((manifest) => {
        if (!cancelled && manifest && typeof manifest === 'object') {
          setAudioManifest(manifest);
          setAudioManifestReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAudioManifest({});
          setAudioManifestReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(resolvePublicAsset('word-audio/manifest.json'))
      .then((response) => (response.ok ? response.json() : {}))
      .then((manifest) => {
        if (!cancelled && manifest && typeof manifest === 'object') {
          setWordAudioManifest(manifest);
        }
      })
      .catch(() => {
        if (!cancelled) setWordAudioManifest({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const mergedItems = useMemo(() => {
    if (isSerEstarSpecial) {
      return mergeInsertedPracticeItems(buildSerEstarItems(module) || [], insertedPracticeItems);
    }
    if (isPureTestingMode) {
      return buildTestingItems(module.sentences);
    }
    const base = buildMergedItems(module.sentences, module.id, challengeInterval);
    return [...base, ...extraItems];
  }, [module, insertedPracticeItems, extraItems, isPureTestingMode, isSerEstarSpecial, challengeInterval]);

  const currentItem = mergedItems[currentIndex];
  const currentOriginalIndex = currentItem?.originalIndex;
  const isChallenge = currentItem?.type === 'challenge';
  const isSerEstarChoice = currentItem?.type === 'ser-estar-choice';
  const isSerEstarTranslation = currentItem?.type === 'ser-estar-translation';
  const sentence = (isChallenge || isSerEstarChoice || isSerEstarTranslation) ? null : currentItem?.data;
  const isFinished = currentIndex >= mergedItems.length;
  const showSelfAssessment = isFinished && !hasAssessed;
  const hasNextModule = moduleIndex < modules.length - 1;
  const vocabulary = useMemo(() => module.vocabulary || {}, [module.vocabulary]);
  const vocabTable = useMemo(() => {
    if (!isFinished) return [];
    if (module.specialPractice === 'ser-estar-rules') {
      const serEstarSentences = [];
      if (Array.isArray(module.rules)) {
        module.rules.forEach(rule => {
          if (Array.isArray(rule.examples)) {
            rule.examples.forEach(ex => {
              const fullSpan = `${ex.prompt || ''} ${ex.correct || ''} ${ex.continuation || ''}`.trim();
              if (fullSpan) serEstarSentences.push(fullSpan);
            });
          }
          if (Array.isArray(rule.translations)) {
            rule.translations.forEach(tr => {
              if (tr.spanish) serEstarSentences.push(tr.spanish);
            });
          }
        });
      }

      const map = new Map();
      serEstarSentences.forEach(sentenceText => {
        sentenceText.split(/\s+/).forEach(rawWord => {
          const word = cleanWord(rawWord);
          if (!word) return;
          const key = word.toLowerCase();
          if (!map.has(key)) {
            const meaning = SER_ESTAR_WORD_MEANINGS[key] || SER_ESTAR_WORD_MEANINGS[word] || null;
            if (meaning) {
              const vocabEntry = vocabulary[key] || {};
              map.set(key, {
                word,
                meaning,
                mnemonic: vocabEntry.mnemonic || null,
                explanation: vocabEntry.explanation || null,
              });
            }
          }
        });
      });

      if (vocabulary) {
        Object.entries(vocabulary).forEach(([key, entry]) => {
          if (!map.has(key)) {
            const word = entry.word || key;
            const meaning = entry.meaning || SER_ESTAR_WORD_MEANINGS[key] || SER_ESTAR_WORD_MEANINGS[word] || (key === 'ser' ? 'to be (identity/origin/characteristic)' : key === 'estar' ? 'to be (location/state/action)' : '');
            map.set(key, {
              word,
              meaning,
              mnemonic: entry.mnemonic || null,
              explanation: entry.explanation || null,
            });
          }
        });
      }

      return Array.from(map.values());
    }

    return buildVocabTable(module.sentences, vocabulary);
  }, [isFinished, module, vocabulary]);

  const totalSentences = isSerEstarSpecial ? mergedItems.length : module.sentences.length;
  const progressItemsSoFar = isFinished
    ? totalSentences
    : mergedItems.slice(0, currentIndex + 1).filter((item) => {
      if (isSerEstarSpecial) return item.type === 'ser-estar-choice' || item.type === 'ser-estar-translation';
      if (isPureTestingMode) return item.type === 'challenge';
      return item.type === 'sentence';
    }).length;

  const speechRate = settings?.speechRate ?? 0.85;
  const autoPlay = settings?.autoPlayAudio ?? true;
  const getAudioSrc = useCallback((text) => {
    if (!text) return null;
    if (selectedAudioSrcRef.current.has(text)) {
      return selectedAudioSrcRef.current.get(text);
    }
    const entry = audioManifest[text];
    if (!entry) return null;
    const src = pickAudioSrc(entry);
    const resolvedSrc = src ? resolvePublicAsset(src) : null;
    selectedAudioSrcRef.current.set(text, resolvedSrc);
    return resolvedSrc;
  }, [audioManifest]);
  const getWordAudioSrc = useCallback((word) => {
    const clean = cleanWord(word);
    if (!clean) return null;
    const cacheKey = `word:${clean.toLowerCase()}`;
    if (selectedAudioSrcRef.current.has(cacheKey)) {
      return selectedAudioSrcRef.current.get(cacheKey);
    }
    const entry = wordAudioManifest[clean] || wordAudioManifest[clean.toLowerCase()];
    if (!entry) return null;
    const src = pickAudioSrc(entry);
    const resolvedSrc = src ? resolvePublicAsset(src) : null;
    selectedAudioSrcRef.current.set(cacheKey, resolvedSrc);
    return resolvedSrc;
  }, [wordAudioManifest]);
  const getSpanishTextForItem = useCallback((item, choice = null) => {
    if (!item) return null;
    if (item.type === 'ser-estar-choice') {
      const example = item.data;
      if (!example) return null;
      return choice ? `${example.correct} ${example.continuation}` : example.prompt;
    }
    if (item.type === 'ser-estar-translation' || item.type === 'challenge') {
      return item.data?.spanish || null;
    }
    return item.data?.spanish || null;
  }, []);
  const preloadSpanishText = useCallback((text) => {
    const src = getAudioSrc(text);
    if (src) preloadAudio(src);
  }, [getAudioSrc]);
  const playSpanish = useCallback((text) => {
    speakSpanish(text, speechRate, getAudioSrc(text));
  }, [getAudioSrc, speechRate]);
  const playSpanishWord = useCallback((word) => {
    const clean = cleanWord(word);
    speakSpanish(clean, speechRate, getWordAudioSrc(clean));
  }, [getWordAudioSrc, speechRate]);

  const shouldSuppressWordClick = useCallback(() => Date.now() < suppressWordClickUntilRef.current, []);

  useEffect(() => {
    if (!audioManifestReady) return;

    [
      getSpanishTextForItem(currentItem, choiceSelection),
      getSpanishTextForItem(mergedItems[currentIndex + 1]),
      getSpanishTextForItem(mergedItems[currentIndex + 2]),
    ].forEach((text) => {
      if (text) preloadSpanishText(text);
    });
  }, [audioManifestReady, choiceSelection, currentIndex, currentItem, getSpanishTextForItem, mergedItems, preloadSpanishText]);

  useEffect(() => {
    if (!audioManifestReady || swipeAnimating) return;
    if (autoPlay && !showGrammarIntro && isSerEstarChoice && currentItem?.data?.prompt && !choiceSelection) {
      playSpanish(currentItem.data.prompt);
      return;
    }
    if (autoPlay && !showGrammarIntro && !isChallenge && !isSerEstarTranslation && sentence?.spanish) {
      playSpanish(sentence.spanish);
    }
  }, [audioManifestReady, autoPlay, choiceSelection, currentItem, isChallenge, isSerEstarChoice, isSerEstarTranslation, playSpanish, sentence, showGrammarIntro, swipeAnimating]);

  const playAudio = useCallback(() => {
    if (isSerEstarChoice) {
      const example = currentItem?.data;
      if (!example) return;
      playSpanish(choiceSelection ? `${example.correct} ${example.continuation}` : example.prompt);
      return;
    }
    if (isSerEstarTranslation) {
      if (currentItem?.data?.spanish) playSpanish(currentItem.data.spanish);
      return;
    }
    if (isChallenge) {
      if (currentItem?.data?.spanish) playSpanish(currentItem.data.spanish);
      return;
    }
    if (sentence?.spanish) playSpanish(sentence.spanish);
  }, [choiceSelection, currentItem, isChallenge, isSerEstarChoice, isSerEstarTranslation, playSpanish, sentence]);

  const handleNext = useCallback((swipeDir) => {
    stopSpanishAudio();
    resetRevealState();
    const newIndex = currentIndex + 1;
    if (swipeDir) {
      setSwipeAnimating('left');
      setTimeout(() => {
        setCurrentIndex(newIndex);
        setSwipeAnimating(false);
        setSwipeOffset(0);
        setSlideInDir('from-right');
        setTimeout(() => setSlideInDir(null), 350);
      }, 200);
    } else {
      setCurrentIndex(newIndex);
    }

    // Save progress
    if (saveModuleProgress) {
      // Calculate the sentence-level progress for the new index
      const sentenceProgress = mergedItems.slice(0, newIndex).filter((item) => {
        if (isSerEstarSpecial) return item.type === 'ser-estar-choice' || item.type === 'ser-estar-translation';
        if (isPureTestingMode) return item.type === 'challenge';
        return item.type === 'sentence';
      }).length;
      saveModuleProgress(module.id, sentenceProgress, practiceMode, totalSentences);
    }
  }, [currentIndex, isPureTestingMode, isSerEstarSpecial, mergedItems, module.id, practiceMode, resetRevealState, saveModuleProgress, totalSentences]);

  const handlePrev = useCallback((swipeDir) => {
    if (currentIndex === 0) return;
    stopSpanishAudio();
    resetRevealState();
    if (swipeDir) {
      setSwipeAnimating('right');
      setTimeout(() => {
        setCurrentIndex((p) => Math.max(0, p - 1));
        setSwipeAnimating(false);
        setSwipeOffset(0);
        setSlideInDir('from-left');
        setTimeout(() => setSlideInDir(null), 350);
      }, 200);
    } else {
      setCurrentIndex((p) => Math.max(0, p - 1));
    }
  }, [currentIndex, resetRevealState]);

  const handleMarkForLater = useCallback(() => {
    if (!sentence) return;
    setExtraItems((prev) => [
      ...prev,
      { type: 'sentence', data: sentence, originalIndex: currentOriginalIndex, isRepeat: true },
    ]);
  }, [currentOriginalIndex, sentence]);

  const handleSerEstarChoice = useCallback((option) => {
    if (!isSerEstarChoice || !currentItem?.data) return;
    const isCorrect = option === currentItem.data.correct;
    setChoiceSelection({ option, isCorrect });
    playSpanish(`${currentItem.data.correct} ${currentItem.data.continuation}`);

    setAnsweredChoiceIds((prev) => {
      const next = new Set(prev);
      next.add(currentItem.id);
      return next;
    });

    if (!isCorrect && !currentItem.isRepeat && !answeredChoiceIds.has(currentItem.id)) {
      setInsertedPracticeItems((prev) => [
        ...prev,
        {
          afterBaseIndex: Math.min(currentItem.baseIndex + 2, mergedItems.length - 1),
          item: {
            ...currentItem,
            id: `${currentItem.id}-retry`,
            isRepeat: true,
          },
        },
      ]);
    }
  }, [answeredChoiceIds, currentItem, isSerEstarChoice, mergedItems.length, playSpanish]);

  const handleDismissIntro = useCallback(() => {
    setShowGrammarIntro(false);
    if (needsTutorial && !hasSeenTutorial()) {
      setShowTutorial(true);
    }
  }, [needsTutorial]);

  const handleSelfAssessment = useCallback((confidence) => {
    if (completeModule) {
      completeModule(module.id, confidence, totalSentences);
    }
    setHasAssessed(true);
  }, [completeModule, module.id, totalSentences]);

  useEffect(() => {
    const handleGlobalClick = () => setActiveWordIndex(null);
    if (activeWordIndex !== null) {
      window.addEventListener('click', handleGlobalClick);
    }
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeWordIndex]);

  // ── Swipe touch handlers ──
  const canSwipe = swipeEnabled && !isDesktop && !showGrammarIntro && !showTutorial && !isFinished;
  const canNavigateBySwipe = canSwipe && (!isSerEstarChoice || !!choiceSelection);

  const onTouchStart = useCallback((e) => {
    if (!canNavigateBySwipe) return;
    const touch = e.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      swiping: false,
      swipeDir: null, // 'horizontal' | 'down' | null
      scrollLocked: false,
    };
    setSwipeOffset(0);
    setSwipeOffsetY(0);
  }, [canNavigateBySwipe]);

  const onTouchMove = useCallback((e) => {
    if (!canNavigateBySwipe) return;
    const s = swipeStartRef.current;
    const touch = e.touches[0];
    const dx = touch.clientX - s.x;
    const dy = touch.clientY - s.y;

    // Determine direction lock on first significant movement
    if (!s.scrollLocked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.scrollLocked = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        s.swiping = true;
        suppressWordClickUntilRef.current = Date.now() + 1200;
        s.swipeDir = 'horizontal';
      } else if (dy > 0 && !isChallenge) {
        // Swipe down (only on sentence cards, not challenges)
        s.swiping = true;
        suppressWordClickUntilRef.current = Date.now() + 1200;
        s.swipeDir = 'down';
      } else {
        // Vertical scroll up – bail out
        s.swiping = false;
        return;
      }
    }

    if (!s.swiping) return;
    e.preventDefault();

    if (s.swipeDir === 'horizontal') {
      let offset = dx;
      if ((currentIndex === 0 && dx > 0) || (currentIndex >= mergedItems.length - 1 && dx < 0)) {
        offset = dx * 0.25;
      }
      setSwipeOffset(offset);
    } else if (s.swipeDir === 'down') {
      // Only allow downward — clamp to >= 0
      setSwipeOffsetY(Math.max(0, dy));
    }
  }, [canNavigateBySwipe, currentIndex, mergedItems.length, isChallenge]);

  const onTouchEnd = useCallback(() => {
    if (!canNavigateBySwipe) return;
    const s = swipeStartRef.current;
    if (!s.swiping) {
      setSwipeOffset(0);
      setSwipeOffsetY(0);
      return;
    }

    suppressWordClickUntilRef.current = Date.now() + 1200;
    const elapsed = Date.now() - s.time;

    if (s.swipeDir === 'down') {
      // Swipe down → mark for later
      if (swipeOffsetY > SWIPE_DOWN_THRESHOLD && sentence) {
        suppressWordClickUntilRef.current = Date.now() + 1200;
        handleMarkForLater();
        setSwipeAnimating('down');
        setTimeout(() => {
          handleNext('swipe-silent');
          setSwipeAnimating(false);
          setSwipeOffsetY(0);
          setSlideInDir('from-below');
          setTimeout(() => setSlideInDir(null), 350);
        }, 250);
      } else {
        setSwipeOffsetY(0);
      }
      s.swiping = false;
      return;
    }

    // Horizontal swipe
    const velocity = Math.abs(swipeOffset) / elapsed;
    const isFlick = velocity > SWIPE_VELOCITY_THRESHOLD;

    if (swipeOffset < -SWIPE_THRESHOLD || (swipeOffset < -20 && isFlick)) {
      // Swipe left → next
      suppressWordClickUntilRef.current = Date.now() + 1200;
      handleNext('swipe');
    } else if (swipeOffset > SWIPE_THRESHOLD || (swipeOffset > 20 && isFlick)) {
      // Swipe right → prev
      if (currentIndex > 0) {
        suppressWordClickUntilRef.current = Date.now() + 1200;
        handlePrev('swipe');
      } else {
        setSwipeOffset(0);
      }
    } else {
      setSwipeOffset(0);
    }

    s.swiping = false;
  }, [canNavigateBySwipe, swipeOffset, swipeOffsetY, sentence, handleNext, handlePrev, handleMarkForLater, currentIndex]);

  const swipeStyle = useMemo(() => {
    if (swipeAnimating === 'left') {
      return {
        transform: 'translateX(-120%) rotate(-6deg)',
        opacity: 0,
        transition: 'transform 200ms ease-in, opacity 150ms ease-in',
      };
    }
    if (swipeAnimating === 'right') {
      return {
        transform: 'translateX(120%) rotate(6deg)',
        opacity: 0,
        transition: 'transform 200ms ease-in, opacity 150ms ease-in',
      };
    }
    if (swipeAnimating === 'down') {
      return {
        transform: 'translateY(120%) scale(0.85)',
        opacity: 0,
        transition: 'transform 250ms ease-in, opacity 200ms ease-in',
      };
    }
    if (slideInDir === 'from-right') {
      return {
        animation: 'swipe-slide-in-right 350ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      };
    }
    if (slideInDir === 'from-left') {
      return {
        animation: 'swipe-slide-in-left 350ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      };
    }
    if (slideInDir === 'from-below') {
      return {
        animation: 'swipe-slide-in-below 350ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      };
    }
    // Vertical swipe-down drag
    if (swipeOffsetY > 0) {
      const scale = 1 - Math.min(swipeOffsetY / 600, 0.1);
      const opacity = 1 - Math.min(swipeOffsetY / 300, 0.5);
      return {
        transform: `translateY(${swipeOffsetY}px) scale(${scale})`,
        opacity,
        transition: 'none',
        willChange: 'transform, opacity',
      };
    }
    // Horizontal drag
    if (swipeOffset === 0) {
      return {
        transform: 'translateX(0) rotate(0)',
        opacity: 1,
        transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
      };
    }
    const rotation = (swipeOffset / 300) * 4;
    const opacity = 1 - Math.min(Math.abs(swipeOffset) / 400, 0.4);
    return {
      transform: `translateX(${swipeOffset}px) rotate(${rotation}deg)`,
      opacity,
      transition: 'none',
      willChange: 'transform, opacity',
    };
  }, [swipeOffset, swipeOffsetY, swipeAnimating, slideInDir]);

  const swipeTouchProps = canSwipe ? {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onClickCapture: (e) => {
      if (shouldSuppressWordClick()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    ref: swipeRef,
  } : {};

  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      const key = event.key.toLowerCase();

      if (key === 'escape') {
        if (showTutorial) { setShowTutorial(false); markTutorialSeen(); return; }
        onBack();
        return;
      }

      if (showTutorial) return;

      if (key === '?') {
        setShowTutorial(true);
        return;
      }

      if (showGrammarIntro) {
        if (key === 'enter' || key === ' ' || key === 'arrowright') {
          event.preventDefault();
          handleDismissIntro();
        }
        return;
      }

      if (isFinished) {
        if (showSelfAssessment) {
          if (key === '1') handleSelfAssessment('confident');
          if (key === '2') handleSelfAssessment('somewhat');
          if (key === '3') handleSelfAssessment('needsRefresh');
          return;
        }
        if (key === 'enter' && hasNextModule) onNextModule();
        if (key === 'b') onBack();
        return;
      }

      if (isSerEstarChoice) {
        const options = currentItem?.data?.options || [];
        if ((key === '1' || key === '2') && options[Number(key) - 1]) {
          handleSerEstarChoice(options[Number(key) - 1]);
        }
        if (key === ' ' || key === 's') {
          event.preventDefault();
          playAudio();
        }
        if ((key === 'enter' || key === 'arrowright') && choiceSelection) handleNext();
        if (key === 'arrowleft') handlePrev();
        return;
      }

      if (isSerEstarTranslation) {
        if (key === ' ' || key === 's') {
          event.preventDefault();
          if (!challengeAnswerRevealed) {
            setChallengeAnswerRevealed(true);
          }
          playAudio();
        }
        if (key === 'enter' || key === 'arrowright') handleNext();
        if (key === 'arrowleft') handlePrev();
        return;
      }

      if (isChallenge) {
        if (key === ' ' || key === 's') {
          event.preventDefault();
          if (!challengeAnswerRevealed) {
            setChallengeAnswerRevealed(true);
          }
          playAudio();
        }
        if (key === 'enter' || key === 'arrowright') handleNext();
        if (key === 'arrowleft') handlePrev();
        return;
      }

      if (key === ' ') {
        event.preventDefault();
        playAudio();
      }
      if (key === 's') setSpanishRevealed(true);
      if (key === 'e' || key === 't') setEnglishRevealed(true);
      if (key === 'm' || key === 'l') handleMarkForLater();
      if (key === 'enter' || key === 'arrowright') handleNext();
      if (key === 'arrowleft') handlePrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    challengeAnswerRevealed,
    choiceSelection,
    currentItem,
    handleMarkForLater,
    handleDismissIntro,
    handleNext,
    handlePrev,
    handleSelfAssessment,
    handleSerEstarChoice,
    hasNextModule,
    isChallenge,
    isSerEstarChoice,
    isSerEstarTranslation,
    isFinished,
    onBack,
    onNextModule,
    playAudio,
    showGrammarIntro,
    showSelfAssessment,
    showTutorial,
  ]);

  // Clamp tooltip so it doesn't overflow viewport edges
  const clampTooltip = useCallback((el) => {
    if (!el) return;
    // Reset any previous adjustment
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.right = 'auto';

    const rect = el.getBoundingClientRect();
    const margin = 8;

    if (rect.left < margin) {
      // Overflowing left
      const shift = margin - rect.left;
      el.style.left = `calc(50% + ${shift}px)`;
    } else if (rect.right > window.innerWidth - margin) {
      // Overflowing right
      const shift = rect.right - (window.innerWidth - margin);
      el.style.left = `calc(50% - ${shift}px)`;
    }
  }, []);

  const getMeaningFromMap = (word, meanings = {}) => {
    const cw = cleanWord(word);
    return meanings[cw] ?? meanings[cw.toLowerCase()] ?? meanings[cw.replace(/s$/, '')] ?? null;
  };

  const getMeaning = (word) => getMeaningFromMap(word, sentence?.wordMeanings || {});

  const getSerEstarMeaning = (word) => {
    const cw = cleanWord(word);
    return SER_ESTAR_WORD_MEANINGS[cw] ?? SER_ESTAR_WORD_MEANINGS[cw.toLowerCase()] ?? null;
  };

  const getVocabExtra = (word) => {
    const cw = cleanWord(word).toLowerCase();
    return vocabulary[cw] || null;
  };

  const renderClickableWords = (text, meaningGetter, keyPrefix, extraClassName = '') => {
    if (!text) return null;
    return text.split(' ').map((word, idx) => {
      const key = `${keyPrefix}-${idx}`;
      const meaning = meaningGetter(word);
      const isActive = activeWordIndex === key;
      return (
        <div key={key} className="word-container">
          <span
            className={`spanish-word ${extraClassName} ${meaning ? 'has-meaning' : ''} ${isActive ? 'active' : ''}`}
            onClick={(e) => {
              if (shouldSuppressWordClick()) {
                e.stopPropagation();
                return;
              }
              if (meaning) {
                e.stopPropagation();
                setActiveWordIndex(isActive ? null : key);
                playSpanishWord(word);
              }
            }}
          >
            {word}
          </span>
          {isActive && meaning && (
            <div
              className="word-tooltip animate-fade-in"
              ref={clampTooltip}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="tooltip-meaning">{meaning}</span>
            </div>
          )}
        </div>
      );
    });
  };

  if (showGrammarIntro) {
    const introText = module.storyIntro || module.grammarExplanation;
    return (
      <div className="lesson-player animate-fade-in">
        <div className="lesson-header">
          <button className="btn-secondary btn-sm" onClick={onBack}>
            ← Back <KbdHint show={isDesktop}>Esc</KbdHint>
          </button>
          <LessonProgress current={0} total={totalSentences} label="Ready" />
        </div>

        <div className={`lesson-content glass-panel grammar-intro-panel ${isStoryModule ? 'story-intro-panel' : ''} ${isReviewModule ? 'review-intro-panel' : ''}`}>
          <div className={`grammar-intro-badge ${isStoryModule ? 'story-intro-badge' : ''} ${isReviewModule ? 'review-intro-badge' : ''}`}>
            <span className="grammar-intro-icon">{isReviewModule ? '🔄' : isStoryModule ? '📖' : '📖'}</span>
            <span>{isReviewModule ? 'Review' : isStoryModule ? 'Story Time' : 'Grammar'}</span>
          </div>
          <h2 className="grammar-intro-title">{module.title}</h2>
          <div className="grammar-intro-body">
            {introText.split('\n').map((line, i) => {
              if (line.trim() === '') return <br key={i} />;
              if (line.startsWith('•')) {
                return <p key={i} className="grammar-bullet">{line}</p>;
              }
              return <p key={i}>{line}</p>;
            })}
          </div>
        </div>

        <div className="lesson-nav-bar">
          <div />
          <button
            className="btn-primary btn-nav-next pulse-primary"
            onClick={handleDismissIntro}
          >
            {isReviewModule ? 'Begin Review →' : isStoryModule ? 'Begin Story →' : 'Begin Lesson →'} <KbdHint show={isDesktop}>Enter</KbdHint>
          </button>
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="lesson-finished animate-fade-in glass-panel">
        {/* Resume toast (shouldn't show here but just in case) */}

        <div className="finished-icon">🎉</div>
        <h2 className="finished-title">Module Completed!</h2>
        <p className="finished-subtitle">
          {isPureTestingMode
            ? <>You&apos;ve completed all translation prompts in <strong>{module.title}</strong>.</>
            : <>You&apos;ve successfully finished all sentences in <strong>{module.title}</strong>.</>}
        </p>

        {/* Self-Assessment Prompt */}
        {showSelfAssessment && (
          <div className="self-assessment animate-fade-in">
            <h3 className="assessment-title">How did that feel?</h3>
            <p className="assessment-subtitle">Be honest — this helps us suggest what to review later.</p>
            <div className="assessment-options">
              <button
                className="assessment-btn assessment-confident"
                onClick={() => handleSelfAssessment('confident')}
              >
                <span className="assessment-emoji">😎</span>
                <span className="assessment-label">Nailed it</span>
                <KbdHint show={isDesktop}>1</KbdHint>
              </button>
              <button
                className="assessment-btn assessment-somewhat"
                onClick={() => handleSelfAssessment('somewhat')}
              >
                <span className="assessment-emoji">🤔</span>
                <span className="assessment-label">Getting there</span>
                <KbdHint show={isDesktop}>2</KbdHint>
              </button>
              <button
                className="assessment-btn assessment-needs-refresh"
                onClick={() => handleSelfAssessment('needsRefresh')}
              >
                <span className="assessment-emoji">😬</span>
                <span className="assessment-label">Need more practice</span>
                <KbdHint show={isDesktop}>3</KbdHint>
              </button>
            </div>
          </div>
        )}

        {!isPureTestingMode && !showSelfAssessment && (
          <div className="vocab-section">
            <h3 className="vocab-heading">Words You&apos;ve Learned</h3>
            <div className="vocab-table-wrapper">
              <table className="vocab-table">
                <thead>
                  <tr>
                    <th>Spanish</th>
                    <th>Meaning</th>
                    <th>Memory Aid</th>
                  </tr>
                </thead>
                <tbody>
                  {vocabTable.map(({ word, meaning, mnemonic, explanation }) => (
                    <tr key={word}>
                      <td
                        className="vocab-word"
                        onClick={() => playSpanishWord(word)}
                        title={`Play "${word}"`}
                      >
                        {word}
                      </td>
                      <td className="vocab-meaning">{meaning}</td>
                      <td className="vocab-mnemonic">
                        {mnemonic && <span className="mnemonic-text">💡 {mnemonic}</span>}
                        {explanation && <span className="explanation-text">{explanation}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!showSelfAssessment && (
          <div className="finished-actions">
            <button className="btn-secondary" onClick={onBack}>
              ← {backLabel} <KbdHint show={isDesktop}>B</KbdHint>
            </button>
            {hasNextModule && (
              <button className="btn-primary" onClick={onNextModule}>
                Next Module → <KbdHint show={isDesktop}>Enter</KbdHint>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isSerEstarChoice) {
    const example = currentItem.data;
    const selectedOption = choiceSelection?.option;
    const hasAnswered = !!choiceSelection;
    const showRuleHint = !currentItem.isRepeat && currentItem.exampleIndex < 2;
    return (
      <div className={`lesson-player ser-estar-choice-player ${showRuleHint ? 'has-rule-hint' : 'is-compact'} animate-fade-in`}>
        <div className="lesson-header">
          <button className="btn-secondary btn-sm" onClick={onBack}>
            ← Back <KbdHint show={isDesktop}>Esc</KbdHint>
          </button>
          <LessonProgress current={progressItemsSoFar} total={totalSentences} label="Rule Practice" />
        </div>

        <div className="lesson-content glass-panel ser-estar-panel" style={swipeStyle} {...swipeTouchProps}>
          {showRuleHint && (
            <>
              <div className="ser-estar-rule-badge">
                <span>Rule {currentItem.ruleIndex + 1}</span>
              </div>
              <div className="ser-estar-rule">
                <h3>{currentItem.phaseRule.name}</h3>
                <p>{currentItem.phaseRule.explanation}</p>
              </div>
            </>
          )}

          <button className="btn-play ser-estar-audio" onClick={playAudio} title="Listen">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <KbdHint show={isDesktop}>Space</KbdHint>
          </button>

          <div className="ser-estar-sentence" aria-live="polite">
            {renderClickableWords(example.prompt, getSerEstarMeaning, `${currentItem.id}-prompt`)}
            <div className={`ser-estar-blank ${hasAnswered ? 'filled' : ''}`}>
              {hasAnswered
                ? renderClickableWords(example.correct, getSerEstarMeaning, `${currentItem.id}-answer`, 'ser-estar-answer-word')
                : '_____'}
            </div>
            {renderClickableWords(example.continuation, getSerEstarMeaning, `${currentItem.id}-continuation`)}
          </div>

          <div className="ser-estar-options">
            {example.options.map((option, index) => (
              <button
                key={option}
                className={`ser-estar-option ${selectedOption === option ? (choiceSelection.isCorrect ? 'correct' : 'incorrect') : ''}`}
                onClick={() => handleSerEstarChoice(option)}
                disabled={hasAnswered}
              >
                <span>{option}</span>
                <KbdHint show={isDesktop}>{index + 1}</KbdHint>
              </button>
            ))}
          </div>

          <div className={`ser-estar-feedback-slot ${hasAnswered ? 'is-visible' : ''}`}>
            <div className={`ser-estar-feedback ${choiceSelection?.isCorrect ? 'correct' : 'incorrect'} ${hasAnswered ? 'animate-fade-in' : ''}`}>
              {hasAnswered && (
                <>
                  <strong>{choiceSelection.isCorrect ? 'Correct.' : 'Not this time.'}</strong>
                  <span>{example.reason}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {canSwipe && (
          <div className={`swipe-hint ${hasAnswered ? '' : 'is-disabled'}`} aria-hidden="true">
            {hasAnswered ? '← swipe →' : 'choose an answer'}
          </div>
        )}

        <div className={`lesson-nav-bar ${canSwipe ? 'swipe-mode' : ''}`}>
          <button className="btn-secondary btn-nav-secondary" onClick={handlePrev} disabled={currentIndex === 0}>
            ← Previous <KbdHint show={isDesktop}>←</KbdHint>
          </button>
          <button className="btn-primary btn-nav-next" onClick={handleNext} disabled={!hasAnswered}>
            Continue → <KbdHint show={isDesktop}>Enter</KbdHint>
          </button>
        </div>
      </div>
    );
  }

  if (isSerEstarTranslation) {
    const translation = currentItem.data;
    return (
      <div className="lesson-player animate-fade-in">
        <div className="lesson-header">
          <button className="btn-secondary btn-sm" onClick={onBack}>
            ← Back <KbdHint show={isDesktop}>Esc</KbdHint>
          </button>
          <LessonProgress current={progressItemsSoFar} total={totalSentences} label="Translation" />
        </div>

        <div className="lesson-content glass-panel challenge-panel ser-estar-panel" style={swipeStyle} {...swipeTouchProps}>
          <div className="challenge-badge">
            <span className="challenge-icon">🗣️</span>
            <span>{currentItem.rule.name}</span>
          </div>

          <div className="challenge-prompt">
            <p className="challenge-instruction">Translate this mixed-up practice sentence into Spanish:</p>
            <p className="challenge-english">{translation.english}</p>
          </div>

          <div className="challenge-answer-area">
            {!challengeAnswerRevealed ? (
              <button
                className="btn-primary btn-reveal-answer pulse-primary"
                onClick={() => {
                  setChallengeAnswerRevealed(true);
                  playSpanish(translation.spanish);
                }}
              >
                Reveal Answer <KbdHint show={isDesktop}>Space</KbdHint>
              </button>
            ) : (
              <div className="challenge-answer animate-fade-in">
                <div className="challenge-spanish ser-estar-clickable-answer">
                  {renderClickableWords(translation.spanish, getSerEstarMeaning, `${currentItem.id}-translation`)}
                </div>
                <p className="ser-estar-translation-reason">{translation.reason}</p>
                <button
                  className="btn-play-answer"
                  onClick={() => playSpanish(translation.spanish)}
                  title="Listen to the answer"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Listen <KbdHint show={isDesktop}>Space</KbdHint></span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lesson-nav-bar">
          <button className="btn-secondary btn-nav-secondary" onClick={handlePrev} disabled={currentIndex === 0}>
            ← Previous <KbdHint show={isDesktop}>←</KbdHint>
          </button>
          <button className="btn-primary btn-nav-next" onClick={handleNext}>
            Continue → <KbdHint show={isDesktop}>Enter</KbdHint>
          </button>
        </div>
      </div>
    );
  }

  if (isChallenge) {
    const challengeSentence = currentItem.data;
    return (
      <div className="lesson-player animate-fade-in">
        {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}

        {showResumeToast && (
          <div className="resume-toast animate-fade-in">
            ▶ Resuming from where you left off
          </div>
        )}

        <div className="lesson-header">
          <button className="btn-secondary btn-sm" onClick={onBack}>
            ← Back <KbdHint show={isDesktop}>Esc</KbdHint>
          </button>
          <button className="btn-help" onClick={() => setShowTutorial(true)} title="How to use">
            ?
          </button>
          <LessonProgress current={progressItemsSoFar} total={totalSentences} label="Checkpoint" />
        </div>

        <div className="lesson-content glass-panel challenge-panel" style={swipeStyle} {...swipeTouchProps}>
          <div className={`challenge-badge ${isPureTestingMode ? 'pure-testing' : ''}`}>
            <span className="challenge-icon">🗣️</span>
            <span>{isPureTestingMode ? 'Pure Testing Mode' : 'Translation Challenge'}</span>
          </div>

          <div className="challenge-prompt">
            <p className="challenge-instruction">Translate this sentence into Spanish:</p>
            <p className="challenge-english">{challengeSentence.english}</p>
          </div>

          <div className="challenge-answer-area">
            {!challengeAnswerRevealed ? (
              <button
                className="btn-primary btn-reveal-answer pulse-primary"
                onClick={() => {
                  setChallengeAnswerRevealed(true);
                  playSpanish(challengeSentence.spanish);
                }}
              >
                Reveal Answer <KbdHint show={isDesktop}>Space</KbdHint>
              </button>
            ) : (
              <div className="challenge-answer animate-fade-in">
                <p className="challenge-spanish">{challengeSentence.spanish}</p>
                <button
                  className="btn-play-answer"
                  onClick={() => playSpanish(challengeSentence.spanish)}
                  title="Listen to the answer"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Listen <KbdHint show={isDesktop}>Space</KbdHint></span>
                </button>
              </div>
            )}
          </div>
        </div>

        {canSwipe && (
          <div className="swipe-hint" aria-hidden="true">← swipe →</div>
        )}

        <div className={`lesson-nav-bar ${canSwipe ? 'swipe-mode' : ''}`}>
          <button
            className="btn-secondary btn-nav-secondary"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            ← Previous <KbdHint show={isDesktop}>←</KbdHint>
          </button>
          <button className="btn-primary btn-nav-next" onClick={handleNext}>
            {isPureTestingMode ? 'Next Prompt →' : 'Continue →'} <KbdHint show={isDesktop}>Enter</KbdHint>
          </button>
        </div>
      </div>
    );
  }

  const words = sentence.spanish.split(' ');

  return (
    <div className="lesson-player animate-fade-in">
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}

      {showResumeToast && (
        <div className="resume-toast animate-fade-in">
          ▶ Resuming from where you left off
        </div>
      )}

      <div className="lesson-header">
        <button className="btn-secondary btn-sm" onClick={onBack}>
          ← Back <KbdHint show={isDesktop}>Esc</KbdHint>
        </button>
        <button className="btn-help" onClick={() => setShowTutorial(true)} title="How to use">
          ?
        </button>
        <LessonProgress current={progressItemsSoFar} total={totalSentences} label="Sentence" />
      </div>

      <div className="lesson-content glass-panel" style={swipeStyle} {...swipeTouchProps}>
        {currentItem.isRepeat && (
          <div className="review-badge animate-fade-in">
            <span>🔄</span>
            <span>Reviewing</span>
          </div>
        )}

        <div className="audio-section">
          <button className="btn-play pulse-primary" onClick={playAudio} title="Listen to Spanish">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <KbdHint show={isDesktop}>Space</KbdHint>
          </button>
        </div>

        <div className="spanish-area">
          {!spanishRevealed ? (
            <button className="btn-reveal" onClick={() => setSpanishRevealed(true)}>
              Reveal Spanish text <KbdHint show={isDesktop}>S</KbdHint>
            </button>
          ) : (
            <div className="spanish-sentence animate-fade-in">
              {words.map((word, idx) => {
                const meaning = getMeaning(word);
                const isActive = activeWordIndex === idx;
                return (
                  <div key={idx} className="word-container">
                    <span
                      className={`spanish-word ${meaning ? 'has-meaning' : ''} ${isActive ? 'active' : ''}`}
                      onClick={(e) => {
                        if (shouldSuppressWordClick()) {
                          e.stopPropagation();
                          return;
                        }
                        if (meaning) {
                          e.stopPropagation();
                          setActiveWordIndex(isActive ? null : idx);
                          playSpanishWord(word);
                        }
                      }}
                    >
                      {word}
                    </span>
                    {isActive && meaning && (() => {
                      const vocabExtra = getVocabExtra(word);
                      return (
                        <div
                          className={`word-tooltip animate-fade-in ${vocabExtra ? 'has-mnemonic' : ''}`}
                          ref={clampTooltip}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="tooltip-meaning">{meaning}</span>
                          {vocabExtra?.mnemonic && (
                            <span className="tooltip-mnemonic">💡 {vocabExtra.mnemonic}</span>
                          )}
                          {vocabExtra?.explanation && (
                            <span className="tooltip-explanation">{vocabExtra.explanation}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="translation-area">
          {!englishRevealed ? (
            <button className="btn-text-reveal" onClick={() => setEnglishRevealed(true)}>
              Reveal Full Translation <KbdHint show={isDesktop}>E</KbdHint>
            </button>
          ) : (
            <div className="english-translation animate-fade-in">{sentence.english}</div>
          )}
        </div>
      </div>

      {canSwipe && (
        <div className="swipe-hint" aria-hidden="true">← swipe →</div>
      )}

      {canSwipe && swipeOffsetY > SWIPE_DOWN_THRESHOLD && (
        <div className="swipe-bookmark-indicator">🔖 Saved for later</div>
      )}

      <div className={`lesson-nav-bar ${canSwipe ? 'swipe-mode' : ''}`}>
        <button
          className="btn-secondary btn-nav-secondary"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          ← Previous <KbdHint show={isDesktop}>←</KbdHint>
        </button>
        <button
          className="btn-mark-later btn-nav-mark"
          onClick={handleMarkForLater}
          title="See this sentence again at the end"
        >
          🔖 Later <KbdHint show={isDesktop}>M</KbdHint>
        </button>
        <button className="btn-primary btn-nav-next" onClick={handleNext}>
          Next → <KbdHint show={isDesktop}>Enter</KbdHint>
        </button>
      </div>
    </div>
  );
};

export default LessonPlayer;
