const audio = document.querySelector("#audio");
const app = document.querySelector(".app");
const audioFile = document.querySelector("#audioFile");
const transcriptFile = document.querySelector("#transcriptFile");
const appTitle = document.querySelector("#app-title");
const backToLibrary = document.querySelector("#backToLibrary");
const trackList = document.querySelector("#trackList");
const librarySearch = document.querySelector("#librarySearch");
const formatFilter = document.querySelector("#formatFilter");
const librarySort = document.querySelector("#librarySort");
const levelFilters = [...document.querySelectorAll(".level-filter")];
const collectionTabs = [...document.querySelectorAll(".collection-tab")];
const catalogSummary = document.querySelector("#catalogSummary");
const playPause = document.querySelector("#playPause");
const playbackRateButton = document.querySelector("#playbackRate");
const playbackRateValue = playbackRateButton.querySelector(".speed-value");
const speedMenu = document.querySelector("#speedMenu");
const speedOptions = [...speedMenu.querySelectorAll("[data-rate]")];
const SPEED_RATES = speedOptions.map((option) => Number(option.dataset.rate));
const playIcon = document.querySelector("#playIcon");
const skipBack = document.querySelector("#skipBack");
const skipForward = document.querySelector("#skipForward");
const readModeToggle = document.querySelector("#readModeToggle");
const readModeLabel = readModeToggle?.querySelector(".mode-label");

