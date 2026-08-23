const DAY = 86400000;
const BOX_DAYS = [0, 1, 3, 7, 14];
const APP_VERSION = "1.3.0";

const $ = id => document.getElementById(id);

let state = loadState();
let queue = [], qi = -1, cur = null;
let mode = "fusion";
let flipped = new Set(), usedFlipAll = false, graded = false;
let dChecked = false, dReplays = 0;
let bPlaced = [], bPoolWords = [], bErrors = 0, bDone = false;
let cHidden = -1, cChecked = false;
let sGraded = false, recActive = false, recognition = null;
let voices = [];

function loadState() {
  const def = {
    xp: 0, bestStreak: 0, streak: 0,
    srs: {},
    stats: { flips: 0, dictWins: 0, buildWins: 0, clozeWins: 0, speakWins: 0 },
    settings: { rate: 1, voiceURI: null, autoplay: true, topics: null, difficulty: "all" },
    seenHelp: false
  };
  try {
    const raw = JSON.parse(localStorage.getItem("puente_v1"));
    if (!raw) return def;
    return Object.assign(def, raw, { settings: Object.assign(def.settings, raw.settings || {}) });
  } catch (e) { return def; }
}
function save() { try { localStorage.setItem("puente_v1", JSON.stringify(state)); } catch (e) {} }

function srsOf(id) {
  if (!state.srs[id]) state.srs[id] = { box: 0, due: 0, lastSeen: 0, seen: 0 };
  return state.srs[id];
}

function activeTopics() { return state.settings.topics && state.settings.topics.length ? state.settings.topics : TOPICS; }
function activeCards() {
  const difficulty = String(state.settings.difficulty || "all");
  return SENTENCES.filter(s => activeTopics().includes(s.topic) && (difficulty === "all" || String(s.level) === difficulty));
}

function difficultyLabel(level) {
  return ({ 1: "Beginner", 2: "Intermediate", 3: "Advanced" })[level] || "All levels";
}

function shuffle(a) {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
}

function buildQueue() {
  const now = Date.now();
  const act = activeCards();
  const due = act.filter(c => { const r = state.srs[c.id]; return r && r.due <= now; })
    .sort((a, b) => state.srs[a.id].due - state.srs[b.id].due);
  const fresh = shuffle(act.filter(c => !state.srs[c.id]));
  const rest = shuffle(act.filter(c => { const r = state.srs[c.id]; return r && r.due > now; }));
  queue = [...due, ...fresh, ...rest];
  qi = -1;
}

function nextCard() {
  qi++;
  if (qi >= queue.length) buildQueue();
  cur = queue[qi];
}

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fullSpanish(s) { return s.tokens.map(t => t.es).join(" "); }

function diffWords(T, G) {
  const n = T.length, m = G.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = T[i] === G[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const flags = new Array(n).fill(false), extras = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (T[i] === G[j]) { flags[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { extras.push(G[j]); j++; }
  }
  while (j < m) extras.push(G[j++]);
  return { flags, extras };
}

function matchPct(target, guess) {
  const T = normalize(target).split(" "), G = normalize(guess).split(" ");
  if (!G.length || !G[0]) return 0;
  const { flags } = diffWords(T, G);
  return Math.round(flags.filter(Boolean).length / T.length * 100);
}

function refreshVoices() {
  voices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith("es"));
  if (!voices.length) voices = speechSynthesis.getVoices();
  populateVoiceSelect();
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = refreshVoices;
  refreshVoices();
  setTimeout(refreshVoices, 400);
}

function speak(text, rateOverride) {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => x.voiceURI === state.settings.voiceURI) || voices[0];
    if (v) u.voice = v;
    u.lang = v ? v.lang : "es-ES";
    u.rate = rateOverride || state.settings.rate;
    speechSynthesis.speak(u);
  } catch (e) {}
}

let audioUnlocked = false;
document.addEventListener("pointerdown", () => {
  if (audioUnlocked || !("speechSynthesis" in window)) return;
  audioUnlocked = true;
  try { speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {}
}, { once: true, capture: true });

function toast(msg, gold) {
  const t = document.createElement("div");
  t.className = "toast" + (gold ? " gold" : "");
  t.innerHTML = msg;
  $("toasts").appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, gold ? 3600 : 2400);
}

function level() { return Math.floor(state.xp / 120) + 1; }