const PLAY_ICON = `<svg class="play-glyph" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
const PAUSE_ICON = `<svg class="pause-glyph" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="4" width="4.5" height="16" rx="1"></rect><rect x="14.5" y="4" width="4.5" height="16" rx="1"></rect></svg>`;
const seek = document.querySelector("#seek");
const currentTimeEl = document.querySelector("#currentTime");
const durationEl = document.querySelector("#duration");
const reader = document.querySelector("#reader");
const statusEl = document.querySelector("#status");
const readingMeta = document.querySelector("#readingMeta");
const pasteTranscript = document.querySelector("#pasteTranscript");
const usePastedText = document.querySelector("#usePastedText");
const definition = document.querySelector("#definition");
const studyCount = document.querySelector("#studyCount");
const downloadAnki = document.querySelector("#downloadAnki");
const ankiDialog = document.querySelector("#ankiDialog");
const ankiDialogCount = document.querySelector("#ankiDialogCount");
const ankiCardList = document.querySelector("#ankiCardList");
const closeAnkiDialog = document.querySelector("#closeAnkiDialog");
const cancelAnkiReview = document.querySelector("#cancelAnkiReview");
const downloadReviewedAnki = document.querySelector("#downloadReviewedAnki");
const themeSelect = document.querySelector("#themeSelect");
const highlightSelect = document.querySelector("#highlightSelect");
const textModeSelect = document.querySelector("#textModeSelect");
const translationLayoutSelect = document.querySelector("#translationLayoutSelect");
const settingsMenu = document.querySelector("#settingsMenu");
const appearanceControls = settingsMenu.querySelector(".appearance-controls");
const textSize = document.querySelector("#textSize");
const textSizeValue = document.querySelector("#textSizeValue");
const lineHeight = document.querySelector("#lineHeight");
const lineHeightValue = document.querySelector("#lineHeightValue");
const fontSelect = document.querySelector("#fontSelect");
const readerWidthSelect = document.querySelector("#readerWidthSelect");
const vocabWarmupSelect = document.querySelector("#vocabWarmupSelect");
const resetAppearance = document.querySelector("#resetAppearance");
const vocabWarmup = document.querySelector("#vocabWarmup");
const vocabWarmupList = document.querySelector("#vocabWarmupList");
const toggleVocabWarmupCollapse = document.querySelector("#toggleVocabWarmupCollapse");
const startReadingFromVocabBtn = document.querySelector("#startReadingFromVocabBtn");
const wordPopover = document.querySelector("#wordPopover");
const canvas = document.querySelector("#waveform");
const ctx = canvas.getContext("2d");
const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
const themeOptions = ["system", "paper", "mist", "night"];
const appearanceSettingsVersion = 4;
const difficultyOrder = ["A2", "B1", "B2", "C1"];
const collectionOptions = ["all", "stories", "bible", "greek-classics"];
const difficultyLabels = {
  A2: "Early reader",
  B1: "Intermediate",
  B2: "Upper intermediate",
  C1: "Advanced"
};

let words = [];
let currentWordIndex = -1;
let readWordCount = -1;
let rafId = 0;
let objectUrl = "";
let tracks = [];
let activeTrackId = "";
let activeAudioSource = "";
let pendingResumeTime = 0;
let resumeRetryTimer = 0;
let resumeListenerCleanup = null;
let lastProgressSave = 0;
let selectedWordButton = null;
let definitionRequestId = 0;
let trackLoadId = 0;
let translationCache = loadTranslationCache();
const translationRequests = new Map();
let sharedGlossary = {};
let progressCache = loadProgressCache();
let studyLog = loadStudyLog();
let appearanceSettings = loadAppearanceSettings();
let sliderPreviewTimer = 0;
let draggingAppearanceSlider = false;
let isReadMode = false;
let catalogSettings = loadCatalogSettings();
let translationObserver = null;
let translationRenderId = 0;
let savedTranslationBlocks = [];
let savedTranslationLookup = new Map();
let vocabWarmupItemCount = 0;

applyAppearanceSettings();
drawWaveform(0);
updateStudyControls();
initialize();

librarySearch.value = catalogSettings.search;
formatFilter.value = catalogSettings.format;
librarySort.value = catalogSettings.sort;
updateLevelFilters();
updateCollectionTabs();

collectionTabs.forEach((button, index) => {
  button.addEventListener("click", () => selectCollection(button.dataset.collection));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = event.key === "Home" ? 0 : event.key === "End" ? collectionTabs.length - 1 : index + (event.key === "ArrowRight" ? 1 : -1);
    nextIndex = (nextIndex + collectionTabs.length) % collectionTabs.length;
    selectCollection(collectionTabs[nextIndex].dataset.collection);
    collectionTabs[nextIndex].focus();
  });
});

librarySearch.addEventListener("input", () => {
  catalogSettings.search = librarySearch.value;
  saveCatalogSettings();
  renderTrackList();
});

formatFilter.addEventListener("change", () => {
  catalogSettings.format = formatFilter.value;
  saveCatalogSettings();
  renderTrackList();
});

librarySort.addEventListener("change", () => {
  catalogSettings.sort = librarySort.value;
  saveCatalogSettings();
  renderTrackList();
});

levelFilters.forEach((button) => {
  button.addEventListener("click", () => {
    catalogSettings.level = button.dataset.level;
    saveCatalogSettings();
    updateLevelFilters();
    renderTrackList();
  });
});

backToLibrary.addEventListener("click", () => {
  showLibrary();
});

window.addEventListener("popstate", () => {
  const routeId = safeDecodeHash();
  const track = tracks.find((item) => item.id === routeId);
  if (track) loadTrack(track, false);
  else showLibrary(false);
});

trackList.addEventListener("click", (event) => {
  if (event.target.closest("[data-clear-catalog]")) {
    catalogSettings = { search: "", format: "all", sort: "difficulty", level: "all", collection: "all" };
    librarySearch.value = "";
    formatFilter.value = "all";
    librarySort.value = "difficulty";
    updateLevelFilters();
    updateCollectionTabs();
    saveCatalogSettings();
    renderTrackList();
    librarySearch.focus();
    return;
  }
  const button = event.target.closest(".track-card");
  if (!button) return;
  const track = tracks.find((item) => item.id === button.dataset.trackId);
  if (track) loadTrack(track);
});

audioFile.addEventListener("change", () => {
  const file = audioFile.files?.[0];
  if (!file) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  audio.pause();
  trackLoadId += 1;
  saveActiveProgress(true);
  objectUrl = URL.createObjectURL(file);
  activeTrackId = "";
  activeAudioSource = objectUrl;
  pendingResumeTime = 0;
  appTitle.textContent = file.name;
  readingMeta.hidden = true;
  updateMediaSession({ title: file.name, author: "", cover: "" });
  app.dataset.media = "audio";
  setReadMode(false);
  showReader();
  setAudioSource(objectUrl, `${file.name} loaded.`);
});

transcriptFile.addEventListener("change", async () => {
  const file = transcriptFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseTranscript(text, file.name);
    setSavedTranslationBlocks([]);
    setWords(parsed, hasValidTimings(parsed));
    status(`${file.name} loaded with ${parsed.length.toLocaleString()} words.`);
  } catch {
    status(`${file.name} could not be read. Check that it is a valid transcript file.`);
  }
});

usePastedText.addEventListener("click", () => {
  const text = pasteTranscript.value.trim();
  if (!text) {
    status("Paste Spanish text first.");
    return;
  }
  const parsed = tokenizeUntimed(text);
  assignApproximateTimes(parsed);
  setSavedTranslationBlocks([]);
  setWords(parsed, false);
  status("Pasted text loaded. Highlighting is approximate because no word timings were provided.");
});

downloadAnki.addEventListener("click", () => {
  openAnkiReview();
});

closeAnkiDialog.addEventListener("click", () => ankiDialog.close());
cancelAnkiReview.addEventListener("click", () => ankiDialog.close());

downloadReviewedAnki.addEventListener("click", () => {
  downloadAnkiCards();
  ankiDialog.close();
});

ankiCardList.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  const card = event.target.closest(".anki-card-editor");
  if (!field || !card) return;
  const entry = studyLog[card.dataset.studyKey];
  if (!entry) return;

  const value = field.value;
  if (field.dataset.field === "context") entry.context = htmlToText(value);
  else entry[field.dataset.field] = value;
  if (field.dataset.field === "word") {
    entry.normalized = normalizeWord(value);
    card.querySelector(".anki-card-editor-header strong").textContent = value || "Untitled word";
  }
  entry.lastSeenAt = new Date().toISOString();
  saveStudyLog(studyLog);
  updateStudyControls();
  updateAnkiReviewCount();
});

ankiCardList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-card]");
  if (!removeButton) return;
  const card = removeButton.closest(".anki-card-editor");
  if (!card) return;
  delete studyLog[card.dataset.studyKey];
  saveStudyLog(studyLog);
  card.remove();
  updateStudyControls();
  updateAnkiReviewCount();
  if (!studyEntries().length) ankiDialog.close();
});

themeSelect.addEventListener("change", () => {
  appearanceSettings.theme = themeSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

highlightSelect.addEventListener("change", () => {
  appearanceSettings.highlight = highlightSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

textModeSelect.addEventListener("change", () => {
  appearanceSettings.textMode = textModeSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

translationLayoutSelect.addEventListener("change", () => {
  appearanceSettings.translationLayout = translationLayoutSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
  renderWords();
  updateProgress();
});

textSize.addEventListener("input", () => {
  beginSliderPreview(textSize);
  appearanceSettings.textSize = Number(textSize.value);
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
  scheduleSliderPreviewEnd();
});

lineHeight.addEventListener("input", () => {
  beginSliderPreview(lineHeight);
  appearanceSettings.lineHeight = Number(lineHeight.value);
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
  scheduleSliderPreviewEnd();
});

fontSelect.addEventListener("change", () => {
  appearanceSettings.font = fontSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

readerWidthSelect.addEventListener("change", () => {
  appearanceSettings.readerWidth = readerWidthSelect.value;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

if (vocabWarmupSelect) {
  vocabWarmupSelect.addEventListener("change", () => {
    appearanceSettings.vocabWarmup = vocabWarmupSelect.value;
    saveAppearanceSettings(appearanceSettings);
    applyAppearanceSettings();
    renderVocabWarmup();
  });
}

resetAppearance.addEventListener("click", () => {
  const playbackRate = appearanceSettings.playbackRate;
  appearanceSettings = defaultAppearanceSettings();
  appearanceSettings.playbackRate = playbackRate;
  saveAppearanceSettings(appearanceSettings);
  applyAppearanceSettings();
});

[textSize, lineHeight].forEach((slider) => {
  slider.addEventListener("pointerdown", () => {
    draggingAppearanceSlider = true;
    beginSliderPreview(slider);
  });
});

window.addEventListener("pointerup", () => {
  draggingAppearanceSlider = false;
  endSliderPreview();
});
window.addEventListener("pointercancel", () => {
  draggingAppearanceSlider = false;
  endSliderPreview();
});
settingsMenu.addEventListener("toggle", () => {
  if (!settingsMenu.open) endSliderPreview();
});

function beginSliderPreview(slider) {
  window.clearTimeout(sliderPreviewTimer);
  appearanceControls.querySelector(".is-active-control")?.classList.remove("is-active-control");
  slider.closest("label")?.classList.add("is-active-control");
  appearanceControls.classList.add("is-adjusting");
}

function scheduleSliderPreviewEnd() {
  if (draggingAppearanceSlider) return;
  window.clearTimeout(sliderPreviewTimer);
  sliderPreviewTimer = window.setTimeout(endSliderPreview, 700);
}

function endSliderPreview() {
  window.clearTimeout(sliderPreviewTimer);
  appearanceControls.classList.remove("is-adjusting");
  appearanceControls.querySelector(".is-active-control")?.classList.remove("is-active-control");
}

const handleSystemThemeChange = () => {
  if (appearanceSettings.theme === "system") {
    applyAppearanceSettings();
  }
};

if (systemThemeQuery?.addEventListener) {
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);
} else if (systemThemeQuery?.addListener) {
  systemThemeQuery.addListener(handleSystemThemeChange);
}

playPause.addEventListener("click", () => {
  if (!audio.src) return;
  if (audio.paused) {
    audio.play().catch(() => status("Playback could not be started."));
  } else {
    audio.pause();
  }
});

skipBack.addEventListener("click", () => {
  if (!audio.src || !audio.duration) return;
  audio.currentTime = Math.max(0, audio.currentTime - 10);
  updateProgress();
});

skipForward.addEventListener("click", () => {
  if (!audio.src || !audio.duration) return;
  audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  updateProgress();
});

readModeToggle.addEventListener("click", () => {
  if (app.dataset.media === "text") return;
  setReadMode(!isReadMode);
});

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target.isContentEditable) return;
  if (app.dataset.view !== "reader") return;

  switch (event.key) {
    case "ArrowLeft":
      if (!audio.src) return;
      event.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      updateProgress();
      break;
    case "ArrowRight":
      if (!audio.src) return;
      event.preventDefault();
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
      updateProgress();
      break;
    case " ":
      event.preventDefault();
      if (!audio.src) return;
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      break;
  }
});

playbackRateButton.addEventListener("click", () => {
  setSpeedMenuOpen(speedMenu.hidden);
});

speedMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-rate]");
  if (!option) return;
  setPlaybackRate(Number(option.dataset.rate));
  setSpeedMenuOpen(false);
  playbackRateButton.focus();
});

speedMenu.addEventListener("keydown", (event) => {
  const currentIndex = speedOptions.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % speedOptions.length;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + speedOptions.length) % speedOptions.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = speedOptions.length - 1;
  if (nextIndex === currentIndex) return;
  event.preventDefault();
  speedOptions[nextIndex].focus();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".speed-control")) setSpeedMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !speedMenu.hidden) {
    setSpeedMenuOpen(false);
    playbackRateButton.focus();
  }
  if (event.key === "Escape" && !wordPopover.hidden) {
    const returnFocus = selectedWordButton;
    hideWordPopover();
    returnFocus?.focus();
  }
});

audio.addEventListener("play", () => {
  playIcon.innerHTML = PAUSE_ICON;
  playPause.setAttribute("aria-label", "Pause");
  setMediaSessionPlaybackState("playing");
  tick();
});

audio.addEventListener("pause", () => {
  playIcon.innerHTML = PLAY_ICON;
  playPause.setAttribute("aria-label", "Play");
  cancelAnimationFrame(rafId);
  setMediaSessionPlaybackState("paused");
  updateProgress();
});

audio.addEventListener("loadedmetadata", () => {
  seek.max = audio.duration || 0;
  seek.disabled = false;
  playPause.disabled = false;
  skipBack.disabled = false;
  skipForward.disabled = false;
  durationEl.textContent = formatTime(audio.duration);
  if (words.length && !hasValidTimings(words)) assignApproximateTimes(words);
  applyResumePosition();
  drawWaveform(0);
  updateProgress();
});

audio.addEventListener("canplay", () => {
  applyResumePosition();
});

audio.addEventListener("ended", () => {
  playIcon.innerHTML = PLAY_ICON;
  playPause.setAttribute("aria-label", "Play");
  saveActiveProgress(true);
  setMediaSessionPlaybackState("paused");
  updateProgress();
});

seek.addEventListener("input", () => {
  audio.currentTime = Number(seek.value);
  saveActiveProgress(true);
  updateProgress();
});

const mediaSession = "mediaSession" in navigator ? navigator.mediaSession : null;

if (mediaSession) {
  const guardedAction = (handler) => () => {
    if (!audio.src || !audio.duration) return;
    handler();
  };
  const actionHandlers = {
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    stop: () => audio.pause(),
    seekbackward: guardedAction(() => {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      updateProgress();
    }),
    seekforward: guardedAction(() => {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
      updateProgress();
    }),
    seekto: (details) => {
      if (!audio.src || !audio.duration) return;
      if (typeof details?.seekTime !== "number" || !Number.isFinite(details.seekTime)) return;
      audio.currentTime = Math.min(Math.max(0, details.seekTime), audio.duration);
      updateProgress();
    }
  };
  for (const [action, handler] of Object.entries(actionHandlers)) {
    try {
      mediaSession.setActionHandler(action, handler);
    } catch {
      // Some actions are unsupported on certain platforms; skip only those.
    }
  }
}

function coverMimeType(src) {
  const extension = String(src).split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[extension] || "";
}

function updateMediaSession(track) {
  if (!mediaSession || typeof MediaMetadata === "undefined") return;
  if (!track) {
    mediaSession.metadata = null;
    return;
  }
  let artwork = [];
  if (track.cover) {
    const type = coverMimeType(track.cover);
    artwork = [{
      src: new URL(track.cover, document.baseURI).href,
      sizes: "848x1264",
      ...(type ? { type } : {})
    }];
  }
  mediaSession.metadata = new MediaMetadata({
    title: track.title || "",
    artist: track.author || "",
    album: "Spanish Listening Reader",
    artwork
  });
}

function setMediaSessionPlaybackState(state) {
  try {
    mediaSession.playbackState = state;
  } catch {
    // playbackState assignment is optional.
  }
}

reader.addEventListener("click", (event) => {
  const target = event.target.closest(".word");
  if (!target) return;
  event.stopPropagation();
  setWordTabStop(target);
  showDefinition(words[Number(target.dataset.index)], target);
});

reader.addEventListener("keydown", (event) => {
  const target = event.target.closest(".word");
  if (!target || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const next = reader.querySelector(`[data-index="${Number(target.dataset.index) + offset}"]`);
  if (next) {
    setWordTabStop(next);
    next.focus();
  }
});

document.addEventListener("click", (event) => {
  if (wordPopover.hidden) return;
  if (wordPopover.contains(event.target) || event.target.closest(".word")) return;
  hideWordPopover();
});

window.addEventListener("resize", () => {
  if (selectedWordButton && !wordPopover.hidden) positionWordPopover(selectedWordButton);
});

window.addEventListener("pagehide", () => saveActiveProgress(true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveActiveProgress(true);
});

function setAudioSource(src, message) {
  audio.pause();
  words = [];
  cancelResumeRetry();
  vocabWarmupItemCount = 0;
  if (vocabWarmup) vocabWarmup.hidden = true;
  setSavedTranslationBlocks([]);
  reader.replaceChildren();
  hideWordPopover();
  definition.innerHTML = `<p class="muted">Tap a word for an English meaning.</p>`;
  audio.src = src;
  audio.playbackRate = appearanceSettings.playbackRate;
  audio.load();
  seek.value = "0";
  seek.max = "0";
  seek.disabled = true;
  playPause.disabled = true;
  skipBack.disabled = true;
  skipForward.disabled = true;
  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";
  currentWordIndex = -1;
  readWordCount = -1;
  status(message);
}

async function loadLibrary() {
  try {
    const response = await fetch("library.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No library");
    const library = await response.json();
    if (!Array.isArray(library)) throw new Error("Invalid library");
    tracks = library
      .filter((track) => track.audio || track.text || track.transcript)
      .map((track) => ({
        ...track,
        id: track.id || track.audio || track.text || track.transcript,
        title: track.title || track.audio || track.text || track.transcript,
        difficulty: difficultyOrder.includes(track.difficulty) ? track.difficulty : "C1",
        collection: collectionOptions.includes(track.collection) && track.collection !== "all" ? track.collection : "stories",
        minutes: Number(track.minutes) || 0
      }));
    renderTrackList();
  } catch {
    trackList.innerHTML = `<p class="muted">No hosted readings found. Add audio files and run <code>python3 scripts/build_library.py</code>.</p>`;
  }
}

async function initialize() {
  await Promise.all([loadLibrary(), loadSharedGlossary()]);
  const routeId = safeDecodeHash();
  const routeTrack = tracks.find((track) => track.id === routeId);
  if (routeTrack) {
    await loadTrack(routeTrack, false);
  }
}

async function loadSharedGlossary() {
  try {
    const response = await fetch("glossary/shared.json");
    if (!response.ok) return;
    const glossary = await response.json();
    if (glossary && typeof glossary === "object" && !Array.isArray(glossary)) sharedGlossary = glossary;
  } catch {
    sharedGlossary = {};
  }
}

async function loadTrack(track, updateHistory = true) {
  audio.pause();
  saveActiveProgress(true);
  const loadId = ++trackLoadId;
  activeTrackId = track.id;
  activeAudioSource = track.audio || "";
  const savedProgress = progressCache[activeTrackId];
  pendingResumeTime = savedProgress?.time || 0;
  if (track.audio && savedProgress?.duration && savedProgress.time / savedProgress.duration >= 0.97) {
    pendingResumeTime = 0;
  }
  const resumeAt = track.audio ? pendingResumeTime : 0;
  appTitle.textContent = track.title;
  renderReadingMeta(track);
  updateMediaSession(track);
  showReader();
  if (updateHistory && location.hash.slice(1) !== encodeURIComponent(track.id)) {
    history.pushState({ trackId: track.id }, "", `#${encodeURIComponent(track.id)}`);
  }
  app.dataset.media = track.audio ? "audio" : "text";
  setReadMode(!track.audio);
  if (track.audio) {
    setAudioSource(track.audio, `${track.title} loaded.`);
  } else {
    clearAudioSource();
    status(`Opening ${track.title}…`);
  }
  renderTrackList();

  const transcriptPath = track.audio ? track.transcript : (track.text || track.transcript);
  if (!transcriptPath) {
    words = [];
    reader.replaceChildren();
    status(`${track.title} has no transcript yet.`);
    return;
  }

  try {
    const [response, savedBlocks] = await Promise.all([
      fetch(transcriptPath),
      loadSavedTrackTranslation(track)
    ]);
    if (!response.ok) throw new Error("Transcript not found");
    const text = await response.text();
    if (loadId !== trackLoadId || activeTrackId !== track.id) return;
    setSavedTranslationBlocks(savedBlocks);
    const parsed = parseTranscript(track.text ? stripCatalogTextHeader(text, track) : text, transcriptPath);
    const precise = Boolean(track.audio) && hasValidTimings(parsed);
    setWords(parsed, precise);
    if (track.audio) {
      const resumeMessage = resumeAt > 0 ? ` Resuming at ${formatTime(resumeAt)}.` : "";
      status(`${track.title} loaded with ${parsed.length.toLocaleString()} synced words.${resumeMessage}`);
    } else {
      status(`${track.title} · ${parsed.length.toLocaleString()} words · about ${track.minutes || readingMinutes(parsed.length)} min to read.`);
    }
  } catch {
    if (loadId !== trackLoadId || activeTrackId !== track.id) return;
    status(`${track.title} loaded, but its transcript could not be loaded.`);
  }
}