function addXP(n) {
  const before = level();
  state.xp += n;
  if (level() > before) toast("🎉 Level up! You reached level " + level(), true);
  updateHUD();
}

function grade(result) {
  const r = srsOf(cur.id);
  r.lastSeen = Date.now();
  r.seen++;
  if (result === "good") {
    r.box = Math.min(4, r.box + 1);
    r.due = Date.now() + BOX_DAYS[r.box] * DAY;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    if (r.box === 4) toast("🏅 Mastered: “" + escapeHtml(fullSpanish(cur).slice(0, 42)) + "…”", true);
  } else if (result === "bad") {
    r.box = Math.max(0, r.box - 1);
    r.due = Date.now() + 10 * 60000;
    state.streak = 0;
  } else {
    r.due = Date.now() + 10 * 60000;
    state.streak = 0;
  }
  save();
  updateHUD();
}

function showNote(el) {
  el.innerHTML = "<b>📘 " + escapeHtml(cur.note.title) + "</b> — " + escapeHtml(cur.note.text);
  el.style.display = "block";
}

function hideNotes() { ["fNote", "dNote", "bNote", "cNote", "sNote"].forEach(id => $(id).style.display = "none"); }

function updateHUD() {
  $("lvlNum").textContent = level();
  $("xpNum").textContent = state.xp;
  $("xpFill").style.width = ((state.xp % 120) / 120 * 100) + "%";
  $("streakNum").textContent = state.streak;
  $("bestNum").textContent = state.bestStreak;
  const now = Date.now();
  $("dueNum").textContent = activeCards().filter(c => { const r = state.srs[c.id]; return r && r.due <= now; }).length;
  $("masteredNum").textContent = activeCards().filter(c => (state.srs[c.id] || {}).box >= 4).length;
  $("totalNum").textContent = activeCards().length;
}