async function loadSavedTrackTranslation(track) {
  if (!track.englishTranslation) return [];
  try {
    const response = await fetch(track.englishTranslation);
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.trackId !== track.id || !Array.isArray(payload.blocks)) return [];
    return payload.blocks;
  } catch {
    return [];
  }
}

function setSavedTranslationBlocks(blocks) {
  savedTranslationBlocks = Array.isArray(blocks) ? blocks : [];
  savedTranslationLookup = new Map();
  for (const block of savedTranslationBlocks) {
    const source = String(block?.source || "").trim();
    const translation = String(block?.translation || "").trim();
    if (!source || !translation) continue;
    savedTranslationLookup.set(normalizedTranslationSource(source), translation);

    const sourceSentences = splitTranslationSentences(source);
    if (sourceSentences.length < 2) continue;
    const translatedSentences = fitTranslationSentences(translation, sourceSentences);
    sourceSentences.forEach((sentence, index) => {
      if (translatedSentences[index]) {
        savedTranslationLookup.set(normalizedTranslationSource(sentence), translatedSentences[index]);
      }
    });
  }
}

function clearAudioSource() {
  activeTrackId && saveActiveProgress(true);
  cancelResumeRetry();
  audio.removeAttribute("src");
  audio.load();
  words = [];
  vocabWarmupItemCount = 0;
  if (vocabWarmup) vocabWarmup.hidden = true;
  setSavedTranslationBlocks([]);
  reader.replaceChildren();
  hideWordPopover();
  definition.innerHTML = `<p class="muted">Tap a word for an English meaning.</p>`;
  updateMediaSession(null);
  pendingResumeTime = 0;
  currentWordIndex = -1;
  readWordCount = -1;
  seek.value = "0";
  seek.max = "0";
  seek.disabled = true;
  playPause.disabled = true;
  skipBack.disabled = true;
  skipForward.disabled = true;
  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";
  drawWaveform(0);
}

function showLibrary(updateHistory = true) {
  audio.pause();
  saveActiveProgress(true);
  app.dataset.view = "library";
  document.title = "Spanish Listening Reader";
  if (updateHistory && location.hash) {
    history.pushState({}, "", `${location.pathname}${location.search}`);
  }
  hideWordPopover();
  renderTrackList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showReader() {
  app.dataset.view = "reader";
  document.title = appTitle.textContent ? `${appTitle.textContent} · Spanish Listening Reader` : "Spanish Listening Reader";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setReadMode(enabled) {
  isReadMode = enabled;
  app.dataset.mode = enabled ? "read" : "listen";
  readModeToggle.setAttribute("aria-pressed", String(enabled));
  readModeToggle.setAttribute("aria-label", enabled ? "Switch to listening mode" : "Switch to reading mode");
  readModeToggle.title = enabled ? "Listen with highlighting" : "Read without listening";
  if (readModeLabel) readModeLabel.textContent = enabled ? "" : "Read";
  if (enabled) audio.pause();
}

function renderReadingMeta(track) {
  readingMeta.replaceChildren();
  const facts = document.createElement("div");
  facts.className = "reading-facts";
  for (const value of [track.difficulty, track.author, track.genre, track.minutes ? `${track.minutes} min` : ""]) {
    if (!value) continue;
    const span = document.createElement("span");
    span.textContent = value;
    facts.append(span);
  }
  readingMeta.append(facts);
  if (track.difficultyNote) {
    const note = document.createElement("p");
    note.textContent = track.difficultyNote;
    readingMeta.append(note);
  }
  if (String(track.source || "").startsWith("https://")) {
    const source = document.createElement("a");
    source.href = track.source;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "Source & rights";
    source.title = track.rights || "Source edition";
    readingMeta.append(source);
  }
  readingMeta.hidden = false;
}

function renderTrackList() {
  trackList.replaceChildren();
  if (!tracks.length) {
    trackList.innerHTML = `<p class="muted">No hosted readings found.</p>`;
    catalogSummary.textContent = "No readings available";
    return;
  }

  const query = normalizeSearch(catalogSettings.search);
  const visibleTracks = tracks
    .filter((track) => {
      if (catalogSettings.collection !== "all" && track.collection !== catalogSettings.collection) return false;
      if (catalogSettings.level !== "all" && track.difficulty !== catalogSettings.level) return false;
      if (catalogSettings.format === "listen" && !track.audio) return false;
      if (catalogSettings.format === "read" && track.audio) return false;
      if (!query) return true;
      return normalizeSearch([
        track.title,
        track.author,
        track.genre,
        track.description,
        track.collection === "bible"
          ? "biblia bible escritura scripture"
          : track.collection === "greek-classics"
            ? "clasicos clásicos griegos grecia greek classics philosophy filosofía mythology mitologia mitología"
            : "cuentos stories relatos",
        ...(Array.isArray(track.tags) ? track.tags : [])
      ].filter(Boolean).join(" ")).includes(query);
    })
    .sort(compareTracks);

  const countLabel = `${visibleTracks.length.toLocaleString()} ${visibleTracks.length === 1 ? "reading" : "readings"}`;
  catalogSummary.textContent = visibleTracks.length === tracks.length ? countLabel : `${countLabel} of ${tracks.length}`;

  if (!visibleTracks.length) {
    trackList.innerHTML = `
      <div class="empty-catalog">
        <h2>No readings match</h2>
        <p>Try another title, format, or reading level.</p>
        <button type="button" data-clear-catalog>Clear filters</button>
      </div>`;
    return;
  }

  const groups = catalogSettings.sort === "difficulty"
    ? difficultyOrder.map((level) => [level, visibleTracks.filter((track) => track.difficulty === level)]).filter(([, items]) => items.length)
    : [["results", visibleTracks]];

  const fragment = document.createDocumentFragment();
  const showingDefaultCatalog = !query
    && catalogSettings.level === "all"
    && catalogSettings.collection === "all"
    && catalogSettings.format === "all"
    && catalogSettings.sort === "difficulty";
  const continueTracks = showingDefaultCatalog
    ? tracks
        .filter((track) => {
          const saved = progressCache[track.id];
          return track.audio && saved?.time > 0 && saved?.duration > 0 && saved.time / saved.duration < 0.97;
        })
        .sort((a, b) => Date.parse(progressCache[b.id].updatedAt || 0) - Date.parse(progressCache[a.id].updatedAt || 0))
        .slice(0, 3)
    : [];
  if (continueTracks.length) {
    const section = document.createElement("section");
    section.className = "continue-group";
    const heading = document.createElement("header");
    heading.className = "difficulty-heading";
    heading.innerHTML = `<div><h2>Continue listening</h2></div><p>Your latest ${continueTracks.length === 1 ? "story" : "stories"}</p>`;
    const grid = document.createElement("div");
    grid.className = "track-grid";
    for (const track of continueTracks) grid.append(createTrackCard(track));
    section.append(heading, grid);
    fragment.append(section);
  }
  for (const [level, groupTracks] of groups) {
    const section = document.createElement("section");
    section.className = "difficulty-group";
    if (level !== "results") {
      const heading = document.createElement("header");
      heading.className = "difficulty-heading";
      heading.innerHTML = `
        <div>
          <span class="level-mark">${escapeHtml(level)}</span>
          <h2>${escapeHtml(difficultyLabels[level])}</h2>
        </div>
        <p>${difficultyDescription(level)} · ${groupTracks.length} ${groupTracks.length === 1 ? "story" : "stories"}</p>`;
      section.append(heading);
    }
    const grid = document.createElement("div");
    grid.className = "track-grid";
    for (const track of groupTracks) grid.append(createTrackCard(track));
    section.append(grid);
    fragment.append(section);
  }
  trackList.append(fragment);
}

function createTrackCard(track) {
    const saved = progressCache[track.id] || {};
    const percent = saved.duration ? Math.min(100, Math.round((saved.time / saved.duration) * 100)) : 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `track-card${track.id === activeTrackId ? " active" : ""}`;
    button.dataset.trackId = track.id;
    if (track.id === activeTrackId) button.setAttribute("aria-current", "true");
    button.style.setProperty("--progress", `${percent}%`);
    const formatLabel = track.audio ? "Listen & read" : "Read";
    const timeLabel = track.minutes ? `${track.minutes} min` : "Short read";
    button.innerHTML = `
      <div class="track-cover-wrapper">
        <div class="track-cover" aria-hidden="true">
          ${track.cover
            ? `<img src="${escapeHtml(track.cover)}" alt="" width="848" height="1264" loading="lazy" decoding="async">`
            : `<div class="track-cover-placeholder"><span>${escapeHtml(track.title)}</span></div>`}
        </div>
        <span class="track-progress" aria-hidden="true"><span></span></span>
      </div>
      <div class="track-info">
        <span class="track-badges"><span class="level-badge">${escapeHtml(track.difficulty)}</span><span>${formatLabel}</span><span>${timeLabel}</span></span>
        <span class="track-title">${escapeHtml(track.title)}</span>
        ${track.author ? `<span class="track-author">${escapeHtml(track.author)}</span>` : ""}
        ${track.description ? `<span class="track-description">${escapeHtml(track.description)}</span>` : ""}
        <span class="track-progress-label">${track.audio ? progressLabel(saved) : "Ready to read"}</span>
      </div>
    `;
    const coverImage = button.querySelector(".track-cover img");
    coverImage?.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      const title = document.createElement("span");
      placeholder.className = "track-cover-placeholder";
      title.textContent = track.title;
      placeholder.append(title);
      coverImage.parentElement?.replaceChildren(placeholder);
    }, { once: true });
    return button;
}

function compareTracks(a, b) {
  if (catalogSettings.sort === "length") return (a.minutes || 999) - (b.minutes || 999) || compareTitle(a, b);
  if (catalogSettings.sort === "author") return String(a.author || "").localeCompare(String(b.author || ""), "es") || compareTitle(a, b);
  if (catalogSettings.sort === "title") return compareTitle(a, b);
  return difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty) || compareTitle(a, b);
}