function setDifficulty(value) {
  state.settings.difficulty = String(value);
  save();
  document.querySelectorAll("#difficultySwitch button").forEach(button => {
    const active = button.dataset.difficulty === state.settings.difficulty;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  buildQueue();
  updateHUD();
  startCard();
}

function setMode(m) {
  mode = m;
  if (recognition) { try { recognition.abort(); } catch (e) {} recActive = false; }
  speechSynthesis.cancel();
  document.querySelectorAll("#modeSwitch button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  ["fusion", "dictation", "builder", "cloze", "speak"].forEach(v => $("view-" + v).style.display = v === m ? "block" : "none");
  startCard();
}

function startCard() {
  nextCard();
  hideNotes();
  flipped = new Set(); usedFlipAll = false; graded = false;
  dChecked = false; dReplays = 0;
  bPlaced = []; bErrors = 0; bDone = false;
  cHidden = -1; cChecked = false;
  sGraded = false;
  if (mode === "fusion") renderFusion();
  else if (mode === "dictation") renderDictation();
  else if (mode === "builder") renderBuilder();
  else if (mode === "cloze") renderCloze();
  else if (mode === "speak") renderSpeak();
}

function renderFusion() {
  const total = cur.tokens.length;
  const startFusion = Math.min(0.85, 0.15 * (srsOf(cur.id).box + 1));
  const pre = Math.round(total * startFusion);
  shuffle([...Array(total).keys()]).slice(0, pre).forEach(i => flipped.add(i));
  $("fTopic").textContent = cur.topic + " · " + difficultyLabel(cur.level);
  paintFusion();
  $("fHint").textContent = "Say the missing words aloud in Spanish, then click each one to check yourself.";
}

function paintFusion() {
  const box = $("fSentence");
  box.innerHTML = "";
  cur.tokens.forEach((t, i) => {
    const span = document.createElement("span");
    if (flipped.has(i)) {
      span.className = "token es";
      span.textContent = t.es;
      span.onclick = () => speak(t.es);
    } else {
      span.className = "token en clickable";
      span.textContent = t.en;
      span.onclick = () => tapToken(span, t, i);
    }
    box.appendChild(span);
  });
  const pct = Math.round(flipped.size / cur.tokens.length * 100);
  $("fFill").style.width = pct + "%";
}

function tapToken(span, t, i) {
  flipped.add(i);
  const sentenceComplete = flipped.size === cur.tokens.length;
  state.stats.flips++;
  addXP(1);
  span.className = "token es flip";
  span.textContent = t.es;
  span.onclick = () => speak(t.es);
  if (!sentenceComplete) speak(t.es);
  $("fFill").style.width = Math.round(flipped.size / cur.tokens.length * 100) + "%";
  if (sentenceComplete) setTimeout(fusionComplete, 300);
}

function fusionComplete() {
  if (graded) return;
  graded = true;
  if (!usedFlipAll) { grade("good"); addXP(10); } else grade("ok");
  if (state.settings.autoplay) speak(fullSpanish(cur));
  showNote($("fNote"));
  $("fHint").textContent = "Complete! 🔊 Listen once more, then press Next.";
  save();
}

$("btnFSpeak").onclick = () => speak(fullSpanish(cur));
$("btnFFlipAll").onclick = () => {
  usedFlipAll = true;
  cur.tokens.forEach((_, i) => flipped.add(i));
  paintFusion();
  if (!graded) setTimeout(fusionComplete, 350);
};
$("btnFNext").onclick = () => {
  if (!graded) grade(flipped.size === cur.tokens.length ? "ok" : "skip");
  startCard();
};

function renderDictation() {
  $("dTopic").textContent = cur.topic + " · " + difficultyLabel(cur.level);
  $("dInput").value = "";
  $("dVerdict").textContent = ""; $("dVerdict").className = "verdict";
  $("dDiff").innerHTML = ""; $("dReveal").textContent = "";
  $("dReplays").textContent = "0";
  dChecked = false; dReplays = 0;
  setTimeout(() => speak(fullSpanish(cur)), 350);
  $("dInput").focus();
}

function playDictation(slow) {
  dReplays++;
  $("dReplays").textContent = dReplays;
  speak(fullSpanish(cur), slow ? 0.55 : null);
}

function checkDictation() {
  if (dChecked) return;
  dChecked = true;
  const target = fullSpanish(cur);
  const pct = matchPct(target, $("dInput").value);
  const T = normalize(target).split(" ");
  const G = normalize($("dInput").value).split(" ");
  const { flags, extras } = diffWords(T, G);
  $("dDiff").innerHTML = T.map((w, i) =>
    '<span class="' + (flags[i] ? "w-ok" : "w-miss") + '">' + escapeHtml(w) + "</span>").join(" ") +
    (extras.length ? ' &nbsp;<span style="color:#5b6474">extra: ' + escapeHtml(extras.join(", ")) + "</span>" : "");
  const v = $("dVerdict");
  if (pct >= 80) {
    v.className = "verdict good"; v.textContent = "¡Muy bien! " + pct + "% match";
    grade("good"); addXP(15); state.stats.dictWins++;
  } else {
    v.className = "verdict bad"; v.textContent = pct + "% match — compare the red words.";
    grade("bad"); addXP(3);
  }
  $("dReveal").textContent = target;
  showNote($("dNote"));
  speak(target);
  save(); updateHUD();
}

$("btnDPlay").onclick = () => playDictation(false);
$("btnDSlow").onclick = () => playDictation(true);
$("btnDCheck").onclick = checkDictation;
$("btnDNext").onclick = () => { if (!dChecked) grade("skip"); startCard(); };
$("dInput").addEventListener("keydown", e => { if (e.key === "Enter") dChecked ? startCard() : checkDictation(); });

function renderBuilder() {
  $("bTopic").textContent = cur.topic + " · " + difficultyLabel(cur.level);
  $("bEng").textContent = "English: " + cur.tokens.map(t => t.en).join(" ");
  $("bVerdict").textContent = ""; $("bVerdict").className = "verdict";
  bPlaced = []; bErrors = 0; bDone = false;
  bPoolWords = cur.tokens.flatMap(t => t.es.split(" "));
  let shuf = shuffle(bPoolWords);
  let guard = 0;
  while (shuf.join(" ") === bPoolWords.join(" ") && guard++ < 10) shuf = shuffle(bPoolWords);
  bPoolWords = shuf;
  paintBuilder();
  setTimeout(() => speak(fullSpanish(cur)), 350);
}

function paintBuilder() {
  const ans = $("bAnswer"), pool = $("bPool");
  ans.innerHTML = ""; pool.innerHTML = "";
  bPlaced.forEach((w, i) => {
    const c = document.createElement("span");
    c.className = "chip"; c.textContent = w;
    c.onclick = () => { if (bDone) return; bPlaced.splice(i, 1); paintBuilder(); };
    ans.appendChild(c);
  });
  const remaining = [...bPoolWords];
  bPlaced.forEach(w => { const ix = remaining.indexOf(w); if (ix > -1) remaining.splice(ix, 1); });
  remaining.forEach(w => {
    const c = document.createElement("span");
    c.className = "chip"; c.textContent = w;
    c.onclick = () => { if (bDone) return; bPlaced.push(w); paintBuilder(); };
    pool.appendChild(c);
  });
}

function checkBuilder() {
  if (bDone) return;
  const guess = bPlaced.join(" ");
  const target = fullSpanish(cur);
  if (normalize(guess) === normalize(target)) {
    bDone = true;
    const v = $("bVerdict");
    v.className = "verdict good";
    v.textContent = bErrors === 0 ? "¡Perfecto! Built without mistakes." : "Correct! (" + bErrors + " mistake" + (bErrors > 1 ? "s" : "") + " along the way)";
    if (bErrors === 0) { grade("good"); addXP(12); state.stats.buildWins++; }
    else { grade("ok"); addXP(6); }
    showNote($("bNote"));
    speak(target);
    save(); updateHUD();
  } else {
    bErrors++;
    const v = $("bVerdict");
    v.className = "verdict bad";
    v.textContent = "Not quite yet — listen again and rearrange.";
    $("bAnswer").classList.add("shake");
    setTimeout(() => $("bAnswer").classList.remove("shake"), 400);
    speak(target);
  }
}

$("btnBPlay").onclick = () => speak(fullSpanish(cur));
$("btnBClear").onclick = () => { if (!bDone) { bPlaced = []; paintBuilder(); } };
$("btnBCheck").onclick = checkBuilder;
$("btnBNext").onclick = () => { if (!bDone) grade("skip"); startCard(); };

function renderCloze() {
  $("cTopic").textContent = cur.topic + " · " + difficultyLabel(cur.level);
  const candidates = cur.tokens.map((t, i) => ({ t, i })).filter(x => x.t.es.replace(/[^\wáéíóúñü]/gi, "").length > 2);
  cHidden = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].i : 0;
  cChecked = false;
  $("cVerdict").textContent = ""; $("cVerdict").className = "verdict";
  paintCloze(false);
  setTimeout(() => speak(fullSpanish(cur)), 350);
  $("cInput").value = "";
  $("cInput").focus();
}

function paintCloze(revealed) {
  const box = $("cSentence");
  box.innerHTML = "";
  cur.tokens.forEach((t, i) => {
    const span = document.createElement("span");
    if (i === cHidden) {
      span.className = "token " + (revealed ? "es" : "en clickable");
      span.textContent = revealed ? t.es : "? ? ?";
      span.style.borderBottom = "2px dashed var(--accent)";
    } else {
      span.className = "token es";
      span.textContent = t.es;
      span.onclick = () => speak(t.es);
    }
    box.appendChild(span);
  });
}

function checkCloze() {
  if (cChecked) return;
  cChecked = true;
  const answer = cur.tokens[cHidden].es;
  const ok = normalize($("cInput").value) === normalize(answer);
  const v = $("cVerdict");
  paintCloze(true);
  if (ok) {
    v.className = "verdict good"; v.textContent = "¡Correcto!";
    grade("good"); addXP(8); state.stats.clozeWins++;
  } else {
    v.className = "verdict bad"; v.textContent = 'It was "' + answer + '"';
    grade("bad"); addXP(2);
  }
  showNote($("cNote"));
  speak(fullSpanish(cur));
  save(); updateHUD();
}

$("btnCCheck").onclick = checkCloze;
$("btnCSpeak").onclick = () => speak(fullSpanish(cur));
$("btnCNext").onclick = () => { if (!cChecked) grade("skip"); startCard(); };
$("cInput").addEventListener("keydown", e => { if (e.key === "Enter") cChecked ? startCard() : checkCloze(); });

function renderSpeak() {
  $("sTopic").textContent = cur.topic + " · " + difficultyLabel(cur.level);
  $("sTarget").textContent = fullSpanish(cur);
  $("sTranscript").textContent = "";
  $("sVerdict").textContent = ""; $("sVerdict").className = "verdict";
  sGraded = false;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("sTranscript").textContent = "Speech recognition isn't available in this browser — try Chrome or Edge. You can still listen and shadow aloud.";
    $("btnSMic").disabled = true; $("btnSMic").style.opacity = ".4";
  } else {
    $("btnSMic").disabled = false; $("btnSMic").style.opacity = "1";
  }
  setTimeout(() => speak(fullSpanish(cur)), 350);
}

function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || recActive) return;
  recognition = new SR();
  const v = voices.find(x => x.voiceURI === state.settings.voiceURI) || voices[0];
  recognition.lang = v ? v.lang : "es-ES";
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  recActive = true;
  $("btnSMic").textContent = "👂";
  $("sTranscript").textContent = "Listening… say the sentence!";
  recognition.onresult = e => {
    let best = 0, bestText = "";
    for (const alt of e.results[0]) {
      const pct = matchPct(fullSpanish(cur), alt.transcript);
      if (pct > best) { best = pct; bestText = alt.transcript; }
    }
    $("sTranscript").textContent = 'You said: "' + bestText + '"';
    const v2 = $("sVerdict");
    if (best >= 70) {
      v2.className = "verdict good"; v2.textContent = best + "% match — ¡bien dicho!";
      if (!sGraded) { grade("good"); addXP(20); state.stats.speakWins++; sGraded = true; }
    } else {
      v2.className = "verdict bad"; v2.textContent = best + "% match — listen once more and try again.";
      if (!sGraded) { addXP(5); sGraded = true; }
    }
    save(); updateHUD();
  };
  recognition.onerror = e => {
    $("sTranscript").textContent = "Mic error: " + e.error + (e.error === "not-allowed" ? " — allow microphone access." : "");
  };
  recognition.onend = () => { recActive = false; $("btnSMic").textContent = "🎤"; };
  recognition.start();
}

$("btnSPlay").onclick = () => speak(fullSpanish(cur));
$("btnSSlow").onclick = () => speak(fullSpanish(cur), 0.55);
$("btnSMic").onclick = toggleMic;
$("btnSNext").onclick = () => { if (!sGraded) grade("skip"); startCard(); };

document.querySelectorAll("#modeSwitch button").forEach(b => b.onclick = () => setMode(b.dataset.mode));
document.querySelectorAll("#difficultySwitch button").forEach(b => b.onclick = () => setDifficulty(b.dataset.difficulty));

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

$("btnHelp").onclick = () => { speechSynthesis.cancel(); openModal("helpOverlay"); };
$("btnStart").onclick = () => {
  closeModal("helpOverlay");
  state.seenHelp = true; save();
  speak("Bienvenido. ¡Vamos a aprender español!");
};

function populateVoiceSelect() {
  const sel = $("setVoice");
  if (!sel) return;
  sel.innerHTML = "";
  const optDefault = document.createElement("option");
  optDefault.value = ""; optDefault.textContent = "Browser default (es-ES)";
  sel.appendChild(optDefault);
  voices.forEach(v => {
    const o = document.createElement("option");
    o.value = v.voiceURI;
    o.textContent = v.name + " (" + v.lang + ")";
    sel.appendChild(o);
  });
  sel.value = state.settings.voiceURI || "";
}