function compareTitle(a, b) {
  return String(a.title).localeCompare(String(b.title), "es", { sensitivity: "base" });
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function safeDecodeHash() {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function difficultyDescription(level) {
  return {
    A2: "Brief, approachable language",
    B1: "Familiar narration with some literary vocabulary",
    B2: "Layered prose and a broader vocabulary",
    C1: "Dense, historical, or stylistically demanding"
  }[level] || "Unrated";
}

function readingMinutes(wordCount) {
  return Math.max(1, Math.round(Number(wordCount || 0) / 180));
}

function updateLevelFilters() {
  levelFilters.forEach((button) => {
    const selected = button.dataset.level === catalogSettings.level;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function selectCollection(collection) {
  catalogSettings.collection = collectionOptions.includes(collection) ? collection : "all";
  saveCatalogSettings();
  updateCollectionTabs();
  renderTrackList();
}

function updateCollectionTabs() {
  collectionTabs.forEach((button) => {
    const selected = button.dataset.collection === catalogSettings.collection;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) trackList.setAttribute("aria-labelledby", button.id);
  });
}

function loadCatalogSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("reader-catalog-v1") || "{}");
    return {
      search: String(saved.search || ""),
      format: ["all", "listen", "read"].includes(saved.format) ? saved.format : "all",
      sort: ["difficulty", "title", "author", "length"].includes(saved.sort) ? saved.sort : "difficulty",
      level: ["all", ...difficultyOrder].includes(saved.level) ? saved.level : "all",
      collection: collectionOptions.includes(saved.collection) ? saved.collection : "all"
    };
  } catch {
    return { search: "", format: "all", sort: "difficulty", level: "all", collection: "all" };
  }
}

function saveCatalogSettings() {
  try {
    localStorage.setItem("reader-catalog-v1", JSON.stringify(catalogSettings));
  } catch {
    // Catalog preferences are optional when storage is unavailable.
  }
}

function setWords(nextWords, precise) {
  words = nextWords.map((word, index) => ({ ...word, index }));
  if (!precise) {
    words.forEach((word) => {
      word.start = Number.NaN;
      word.end = Number.NaN;
    });
    assignApproximateTimes(words);
  }
  currentWordIndex = -1;
  readWordCount = -1;
  renderWords();
  renderVocabWarmup();
  updateProgress();
}

function parseTranscript(text, name) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lower = name.toLowerCase();
  if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonTranscript(trimmed);
  }
  if (lower.endsWith(".vtt") || lower.endsWith(".srt") || trimmed.includes("-->")) {
    return parseCueTranscript(trimmed);
  }
  return tokenizeUntimed(trimmed);
}

function stripCatalogTextHeader(text, track) {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines[0]?.trim() === track.title && lines[1]?.trim() === track.author && !lines[2]?.trim()) {
    return lines.slice(3).join("\n");
  }
  return text;
}

function parseJsonTranscript(text) {
  const data = JSON.parse(text);
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data.words)
      ? data.words
      : Array.isArray(data.segments)
        ? data.segments.flatMap((segment) => segment.words || wordsFromSegment(segment))
        : [];

  return source
    .map((item) => ({
      text: String(item.word ?? item.text ?? "").trim(),
      start: toSeconds(item.start ?? item.startTime),
      end: toSeconds(item.end ?? item.endTime),
      translation: item.translation ?? item.meaning ?? ""
    }))
    .filter((item) => item.text);
}

function wordsFromSegment(segment) {
  const tokens = tokenizeUntimed(segment.text || "");
  const start = toSeconds(segment.start);
  const end = toSeconds(segment.end);
  const span = Math.max(0.05, (end - start) / Math.max(1, tokens.length));
  return tokens.map((token, index) => ({
    word: token.text,
    start: start + index * span,
    end: start + (index + 1) * span
  }));
}

function parseCueTranscript(text) {
  const clean = text.replace(/\r/g, "");
  const blocks = clean
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const parsed = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() && line.trim() !== "WEBVTT");
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) continue;
    const timingIndex = lines.indexOf(timingLine);
    const [rawStart, rawEnd] = timingLine.split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);
    const cueText = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "");
    const cueWords = tokenizeUntimed(cueText);
    const span = Math.max(0.05, (end - start) / Math.max(1, cueWords.length));
    cueWords.forEach((word, index) => {
      parsed.push({
        ...word,
        start: start + index * span,
        end: start + (index + 1) * span
      });
    });
  }

  return parsed;
}

function tokenizeUntimed(text) {
  const matches = text.matchAll(/[\p{L}\p{M}\d]+(?:['’][\p{L}\p{M}\d]+)?|[^\p{L}\p{M}\d]+/gu);
  const parsed = [];
  for (const match of matches) {
    const token = match[0];
    if (/^[\p{L}\p{M}\d]/u.test(token)) {
      parsed.push({ text: token, separator: "" });
    } else if (parsed.length) {
      parsed[parsed.length - 1].separator += token;
    }
  }
  return parsed;
}

function assignApproximateTimes(list) {
  if (!audio.duration || !Number.isFinite(audio.duration) || !list.length) return;
  const weightedTotal = list.reduce((sum, word) => sum + wordWeight(word.text), 0);
  let cursor = 0;
  for (const word of list) {
    const duration = audio.duration * (wordWeight(word.text) / weightedTotal);
    word.start = cursor;
    word.end = cursor + duration;
    cursor = word.end;
  }
}

function wordWeight(text) {
  return Math.max(0.7, Math.min(2.8, text.length / 4));
}

function renderWords() {
  translationRenderId += 1;
  const renderId = translationRenderId;
  translationObserver?.disconnect();
  translationObserver = null;
  reader.replaceChildren();
  hideWordPopover();
  const fragment = document.createDocumentFragment();
  const bilingual = appearanceSettings.translationLayout !== "spanish-only";
  const translationTargets = [];
  const translationSources = [];
  currentWordIndex = -1;
  readWordCount = -1;
  let pair = createReadingPair();
  let paragraph = pair.spanish;
  let paragraphText = "";
  let sentenceCount = 0;
  let blockIndex = 0;
  const sentencesPerPair = appearanceSettings.translationLayout === "english-below" ? 1 : 4;

  words.forEach((word, index) => {
    const span = document.createElement("button");
    span.type = "button";
    span.className = "word";
    span.dataset.index = String(index);
    span.tabIndex = index === 0 ? 0 : -1;
    span.textContent = word.text;
    paragraph.append(span);
    const separator = word.separator || " ";
    paragraph.append(document.createTextNode(separator));
    paragraphText += `${word.text}${separator}`;

    if (/[.!?…]["')\]»”]*\s*$/.test(`${word.text}${separator}`)) {
      sentenceCount += 1;
    }
    if (sentenceCount >= sentencesPerPair && index < words.length - 1) {
      finishReadingPair(pair, paragraphText, bilingual, translationTargets, translationSources, fragment, blockIndex);
      blockIndex += 1;
      pair = createReadingPair();
      paragraph = pair.spanish;
      paragraphText = "";
      sentenceCount = 0;
    }
  });
  if (paragraph.childNodes.length) {
    finishReadingPair(pair, paragraphText, bilingual, translationTargets, translationSources, fragment, blockIndex);
  }
  reader.append(fragment);
  reader.classList.toggle("has-translation", bilingual);
  reader.classList.toggle("is-side-by-side", appearanceSettings.translationLayout === "side-by-side");

  if (bilingual) {
    translationTargets.forEach((target, index) => {
      target.before = translationSources[target.blockIndex - 1] || "";
      target.after = translationSources[target.blockIndex + 1] || "";
    });
    observeTranslationTargets(translationTargets, renderId);
  }
}

function createReadingPair() {
  const container = document.createElement("section");
  container.className = "translation-pair";
  const spanish = document.createElement("p");
  spanish.className = "spanish-text";
  spanish.lang = "es";
  container.append(spanish);
  return { container, spanish };
}

function finishReadingPair(pair, sourceText, bilingual, targets, sources, fragment, blockIndex) {
  const source = sourceText.trim();
  sources.push(source);
  if (bilingual) {
    const english = document.createElement("p");
    english.className = "english-translation";
    english.lang = "en";
    const savedTranslation = savedTranslationLookup.get(normalizedTranslationSource(source));
    if (savedTranslation) {
      english.textContent = savedTranslation;
      english.setAttribute("aria-busy", "false");
    } else {
      english.classList.add("is-loading");
      english.setAttribute("aria-busy", "true");
      english.innerHTML = `<span class="translation-placeholder">Translating…</span>`;
      targets.push({ element: english, source, blockIndex });
    }
    pair.container.append(english);
  }
  fragment.append(pair.container);
}

function normalizedTranslationSource(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitTranslationSentences(value) {
  const text = normalizedTranslationSource(value);
  if (!text) return [];
  return (text.match(/[^.!?…]+(?:[.!?…]+["')\]»”]*|$)/g) || [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function fitTranslationSentences(translation, sourceSentences) {
  let sentences = splitTranslationSentences(translation);
  const desiredCount = sourceSentences.length;
  if (desiredCount < 1 || !sentences.length) return [];

  while (sentences.length < desiredCount) {
    const splitIndex = sentences.reduce(
      (longest, sentence, index) => sentence.length > sentences[longest].length ? index : longest,
      0
    );
    const parts = splitTranslationSentence(sentences[splitIndex]);
    if (parts.length < 2) break;
    sentences.splice(splitIndex, 1, ...parts);
  }

  if (sentences.length > desiredCount) {
    const sourceLengths = sourceSentences.map(s => s.length);
    const sourceTotal = sourceLengths.reduce((a, b) => a + b, 0);
    const targetLengths = sentences.map(s => s.length);
    const targetTotal = targetLengths.reduce((a, b) => a + b, 0);

    function getPartitions(arr, k) {
      if (k === 1) return [[arr]];
      if (arr.length === k) return [arr.map(x => [x])];
      if (arr.length < k) return [];
      
      const partitions = [];
      for (let i = 1; i <= arr.length - k + 1; i++) {
        const firstGroup = arr.slice(0, i);
        const rest = arr.slice(i);
        const subPartitions = getPartitions(rest, k - 1);
        for (const sub of subPartitions) {
          partitions.push([firstGroup, ...sub]);
        }
      }
      return partitions;
    }

    while (sentences.length - desiredCount > 10) {
      let mergeIndex = 0;
      let shortestPair = Number.POSITIVE_INFINITY;
      for (let index = 0; index < sentences.length - 1; index += 1) {
        const pairLength = sentences[index].length + sentences[index + 1].length;
        if (pairLength < shortestPair) {
          shortestPair = pairLength;
          mergeIndex = index;
        }
      }
      sentences.splice(mergeIndex, 2, `${sentences[mergeIndex]} ${sentences[mergeIndex + 1]}`);
    }

    const partitions = getPartitions(sentences, desiredCount);
    let bestCost = Infinity;
    let bestPartition = null;

    for (const p of partitions) {
      let cost = 0;
      for (let i = 0; i < desiredCount; i++) {
        const groupLength = p[i].reduce((sum, s) => sum + s.length, 0);
        const sRatio = sourceLengths[i] / sourceTotal;
        const tRatio = groupLength / targetTotal;
        cost += Math.pow(sRatio - tRatio, 2);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestPartition = p;
      }
    }

    if (bestPartition) {
      sentences = bestPartition.map(group => group.join(' '));
    }
  }

  return sentences;
}

function splitTranslationSentence(sentence) {
  const candidates = [...sentence.matchAll(/[,;:—–]\s+/g)]
    .map((match) => match.index + match[0].length)
    .filter((index) => index > sentence.length * 0.25 && index < sentence.length * 0.75);
  let splitAt = candidates.sort((a, b) => Math.abs(a - sentence.length / 2) - Math.abs(b - sentence.length / 2))[0];
  if (!splitAt) {
    const spaces = [...sentence.matchAll(/\s+/g)]
      .map((match) => match.index + match[0].length)
      .filter((index) => index > sentence.length * 0.3 && index < sentence.length * 0.7);
    splitAt = spaces.sort((a, b) => Math.abs(a - sentence.length / 2) - Math.abs(b - sentence.length / 2))[0];
  }
  if (!splitAt) return [sentence];
  return [sentence.slice(0, splitAt).trim(), sentence.slice(splitAt).trim()].filter(Boolean);
}

function observeTranslationTargets(targets, renderId) {
  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => loadReadingTranslation(target, renderId));
    return;
  }

  const sources = new WeakMap(targets.map((target) => [target.element, target]));
  translationObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const target = sources.get(entry.target);
      if (target) loadReadingTranslation(target, renderId);
    });
  }, { rootMargin: "500px 0px" });
  targets.forEach((target) => translationObserver.observe(target.element));
}

async function loadReadingTranslation(target, renderId) {
  const { element, source, before = "", after = "" } = target;
  element.classList.add("is-loading");
  element.classList.remove("has-error");
  element.setAttribute("aria-busy", "true");
  element.innerHTML = `<span class="translation-placeholder">Translating…</span>`;
  try {
    const translated = await translateReadingText(source, before, after);
    if (renderId !== translationRenderId || !element.isConnected) return;
    element.textContent = translated;
    element.classList.remove("is-loading");
    element.setAttribute("aria-busy", "false");
  } catch {
    if (renderId !== translationRenderId || !element.isConnected) return;
    element.classList.remove("is-loading");
    element.classList.add("has-error");
    element.setAttribute("aria-busy", "false");
    element.innerHTML = `<span>Translation unavailable.</span> <button type="button" class="translation-retry">Retry</button>`;
    element.querySelector(".translation-retry")?.addEventListener("click", () => {
      loadReadingTranslation(target, renderId);
    });
  }
}

async function translateReadingText(source, outerBefore = "", outerAfter = "") {
  const chunks = splitTranslationText(source, 300);
  const translated = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const before = [outerBefore, ...chunks.slice(0, index)].filter(Boolean).join(" ");
    const after = [...chunks.slice(index + 1), outerAfter].filter(Boolean).join(" ");
    const contextualRequest = buildContextualTranslationRequest(escapeHtml(chunk), before, after, "b");
    translated.push(await fetchTranslation(contextualRequest, {
      targetTag: "b",
      fallbackText: chunk
    }));
  }
  return translated.join(" ");
}

function splitTranslationText(text, maxBytes) {
  const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) continue;
    const combined = current ? `${current} ${cleanSentence}` : cleanSentence;
    if (utf8ByteLength(combined) <= maxBytes) {
      current = combined;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    if (utf8ByteLength(cleanSentence) <= maxBytes) {
      current = cleanSentence;
      continue;
    }
    const sentenceChunks = splitTextByBytes(cleanSentence, maxBytes);
    chunks.push(...sentenceChunks.slice(0, -1));
    current = sentenceChunks.at(-1) || "";
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitTextByBytes(text, maxBytes) {
  const chunks = [];
  let current = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && utf8ByteLength(candidate) > maxBytes) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildContextualTranslationRequest(targetHTML, beforeText, afterText, targetTag) {
  const beforeWords = beforeText.trim().split(/\s+/).filter(Boolean);
  const afterWords = afterText.trim().split(/\s+/).filter(Boolean);
  const prefix = [];
  const suffix = [];
  const markedTarget = `<${targetTag}>${targetHTML}</${targetTag}>`;
  let canAddBefore = true;
  let canAddAfter = true;

  const compose = (nextPrefix = prefix, nextSuffix = suffix) => [
    nextPrefix.length ? escapeHtml(nextPrefix.join(" ")) : "",
    markedTarget,
    nextSuffix.length ? escapeHtml(nextSuffix.join(" ")) : ""
  ].filter(Boolean).join(" ");

  while ((beforeWords.length && canAddBefore) || (afterWords.length && canAddAfter)) {
    if (beforeWords.length && canAddBefore) {
      const word = beforeWords.pop();
      const nextPrefix = [word, ...prefix];
      if (utf8ByteLength(compose(nextPrefix, suffix)) <= 480) prefix.unshift(word);
      else canAddBefore = false;
    }
    if (afterWords.length && canAddAfter) {
      const word = afterWords.shift();
      const nextSuffix = [...suffix, word];
      if (utf8ByteLength(compose(prefix, nextSuffix)) <= 480) suffix.push(word);
      else canAddAfter = false;
    }
  }
  return compose();
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function tick() {
  updateProgress();
  rafId = requestAnimationFrame(tick);
}

function updateProgress() {
  const duration = audio.duration || 0;
  const current = audio.currentTime || 0;
  seek.value = String(current);
  currentTimeEl.textContent = formatTime(current);
  durationEl.textContent = formatTime(duration);
  seek.setAttribute("aria-valuetext", `${formatTime(current)} of ${formatTime(duration)}`);
  drawWaveform(duration ? current / duration : 0);
  updateCurrentWord(current);
  saveActiveProgress(false);
}

function updateCurrentWord(time) {
  if (!words.length) return;
  if (isReadMode) return;
  const index = findWordAt(time);
  const endedCount = countEndedWords(time);
  if (index === currentWordIndex && endedCount === readWordCount) return;
  if (currentWordIndex >= 0) reader.querySelector(`[data-index="${currentWordIndex}"]`)?.classList.remove("current");
  const firstChanged = Math.max(0, Math.min(readWordCount < 0 ? 0 : readWordCount, endedCount));
  const lastChanged = Math.max(readWordCount, endedCount);
  for (let wordIndex = firstChanged; wordIndex < lastChanged; wordIndex += 1) {
    reader.querySelector(`[data-index="${wordIndex}"]`)?.classList.toggle("read", wordIndex < endedCount);
  }
  currentWordIndex = index;
  readWordCount = endedCount;
  if (index >= 0) {
    const active = reader.querySelector(`[data-index="${index}"]`);
    active?.classList.add("current");
    active?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }
}

function setWordTabStop(button) {
  reader.querySelector('.word[tabindex="0"]')?.setAttribute("tabindex", "-1");
  button.tabIndex = 0;
}

function findWordAt(time) {
  let low = 0;
  let high = words.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const word = words[mid];
    if (time < word.start) high = mid - 1;
    else if (time >= word.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

function countEndedWords(time) {
  let low = 0;
  let high = words.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (words[mid].end <= time) low = mid + 1;
    else high = mid;
  }
  return low;
}

async function showDefinition(word, anchor) {
  if (!word) return;
  selectedWordButton?.classList.remove("selected");
  selectedWordButton = anchor || null;
  selectedWordButton?.classList.add("selected");
  const requestId = ++definitionRequestId;
  
  const normalized = normalizeWord(word.text);
  const contextHTML = contextSentenceForWord(word.index);
  const contextualRequest = contextualRequestForWord(word.index, contextHTML);
  const instant = sharedGlossary[normalized] || getCachedTranslation(contextualRequest);
  
  if (instant) {
    renderDefinition(contextHTML, instant, anchor, true);
    logStudiedWord(word, instant);
    return;
  }

  renderDefinition(contextHTML, "Looking up...", anchor, true);

  if (word.translation) {
    renderDefinition(contextHTML, word.translation, anchor, true);
    logStudiedWord(word, word.translation);
    return;
  }

  try {
    const translated = await fetchTranslation(contextualRequest, {
      targetTag: "i",
      fallbackText: contextHTML
    });
    if (requestId === definitionRequestId) {
      renderDefinition(contextHTML, translated, anchor, true);
      logStudiedWord(word, translated);
    }
  } catch {
    const spanishDict = `https://www.spanishdict.com/translate/${encodeURIComponent(normalized)}`;
    const wordReference = `https://www.wordreference.com/es/en/translation.asp?spen=${encodeURIComponent(normalized)}`;
    if (requestId !== definitionRequestId) return;
    const fallback = `No automatic result. <a href="${spanishDict}" target="_blank" rel="noreferrer">SpanishDict</a> or <a href="${wordReference}" target="_blank" rel="noreferrer">WordReference</a>.`;
    renderDefinition(contextHTML, fallback, anchor, "trusted");
  }
}

function renderDefinition(word, translation, anchor = selectedWordButton, allowHtml = false) {
  const wordHtml = allowHtml ? word : escapeHtml(word);
  const translationHtml = allowHtml === "trusted"
    ? translation
    : allowHtml
      ? sanitizeEmphasisHtml(translation)
      : escapeHtml(translation);
  const playFromHereBtn = `<button class="play-from-here" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Play from here</button>`;
  const content = `
    <p class="definition-word">${wordHtml}</p>
    <p class="translation">${translationHtml}</p>
    ${playFromHereBtn}
  `;
  definition.innerHTML = content;
  wordPopover.innerHTML = content;
  wordPopover.hidden = false;
  if (anchor) positionWordPopover(anchor);

  const wirePlayFromHere = (container) => {
    const btn = container.querySelector(".play-from-here");
    if (!btn || !selectedWordButton) return;
    const wordIndex = Number(selectedWordButton.dataset.index);
    const wordData = words[wordIndex];
    if (!wordData || !Number.isFinite(wordData.start)) {
      btn.style.display = "none";
      return;
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.currentTime = wordData.start;
      if (isReadMode) setReadMode(false);
      audio.play().catch(() => {});
      hideWordPopover();
    });
  };
  wirePlayFromHere(definition);
  wirePlayFromHere(wordPopover);
}

function positionWordPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(320, window.innerWidth - margin * 2);
  wordPopover.style.width = `${width}px`;
  wordPopover.style.left = "0px";
  wordPopover.style.top = "0px";

  const popoverRect = wordPopover.getBoundingClientRect();
  const desiredLeft = rect.left + rect.width / 2 - width / 2;
  const left = window.scrollX + Math.max(margin, Math.min(desiredLeft, window.innerWidth - width - margin));
  const aboveTop = rect.top - popoverRect.height - 10;
  const belowTop = rect.bottom + 10;
  const viewportTop = aboveTop >= margin ? aboveTop : Math.min(belowTop, window.innerHeight - popoverRect.height - margin);
  const top = window.scrollY + Math.max(margin, viewportTop);

  wordPopover.style.left = `${left}px`;
  wordPopover.style.top = `${top}px`;
  wordPopover.dataset.placement = aboveTop >= margin ? "above" : "below";
}

function hideWordPopover() {
  selectedWordButton?.classList.remove("selected");
  selectedWordButton = null;
  wordPopover.hidden = true;
}

function logStudiedWord(word, meaning) {
  if (!word || !meaning || /looking up/i.test(String(meaning))) return;
  const normalized = normalizeWord(word.text);
  if (!normalized) return;

  const context = contextSentenceForWord(word.index);
  const reading = appTitle.textContent || "Untitled reading";
  const contextText = htmlToText(context);
  const key = `${normalized}\u241f${reading}\u241f${contextText}`;
  const previous = studyLog[key] || {};
  studyLog[key] = {
    word: word.text,
    normalized,
    meaning: htmlToText(meaning),
    context: contextText,
    reading,
    firstSeenAt: previous.firstSeenAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lookupCount: (previous.lookupCount || 0) + 1
  };
  saveStudyLog(studyLog);
  updateStudyControls();
}

function contextSentenceForWord(index) {
  if (!Number.isFinite(index) || !words[index]) return "";
  const { start, end } = contextRangeForWord(index);

  return words
    .slice(start, end + 1)
    .map((word, offset) => {
      const absoluteIndex = start + offset;
      const text = absoluteIndex === index ? `<b>${escapeHtml(word.text)}</b>` : escapeHtml(word.text);
      return `${text}${escapeHtml(word.separator || " ")}`;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function contextRangeForWord(index) {
  let start = index;
  while (start > 0 && start > index - 3 && !endsSentence(words[start - 1])) start -= 1;

  let end = index;
  while (end < words.length - 1 && end < index + 1 && !endsSentence(words[end])) end += 1;

  return { start, end };
}

function contextualRequestForWord(index, targetHTML) {
  const { start, end } = contextRangeForWord(index);
  const before = plainTextForWords(Math.max(0, start - 60), start);
  const after = plainTextForWords(end + 1, Math.min(words.length, end + 61));
  return buildContextualTranslationRequest(targetHTML, before, after, "i");
}

function plainTextForWords(start, end) {
  return words
    .slice(start, end)
    .map((word) => `${word.text}${word.separator || " "}`)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function endsSentence(word) {
  return /[.,:;!?…]["')\]]*\s*$/.test(`${word.text}${word.separator || ""}`);
}

function updateStudyControls() {
  const count = studyEntries().length;
  studyCount.textContent = `${count.toLocaleString()} looked-up ${count === 1 ? "word" : "words"}`;
  downloadAnki.disabled = count === 0;
}

function studyEntries() {
  return Object.entries(studyLog)
    .filter(([, entry]) => entry && typeof entry === "object")
    .sort(([, a], [, b]) => String(a.normalized || a.word).localeCompare(String(b.normalized || b.word), "es"));
}

function downloadableStudyEntries() {
  return studyEntries().filter(([, entry]) => String(entry.word || "").trim() && String(entry.meaning || "").trim());
}

function openAnkiReview() {
  const entries = studyEntries();
  if (!entries.length) return;
  audio.pause();
  ankiCardList.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const [key, entry] of entries) {
    const card = document.createElement("article");
    card.className = "anki-card-editor";
    card.dataset.studyKey = key;
    card.innerHTML = `
      <div class="anki-card-editor-header">
        <strong>${escapeHtml(entry.word || "Untitled word")}</strong>
        <button class="remove-card-button" type="button" data-remove-card aria-label="Remove ${escapeHtml(entry.word || "card")} from Anki export">Remove</button>
      </div>
      <div class="anki-card-fields">
        <label>
          <span>Clicked word</span>
          <input data-field="word" value="${escapeHtml(entry.word || "")}">
        </label>
        <label>
          <span>Translated phrase</span>
          <textarea data-field="meaning" rows="2">${escapeHtml(entry.meaning || "")}</textarea>
        </label>
        <label>
          <span>Spanish context</span>
          <textarea data-field="context" rows="2">${escapeHtml(htmlToText(entry.context))}</textarea>
        </label>
        <label>
          <span>Reading</span>
          <input data-field="reading" value="${escapeHtml(entry.reading || "")}">
        </label>
      </div>
    `;
    fragment.append(card);
  }
  ankiCardList.append(fragment);
  updateAnkiReviewCount();
  ankiDialog.showModal();
}

function updateAnkiReviewCount() {
  const count = studyEntries().length;
  const readyCount = downloadableStudyEntries().length;
  ankiDialogCount.textContent = `${count.toLocaleString()} ${count === 1 ? "card" : "cards"} saved · ${readyCount.toLocaleString()} ready to download`;
  downloadReviewedAnki.disabled = readyCount === 0;
}

function downloadAnkiCards() {
  const entries = downloadableStudyEntries().map(([, entry]) => entry);
  if (!entries.length) return;

  const rows = entries.map((entry) => [
    entry.word,
    entry.meaning,
    htmlToText(entry.context),
    entry.reading
  ].map(tsvField).join("\t"));
  const blob = new Blob([`${rows.join("\n")}\n`], {
    type: "text/tab-separated-values;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spanish-reader-anki-${new Date().toISOString().slice(0, 10)}.tsv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function tsvField(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\t/g, " ")
    .trim();
}

function getCachedTranslation(context) {
  return translationCache[context] || "";
}

async function fetchTranslation(context, options = {}) {
  const cached = getCachedTranslation(context);
  if (cached) return cached;
  if (translationRequests.has(context)) return translationRequests.get(context);

  const request = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(context)}&langpair=es|en`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Lookup failed");
      const data = await response.json();
      const rawTranslation = data?.responseData?.translatedText;
      if (!rawTranslation) throw new Error("No translation returned");
      const decodedTranslation = decodeHtmlEntities(String(rawTranslation));
      let translated = decodedTranslation;
      if (options.targetTag) {
        translated = extractMarkedTranslation(decodedTranslation, options.targetTag);
        if (!translated && options.fallbackText) {
          translated = await fetchTranslation(options.fallbackText);
        }
        if (!translated) throw new Error("Translation target marker was not returned");
      }
      translationCache[context] = translated;
      saveTranslationCache(translationCache);
      return translated;
    } finally {
      window.clearTimeout(timeoutId);
      translationRequests.delete(context);
    }
  })();
  translationRequests.set(context, request);
  return request;
}

function extractMarkedTranslation(value, tagName) {
  const safeTag = String(tagName).replace(/[^a-z0-9]/gi, "");
  if (!safeTag) return "";
  const match = value.match(new RegExp(`<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}>`, "i"));
  return match?.[1]?.trim() || "";
}

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function drawWaveform(progress) {
  const width = canvas.width;
  const height = canvas.height;
  const styles = getComputedStyle(document.documentElement);
  const waveBg = styles.getPropertyValue("--wave-bg").trim() || "#eef3f1";
  const waveDone = styles.getPropertyValue("--wave-done").trim() || "#315fba";
  const waveRest = styles.getPropertyValue("--wave-rest").trim() || "#b8c7c2";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = waveBg;
  ctx.fillRect(0, 0, width, height);

  const bars = 96;
  const gap = 3;
  const barWidth = width / bars - gap;
  for (let i = 0; i < bars; i += 1) {
    const phase = i / bars;
    const amplitude = 0.22 + 0.58 * Math.abs(Math.sin(i * 0.39) * Math.cos(i * 0.17));
    const barHeight = Math.max(8, height * amplitude);
    const x = i * (barWidth + gap);
    const y = (height - barHeight) / 2;
    ctx.fillStyle = phase <= progress ? waveDone : waveRest;
    roundRect(ctx, x, y, barWidth, barHeight, 4);
    ctx.fill();
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function applyResumePosition() {
  if (pendingResumeTime <= 0 || !audio.duration || !Number.isFinite(audio.duration)) return;
  if (resumeRetryTimer) return;
  const target = Math.min(pendingResumeTime, Math.max(0, audio.duration - 1));
  const confirmSeek = () => {
    if (Math.abs(audio.currentTime - target) < 0.75) {
      pendingResumeTime = 0;
      cancelResumeRetry();
    }
  };
  resumeListenerCleanup = () => {
    audio.removeEventListener("seeked", confirmSeek);
    audio.removeEventListener("timeupdate", confirmSeek);
    audio.removeEventListener("canplay", confirmSeek);
  };
  audio.addEventListener("seeked", confirmSeek);
  audio.addEventListener("timeupdate", confirmSeek);
  audio.addEventListener("canplay", confirmSeek);
  audio.currentTime = target;
  // Chromium can drop seeks issued while its media pipeline is still
  // starting up; retry once shortly if the first attempt did not stick.
  resumeRetryTimer = window.setTimeout(() => {
    resumeRetryTimer = 0;
    resumeListenerCleanup?.();
    resumeListenerCleanup = null;
    if (pendingResumeTime > 0 && audio.duration && Number.isFinite(audio.duration)) {
      const retryTarget = Math.min(pendingResumeTime, Math.max(0, audio.duration - 1));
      pendingResumeTime = 0;
      audio.currentTime = retryTarget;
    }
  }, 250);
}

function cancelResumeRetry() {
  window.clearTimeout(resumeRetryTimer);
  resumeRetryTimer = 0;
  resumeListenerCleanup?.();
  resumeListenerCleanup = null;
}

function hasValidTimings(list) {
  let previousStart = -Infinity;
  let previousEnd = -Infinity;
  return list.length > 0 && list.every((word) => {
    const valid = Number.isFinite(word.start)
      && Number.isFinite(word.end)
      && word.start >= previousStart
      && word.end >= previousEnd
      && word.end >= word.start;
    previousStart = word.start;
    previousEnd = word.end;
    return valid;
  });
}

function toSeconds(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  if (/^\d+(\.\d+)?s?$/.test(value)) return Number.parseFloat(value);
  return parseTimestamp(value);
}

function parseTimestamp(value) {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.some(Number.isNaN)) return Number.NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function progressLabel(saved) {
  if (!saved?.time || !saved?.duration) return "Not started";
  const percent = Math.min(100, Math.round((saved.time / saved.duration) * 100));
  if (percent >= 97) return "Completed";
  return `${formatTime(saved.time)} of ${formatTime(saved.duration)} · ${percent}%`;
}

function saveActiveProgress(force) {
  if (app.dataset.media !== "audio" || !activeTrackId || !audio.duration || !Number.isFinite(audio.duration)) return;
  const expectedSource = activeAudioSource ? new URL(activeAudioSource, document.baseURI).href : "";
  if (!expectedSource || audio.currentSrc !== expectedSource) return;
  const now = Date.now();
  if (!force && now - lastProgressSave < 1500) return;
  lastProgressSave = now;

  const time = audio.ended ? audio.duration : audio.currentTime;
  progressCache[activeTrackId] = {
    time: Math.max(0, Math.min(time, audio.duration)),
    duration: audio.duration,
    updatedAt: new Date().toISOString()
  };
  saveProgressCache(progressCache);
  if (app.dataset.view === "library") renderTrackList();
}

function normalizeWord(word) {
  return word.toLocaleLowerCase("es").replace(/[^\p{L}\p{M}\d]/gu, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function sanitizeEmphasisHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value);

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    const fragment = document.createDocumentFragment();
    for (const child of node.childNodes) fragment.append(sanitizeNode(child));
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "B") {
      const bold = document.createElement("b");
      bold.append(fragment);
      return bold;
    }
    return fragment;
  };

  const container = document.createElement("div");
  for (const child of template.content.childNodes) container.append(sanitizeNode(child));
  return container.innerHTML;
}

function htmlToText(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}

function status(message) {
  statusEl.textContent = message;
}

function updateSpeedButton(rate) {
  const label = formatPlaybackRate(rate);
  playbackRateValue.textContent = label;
  playbackRateButton.setAttribute("aria-label", `Playback speed: ${rate} times`);
  speedOptions.forEach((option) => {
    const isSelected = Number(option.dataset.rate) === rate;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
}

function formatPlaybackRate(rate) {
  if (rate === 1 || rate === 2) return `${rate}×`;
  return `${rate.toFixed(2)}×`;
}

function setPlaybackRate(rate) {
  audio.playbackRate = rate;
  appearanceSettings.playbackRate = rate;
  saveAppearanceSettings(appearanceSettings);
  updateSpeedButton(rate);
}

function setSpeedMenuOpen(isOpen) {
  speedMenu.hidden = !isOpen;
  playbackRateButton.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    speedMenu.querySelector(".is-selected")?.focus();
  }
}

function loadTranslationCache() {
  try {
    return JSON.parse(localStorage.getItem("spanish-reader-translations") || "{}");
  } catch {
    return {};
  }
}

function saveTranslationCache(cache) {
  safeSetLocalStorage("spanish-reader-translations", cache);
}

function loadProgressCache() {
  try {
    return JSON.parse(localStorage.getItem("spanish-reader-progress") || "{}");
  } catch {
    return {};
  }
}

function saveProgressCache(cache) {
  safeSetLocalStorage("spanish-reader-progress", cache);
}

function loadStudyLog() {
  try {
    return JSON.parse(localStorage.getItem("spanish-reader-study-log") || "{}");
  } catch {
    return {};
  }
}

function saveStudyLog(log) {
  safeSetLocalStorage("spanish-reader-study-log", log);
}

function loadAppearanceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("spanish-reader-appearance") || "{}");
    const defaults = defaultAppearanceSettings();
    return {
      theme: themeOptions.includes(saved.theme) ? saved.theme : defaults.theme,
      highlight: ["sage", "sky", "rose", "underline", "none"].includes(saved.highlight) ? saved.highlight : defaults.highlight,
      textMode: ["dim-passed", "dim-upcoming"].includes(saved.textMode) ? saved.textMode : defaults.textMode,
      translationLayout: ["spanish-only", "side-by-side", "english-below"].includes(saved.translationLayout) ? saved.translationLayout : defaults.translationLayout,
      textSize: numberInRange(saved.textSize, 80, 140, defaults.textSize),
      lineHeight: numberInRange(saved.lineHeight, 1.4, 2.2, defaults.lineHeight),
      font: ["serif", "sans", "accessible"].includes(saved.font) ? saved.font : defaults.font,
      readerWidth: ["narrow", "standard", "wide"].includes(saved.readerWidth) ? saved.readerWidth : defaults.readerWidth,
      vocabWarmup: ["always", "collapsed", "off"].includes(saved.vocabWarmup) ? saved.vocabWarmup : defaults.vocabWarmup,
      playbackRate: SPEED_RATES.includes(Number(saved.playbackRate)) ? Number(saved.playbackRate) : defaults.playbackRate
    };
  } catch {
    return defaultAppearanceSettings();
  }
}

function defaultAppearanceSettings() {
  return {
    theme: "system",
    highlight: "sage",
    textMode: "dim-passed",
    translationLayout: "spanish-only",
    textSize: 100,
    lineHeight: 1.8,
    font: "serif",
    readerWidth: "standard",
    vocabWarmup: "always",
    playbackRate: 1
  };
}

function numberInRange(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function saveAppearanceSettings(settings) {
  safeSetLocalStorage("spanish-reader-appearance", {
    ...settings,
    version: appearanceSettingsVersion
  });
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Reading remains usable in private mode or when storage is full.
  }
}

function applyAppearanceSettings() {
  document.documentElement.dataset.theme = resolveTheme(appearanceSettings.theme);
  document.documentElement.dataset.highlight = appearanceSettings.highlight;
  document.documentElement.dataset.textMode = appearanceSettings.textMode;
  document.documentElement.dataset.translationLayout = appearanceSettings.translationLayout;
  app.dataset.translationLayout = appearanceSettings.translationLayout;
  document.documentElement.dataset.readerFont = appearanceSettings.font;
  document.documentElement.dataset.readerWidth = appearanceSettings.readerWidth;
  document.documentElement.style.setProperty("--reader-font-size", `${1.6 * appearanceSettings.textSize / 100}rem`);
  document.documentElement.style.setProperty("--reader-line-height", appearanceSettings.lineHeight);
  themeSelect.value = appearanceSettings.theme;
  highlightSelect.value = appearanceSettings.highlight;
  textModeSelect.value = appearanceSettings.textMode;
  translationLayoutSelect.value = appearanceSettings.translationLayout;
  textSize.value = appearanceSettings.textSize;
  textSizeValue.value = `${appearanceSettings.textSize}%`;
  lineHeight.value = appearanceSettings.lineHeight;
  lineHeightValue.value = appearanceSettings.lineHeight.toFixed(1);
  fontSelect.value = appearanceSettings.font;
  readerWidthSelect.value = appearanceSettings.readerWidth;
  if (vocabWarmupSelect) vocabWarmupSelect.value = appearanceSettings.vocabWarmup;
  updateVocabWarmupVisibility();
  updateSpeedButton(appearanceSettings.playbackRate);
  audio.playbackRate = appearanceSettings.playbackRate;
  drawWaveform(audio.duration ? (audio.currentTime || 0) / audio.duration : 0);
}

function resolveTheme(theme) {
  if (theme === "system") {
    return systemThemeQuery?.matches ? "night" : "paper";
  }
  return theme;
}

/* ==========================================================================
   PRE-READING VOCABULARY EXTRACTION & WARMUP ENGINE
   ========================================================================== */

const HIGH_FREQ_SPANISH = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "este", "esta", "estos", "estas",
  "ese", "esa", "esos", "esas", "aquel", "aquella", "aquellos", "aquellas", "mi", "mis",
  "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras", "vuestro", "vuestra",
  "yo", "tu", "tú", "el", "él", "ella", "ellos", "ellas", "nosotros", "nosotras", "vosotros",
  "usted", "ustedes", "me", "te", "se", "nos", "os", "le", "les", "lo", "la", "los", "las",
  "que", "qué", "quien", "quién", "quienes", "quiénes", "cual", "cuál", "cuales", "cuáles",
  "algo", "nada", "alguien", "nadie", "alguno", "alguna", "algunos", "algunas", "ninguno", "ninguna",
  "todo", "toda", "todos", "todas", "otro", "otra", "otros", "otras", "mismo", "misma", "mismos",
  "a", "al", "del", "de", "en", "con", "por", "para", "sin", "sobre", "entre", "hasta", "desde",
  "hacia", "contra", "tras", "bajo", "ante", "según", "y", "e", "o", "u", "ni", "pero", "sino",
  "porque", "pues", "aunque", "como", "si", "cuando", "donde", "dónde", "mientras", "así",
  "no", "si", "sí", "ya", "muy", "más", "menos", "tan", "tanto", "tanta", "tantos", "tantas",
  "bien", "mal", "aquí", "allí", "ahí", "acá", "allá", "ahora", "luego", "después", "antes",
  "siempre", "nunca", "jamás", "hoy", "ayer", "mañana", "casi", "solo", "sólo", "solamente",
  "también", "tampoco", "quizá", "quizás", "tal", "vez", "veces", "demasiado", "mucho", "mucha",
  "muchos", "muchas", "poco", "poca", "pocos", "pocas",
  "ser", "es", "son", "era", "eran", "fue", "fueron", "sea", "sean", "siendo", "sido", "somos", "eres",
  "estar", "está", "están", "estaba", "estaban", "estuvo", "estuvieron", "esté", "estén", "estado", "estamos", "estás",
  "haber", "hay", "había", "habían", "hubo", "hubieron", "haya", "hayan", "habido", "he", "has", "ha", "hemos", "han",
  "tener", "tiene", "tienen", "tenía", "tenían", "tuvo", "tuvieron", "tenga", "tengan", "tenido", "tenemos", "tienes",
  "hacer", "hace", "hacen", "hacía", "hacían", "hizo", "hicieron", "haga", "hagan", "hecho", "hacemos", "haces",
  "ir", "va", "van", "iba", "iban", "fue", "fueron", "vaya", "vayan", "ido", "vamos", "vas",
  "decir", "dice", "dicen", "decía", "decían", "dijo", "dijeron", "diga", "digan", "dicho", "decimos", "dices",
  "ver", "ve", "ven", "veía", "veían", "vio", "vieron", "vea", "vean", "visto", "vemos", "ves",
  "dar", "da", "dan", "daba", "daban", "dio", "dieron", "dé", "den", "dado", "damos", "das",
  "poder", "puede", "pueden", "podía", "podían", "pudo", "pudieron", "pueda", "puedan", "podido", "podemos", "puedes",
  "saber", "sabe", "saben", "sabía", "sabían", "supo", "supieron", "sepa", "sepan", "sabido", "sabemos", "sabes",
  "querer", "quiere", "quieren", "quería", "querían", "quiso", "quisieron", "quiera", "querido", "queremos", "quieres",
  "llegar", "llega", "llegan", "llegaba", "llegó", "llegaron",
  "pasar", "pasa", "pasan", "pasaba", "pasó", "pasaron",
  "deber", "debe", "deben", "debía", "debió",
  "poner", "pone", "ponen", "ponía", "puso", "pusieron", "puesto",
  "parecer", "parece", "parecen", "parecía", "pareció",
  "quedar", "queda", "quedan", "quedaba", "quedó", "quedaron",
  "creer", "cree", "creen", "creía", "creyó",
  "hablar", "habla", "hablan", "hablaba", "habló",
  "llevar", "lleva", "llevan", "llevaba", "llevó",
  "dejar", "deja", "dejan", "dejaba", "dejó",
  "seguir", "sigue", "siguen", "seguía", "siguió",
  "encontrar", "encuentra", "encuentran", "encontraba", "encontró",
  "llamar", "llama", "llaman", "llamaba", "llamó",
  "venir", "viene", "vienen", "venía", "vino", "vinieron",
  "pensar", "piensa", "piensan", "pensaba", "pensó",
  "salir", "sale", "salen", "salía", "salió", "salieron",
  "volver", "vuelve", "vuelven", "volvía", "volvió", "vuelto",
  "tomar", "toma", "toman", "tomaba", "tomó",
  "conocer", "conoce", "conocen", "conocía", "conoció",
  "vivir", "vive", "viven", "vivía", "vivió",
  "sentir", "siente", "sienten", "sentía", "sintió",
  "tratar", "trata", "tratan", "trataba", "trató",
  "mirar", "mira", "miran", "miraba", "miró",
  "contar", "cuenta", "cuentan", "contaba", "contó",
  "empezar", "empieza", "empiezan", "empezaba", "empezó",
  "esperar", "espera", "esperan", "esperaba", "esperó",
  "buscar", "busca", "buscan", "buscaba", "buscó",
  "entrar", "entra", "entran", "entraba", "entró",
  "escribir", "escribe", "escriben", "escribía", "escribió", "escrito",
  "perder", "pierde", "pierden", "perdía", "perdió", "perdido",
  "cosa", "cosas", "año", "años", "día", "días", "tiempo", "tiempos", "hombre", "hombres",
  "mujer", "mujeres", "vida", "vidas", "momento", "momentos", "forma", "formas", "casa", "casas",
  "mundo", "mundos", "lugar", "lugares", "caso", "casos", "mano", "manos", "parte", "partes",
  "lado", "lados", "palabra", "palabras", "noche", "noches", "padre", "madre", "hijo", "hija",
  "ojos", "cabeza", "cuerpo", "voz", "camino", "hora", "horas", "persona", "personas"
]);

const SPANISH_IDIOMS = [
  { phrase: "de repente", meaning: "suddenly, all of a sudden" },
  { phrase: "sin embargo", meaning: "however, nevertheless" },
  { phrase: "poco a poco", meaning: "little by little, gradually" },
  { phrase: "por fin", meaning: "finally, at last" },
  { phrase: "a menudo", meaning: "often, frequently" },
  { phrase: "a través de", meaning: "through, across" },
  { phrase: "darse cuenta", meaning: "to realize, become aware" },
  { phrase: "echar de menos", meaning: "to miss (someone/something)" },
  { phrase: "tener en cuenta", meaning: "to take into account" },
  { phrase: "a punto de", meaning: "on the verge of, about to" },
  { phrase: "en medio de", meaning: "in the middle of, amid" },
  { phrase: "de vez en cuando", meaning: "from time to time" },
  { phrase: "al fin y al cabo", meaning: "after all, in the end" },
  { phrase: "por lo tanto", meaning: "therefore, consequently" },
  { phrase: "hacer caso", meaning: "to pay attention, to heed" },
  { phrase: "tener lugar", meaning: "to take place, to happen" },
  { phrase: "valer la pena", meaning: "to be worth the effort" },
  { phrase: "llevar a cabo", meaning: "to carry out, execute" },
  { phrase: "a pesar de", meaning: "despite, in spite of" },
  { phrase: "en cambio", meaning: "on the other hand, instead" },
  { phrase: "de nuevo", meaning: "again, once more" },
  { phrase: "al principio", meaning: "at first, in the beginning" }
];

const LITERARY_VOCAB_MAP = {
  lisonjas: "flattery, excessive praise",
  lisonja: "flattery, flattering compliment",
  lisonjear: "to flatter, praise insincerely",
  digiero: "I digest, I assimilate",
  digerir: "to digest, to assimilate",
  azabache: "jet-black, pitch-black",
  escarabajo: "beetle",
  escarabajos: "beetles",
  algodón: "cotton",
  cuervo: "crow, raven",
  astuto: "cunning, crafty, shrewd",
  astuta: "cunning, crafty, shrewd",
  adulación: "adulation, brown-nosing",
  adulador: "flatterer, sycophant",
  aduladores: "flatterers, sycophants",
  queso: "cheese",
  pico: "beak, bill (of a bird)",
  hazaña: "deed, heroic feat",
  hazañas: "deeds, heroic feats",
  soberbia: "pride, arrogance",
  soberbio: "proud, arrogant, splendid",
  vano: "vain, futile, empty",
  vana: "vain, futile, empty",
  donoso: "graceful, witty, charming",
  caverna: "cave, cavern",
  morada: "dwelling, abode, residence",
  cautivo: "captive, prisoner",
  cautivos: "captives, prisoners",
  tinieblas: "darkness, deep gloom",
  resplandor: "brightness, radiance, glow",
  desdicha: "misfortune, unhappiness",
  desvelo: "sleeplessness, care, concern",
  recelo: "suspicion, misgiving, distrust",
  alboroto: "commotion, uproar, fuss",
  antorcha: "torch",
  manantial: "spring, water source",
  penumbra: "semi-darkness, twilight",
  rocío: "dew",
  sendero: "path, trail, footpath",
  susurro: "whisper, rustle, murmur",
  torbellino: "whirlwind, vortex",
  crepúsculo: "twilight, dusk",
  estremecimiento: "shiver, shudder, tremor",
  semblante: "countenance, expression",
  tenue: "faint, delicate, subtle",
  umbrío: "shady, shadowy",
  yerto: "stiff, rigid, frozen",
  efímero: "ephemeral, short-lived",
  lúgubre: "gloomy, dismal, mournful",
  vislumbrar: "to catch a glimpse of",
  zalamería: "fawning, sweet talk"
};

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractShortContext(wordsList, wordIndex, targetWord) {
  if (!wordsList || !wordsList[wordIndex]) return "";
  const start = Math.max(0, wordIndex - 3);
  const end = Math.min(wordsList.length - 1, wordIndex + 3);

  return wordsList
    .slice(start, end + 1)
    .map((w) => {
      const isMatch =
        normalizeWord(w.text) === normalizeWord(targetWord) ||
        (targetWord.includes(" ") && targetWord.toLowerCase().includes(w.text.toLowerCase()));
      return isMatch ? `<mark class="vocab-highlight">${escapeHtml(w.text)}</mark>` : escapeHtml(w.text);
    })
    .join(" ");
}

async function fetchSingleWordMeaning(word) {
  const norm = normalizeWord(word);
  if (LITERARY_VOCAB_MAP[norm]) return LITERARY_VOCAB_MAP[norm];
  if (sharedGlossary[norm] && sharedGlossary[norm].trim()) return sharedGlossary[norm].trim();

  try {
    const raw = await fetchTranslation(norm);
    if (!raw) return "";
    const clean = String(raw)
      .replace(/<[^>]+>/g, "")
      .replace(/&[a-z]+;/gi, " ")
      .trim();
    if (clean.length > 50) {
      return clean.slice(0, 45).trim() + "…";
    }
    return clean;
  } catch {
    return "";
  }
}

function extractUncommonVocab(wordsList) {
  if (!wordsList || wordsList.length < 15) return [];

  const fullTextLower = wordsList.map((w) => normalizeWord(w.text)).join(" ");
  const extracted = [];
  const seenWords = new Set();

  // 1. Detect key multi-word idioms in the text
  for (const idiom of SPANISH_IDIOMS) {
    const idiomNorm = idiom.phrase.toLowerCase();
    const pos = fullTextLower.indexOf(idiomNorm);
    if (pos !== -1) {
      const approxIdx = Math.max(
        0,
        wordsList.findIndex((w) => fullTextLower.slice(0, pos).trim().split(/\s+/).length <= w.index)
      );
      const shortContext = extractShortContext(wordsList, approxIdx >= 0 ? approxIdx : 0, idiom.phrase);
      extracted.push({
        word: idiom.phrase,
        normalized: idiomNorm,
        displayWord: idiom.phrase,
        meaning: idiom.meaning,
        frequency: 1,
        index: approxIdx >= 0 ? approxIdx : 0,
        contextSentence: shortContext,
        isPhrase: true,
        score: 95
      });
      idiom.phrase.split(/\s+/).forEach((part) => seenWords.add(normalizeWord(part)));
    }
  }

  // 2. Frequency counting and candidate gathering
  const wordOccurrences = new Map();
  wordsList.forEach((wordObj, index) => {
    const raw = wordObj.text.trim();
    const clean = normalizeWord(raw);
    if (!clean || clean.length < 4 || /^\d+$/.test(clean)) return;
    if (HIGH_FREQ_SPANISH.has(clean) || seenWords.has(clean)) return;

    if (!wordOccurrences.has(clean)) {
      wordOccurrences.set(clean, {
        word: raw.replace(/[.,;:!?¡¿"()«»]/g, ""),
        normalized: clean,
        count: 0,
        firstIndex: index
      });
    }
    wordOccurrences.get(clean).count += 1;
  });

  // 3. Scoring words by rarity & learner utility
  const candidates = [];
  for (const [norm, data] of wordOccurrences.entries()) {
    let score = 0;
    const length = norm.length;
    score += Math.min(length * 2.5, 25);

    // Prefer words that appear 1 to 4 times (key specialized vocabulary in text)
    if (data.count === 1) score += 14;
    else if (data.count === 2) score += 20;
    else if (data.count === 3) score += 16;
    else if (data.count <= 6) score += 10;
    else score += 4;

    const hasKnownDef = Boolean(LITERARY_VOCAB_MAP[norm] || (sharedGlossary[norm] && sharedGlossary[norm].trim()));
    if (hasKnownDef) score += 35;

    // Morphological patterns common in rich Spanish literature
    if (/(?:eza|ura|umbre|miento|oso|osa|able|ible|ivo|iva|ante|iente|ero|era|ista)$/.test(norm)) {
      score += 10;
    }

    candidates.push({ ...data, score, hasKnownDef });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Take top 6 to 8 candidates max so it stays clean and concise
  const maxWords = Math.min(6, Math.max(3, 8 - extracted.length));
  const selected = candidates.slice(0, maxWords);

  for (const cand of selected) {
    const shortContext = extractShortContext(wordsList, cand.firstIndex, cand.word);
    const meaning = LITERARY_VOCAB_MAP[cand.normalized] || (sharedGlossary[cand.normalized] ? sharedGlossary[cand.normalized].trim() : "");

    extracted.push({
      word: cand.word,
      normalized: cand.normalized,
      displayWord: cand.word,
      meaning: meaning,
      frequency: cand.count,
      index: cand.firstIndex,
      contextSentence: shortContext,
      isPhrase: false,
      score: cand.score
    });
  }

  return extracted;
}

async function renderVocabWarmup() {
  if (!vocabWarmup || !vocabWarmupList) return;

  const items = appearanceSettings.vocabWarmup === "off" || !words || words.length < 15
    ? []
    : extractUncommonVocab(words);
  vocabWarmupItemCount = items.length;
  if (!items.length) {
    vocabWarmup.hidden = true;
    return;
  }

  vocabWarmupList.replaceChildren();

  const isCollapsed = appearanceSettings.vocabWarmup === "collapsed";
  vocabWarmup.classList.toggle("is-collapsed", isCollapsed);
  if (toggleVocabWarmupCollapse) {
    toggleVocabWarmupCollapse.setAttribute("aria-expanded", String(!isCollapsed));
    const label = toggleVocabWarmupCollapse.querySelector(".collapse-label");
    if (label) label.textContent = isCollapsed ? "Show key words" : "Hide list";
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "vocab-card";
    card.dataset.word = item.word;
    card.dataset.index = String(item.index);

    const studyKey = `${normalizeWord(item.word)}:::`;
    const isSaved = Boolean(
      studyLog[studyKey] ||
        Object.values(studyLog).some((e) => normalizeWord(e.word) === normalizeWord(item.word))
    );

    card.innerHTML = `
      <div class="vocab-card-header">
        <div class="vocab-term-row">
          <strong class="vocab-word">${escapeHtml(item.displayWord)}</strong>
        </div>
        <button class="vocab-save-btn ${isSaved ? "is-saved" : ""}" type="button" aria-label="Save to study cards" title="${isSaved ? "Saved to study cards" : "Save to Anki study cards"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isSaved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
      <p class="vocab-meaning ${item.meaning ? "" : "is-loading"}">${item.meaning ? escapeHtml(item.meaning) : "Looking up translation…"}</p>
      <div class="vocab-context">
        <span>“${item.contextSentence || escapeHtml(item.displayWord)}”</span>
      </div>
    `;

    // Handle Save to study log / Anki
    const saveBtn = card.querySelector(".vocab-save-btn");
    saveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const wordObj = words[item.index] || { text: item.word, index: item.index };
      const currentMeaning = card.querySelector(".vocab-meaning")?.textContent || item.meaning || item.word;
      logStudiedWord(wordObj, currentMeaning);
      saveBtn.classList.add("is-saved");
      saveBtn.querySelector("svg")?.setAttribute("fill", "currentColor");
      saveBtn.title = "Saved to study cards";
    });

    vocabWarmupList.append(card);

    // Asynchronously resolve missing definitions
    if (!item.meaning) {
      fetchSingleWordMeaning(item.word)
        .then((trans) => {
          if (trans) {
            item.meaning = trans;
            const meaningEl = card.querySelector(".vocab-meaning");
            if (meaningEl) {
              meaningEl.textContent = trans;
              meaningEl.classList.remove("is-loading");
            }
          }
        })
        .catch(() => {
          const meaningEl = card.querySelector(".vocab-meaning");
          if (meaningEl) {
            meaningEl.textContent = "Tap word in reader for definition";
            meaningEl.classList.remove("is-loading");
          }
        });
    }
  });

  vocabWarmup.hidden = false;
}

function updateVocabWarmupVisibility() {
  if (!vocabWarmup) return;
  if (appearanceSettings.vocabWarmup === "off" || !words || words.length < 15 || vocabWarmupItemCount === 0) {
    vocabWarmup.hidden = true;
    return;
  }
  vocabWarmup.hidden = false;
  const isCollapsed = appearanceSettings.vocabWarmup === "collapsed";
  vocabWarmup.classList.toggle("is-collapsed", isCollapsed);
  if (toggleVocabWarmupCollapse) {
    toggleVocabWarmupCollapse.setAttribute("aria-expanded", String(!isCollapsed));
    const label = toggleVocabWarmupCollapse.querySelector(".collapse-label");
    if (label) label.textContent = isCollapsed ? "Show key words" : "Hide list";
  }
}

if (toggleVocabWarmupCollapse) {
  toggleVocabWarmupCollapse.addEventListener("click", () => {
    vocabWarmup.classList.toggle("is-collapsed");
    const isCollapsed = vocabWarmup.classList.contains("is-collapsed");
    toggleVocabWarmupCollapse.setAttribute("aria-expanded", String(!isCollapsed));
    const label = toggleVocabWarmupCollapse.querySelector(".collapse-label");
    if (label) label.textContent = isCollapsed ? "Show key words" : "Hide list";
  });
}

if (startReadingFromVocabBtn) {
  startReadingFromVocabBtn.addEventListener("click", () => {
    if (audio.src) {
      if (isReadMode) {
        setReadMode(false);
      }
      audio.play().catch(() => {
        status("Playback could not be started.");
      });
      updateCurrentWord(audio.currentTime || 0);
    } else {
      reader.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}