function renderTopicGrid() {
  const grid = $("topicGrid");
  grid.innerHTML = "";
  TOPICS.forEach(tp => {
    const lab = document.createElement("label");
    lab.className = "tcheck" + (activeTopics().includes(tp) ? " on" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = activeTopics().includes(tp);
    cb.onchange = () => {
      let list = [...(state.settings.topics || TOPICS)];
      if (cb.checked) { if (!list.includes(tp)) list.push(tp); }
      else {
        list = list.filter(x => x !== tp);
        if (!list.length) { cb.checked = true; return; }
      }
      state.settings.topics = list;
      save();
      const stillValid = cur && activeTopics().includes(cur.topic);
      buildQueue();
      if (stillValid) { qi = queue.indexOf(cur); updateHUD(); }
      else startCard();
      renderTopicGrid();
    };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(tp));
    grid.appendChild(lab);
  });
}

$("btnSettings").onclick = () => {
  refreshVoices();
  $("setRate").value = state.settings.rate;
  $("rateVal").textContent = Number(state.settings.rate).toFixed(2).replace(/\.?0+$/, "") + "×";
  $("setAutoplay").checked = state.settings.autoplay;
  renderTopicGrid();
  openModal("settingsOverlay");
};
$("setVoice").onchange = e => { state.settings.voiceURI = e.target.value || null; save(); };
$("setRate").oninput = e => {
  state.settings.rate = parseFloat(e.target.value);
  $("rateVal").textContent = state.settings.rate.toFixed(2).replace(/\.?0+$/, "") + "×";
  save();
};
$("setAutoplay").onchange = e => { state.settings.autoplay = e.target.checked; save(); };
$("btnCloseSettings").onclick = () => closeModal("settingsOverlay");
$("btnReset").onclick = () => {
  if (confirm("Reset ALL progress? XP, review levels and streaks will be erased.")) {
    localStorage.removeItem("puente_v1");
    state = loadState();
    buildQueue(); updateHUD(); startCard();
    closeModal("settingsOverlay");
    toast("Progress reset. Fresh start!");
  }
};

function dotsFor(box) {
  return [0, 1, 2, 3, 4].map(i => '<span class="' + (i < box ? "" : "off") + '">●</span>').join("");
}

$("btnDash").onclick = () => {
  const now = Date.now();
  const act = activeCards();
  const dueCount = act.filter(c => { const r = state.srs[c.id]; return r && r.due <= now; }).length;
  const masteredCount = act.filter(c => (state.srs[c.id] || {}).box >= 4).length;
  const st = state.stats;
  $("dashStats").innerHTML =
    statBox(level(), "Level") + statBox(state.xp, "Total XP") +
    statBox(state.bestStreak, "Best streak") + statBox(dueCount, "Due now") +
    statBox(masteredCount + "/" + act.length, "Mastered") +
    statBox(st.flips, "Word flips") + statBox(st.dictWins, "Dictation wins") +
    statBox(st.buildWins, "Built sentences") + statBox(st.clozeWins, "Cloze wins") +
    statBox(st.speakWins, "Speak wins");
  let rows = "<tr><td>sentence</td><td>topic</td><td>difficulty</td><td>review</td><td>due</td></tr>";
  act.forEach(c => {
    const r = state.srs[c.id];
    const es = fullSpanish(c);
    const dots = r ? dotsFor(r.box) : '<span class="off">●●●●●</span>';
    const dueLabel = !r ? "new" : (r.due <= now ? "due" : "in " + Math.ceil((r.due - now) / DAY) + "d");
    rows += "<tr><td>" + escapeHtml(es.slice(0, 44)) + (es.length > 44 ? "…" : "") + "</td><td>" + escapeHtml(c.topic) + "</td><td>" + difficultyLabel(c.level) + "</td><td class='dots'>" + dots + "</td><td>" + dueLabel + "</td></tr>";
  });
  $("dashTable").innerHTML = rows;
  openModal("dashOverlay");
};
function statBox(n, label) { return '<div class="statbox"><b>' + n + "</b><span>" + label + "</span></div>"; }
$("btnCloseDash").onclick = () => closeModal("dashOverlay");

document.addEventListener("keydown", e => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
  if (e.key === "Escape") { ["helpOverlay", "settingsOverlay", "dashOverlay"].forEach(closeModal); return; }
  if (typing) return;
  if (!$("helpOverlay").classList.contains("hidden") || !$("settingsOverlay").classList.contains("hidden") || !$("dashOverlay").classList.contains("hidden")) return;
  if (e.key === " ") {
    e.preventDefault();
    speak(fullSpanish(cur));
    if (mode === "dictation") { dReplays++; $("dReplays").textContent = dReplays; }
  } else if (e.key === "Enter") {
    if (mode === "fusion") $("btnFNext").click();
    else if (mode === "builder") $("btnBNext").click();
    else if (mode === "speak") $("btnSNext").click();
  } else if (e.key.toLowerCase() === "f" && mode === "fusion") {
    $("btnFFlipAll").click();
  } else if (e.key === "?") {
    openModal("helpOverlay");
  }
});

window.addEventListener("beforeunload", () => { try { speechSynthesis.cancel(); } catch (e) {} });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

buildQueue();
updateHUD();
document.querySelectorAll("#difficultySwitch button").forEach(button => {
  const active = button.dataset.difficulty === String(state.settings.difficulty || "all");
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
});
if (!state.seenHelp) openModal("helpOverlay");
startCard();
