import {
  chooseVoice,
  filterEntries,
  mergeVocabularyDatasets,
  normalizedImportedProgress,
  progressCounts,
  sortEntries,
  updateProgress,
  validateVocabularyData
} from "./vocabulary-core.mjs";

const PROGRESS_KEY = "lsqy.vocabulary.progress.v1";
const SETTINGS_KEY = "lsqy.vocabulary.settings.v1";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const app = document.querySelector("[data-vocabulary-app]");
if (app) initialize();

function initialize() {
  const ui = {
    app,
    loading: document.querySelector("[data-loading-card]"),
    card: document.querySelector("[data-word-card]"),
    empty: document.querySelector("[data-empty-state]"),
    error: document.querySelector("[data-error-state]"),
    errorMessage: document.querySelector("[data-error-message]"),
    live: document.querySelector("[data-live-status]"),
    storage: document.querySelector("[data-storage-status]"),
    offline: document.querySelector("[data-offline-status]"),
    resultSummary: document.querySelector("[data-result-summary]"),
    list: document.querySelector("[data-word-list]"),
    filterForm: document.querySelector("[data-filter-form]"),
    query: document.querySelector("[data-filter-query]"),
    language: document.querySelector("[data-filter-language]"),
    topic: document.querySelector("[data-filter-topic]"),
    difficulty: document.querySelector("[data-filter-difficulty]"),
    frequency: document.querySelector("[data-filter-frequency]"),
    source: document.querySelector("[data-filter-source]"),
    progressFilter: document.querySelector("[data-filter-progress]"),
    sort: document.querySelector("[data-sort]"),
    previous: document.querySelector("[data-previous-word]"),
    next: document.querySelector("[data-next-word]"),
    shuffle: document.querySelector("[data-shuffle]"),
    voice: document.querySelector("[data-voice-select]"),
    term: document.querySelector("[data-term]"),
    languageBadge: document.querySelector("[data-language-badge]"),
    difficultyText: document.querySelector("[data-difficulty]"),
    frequencyText: document.querySelector("[data-frequency]"),
    grammar: document.querySelector("[data-grammar]"),
    position: document.querySelector("[data-position]"),
    reading: document.querySelector("[data-reading]"),
    readingWrap: document.querySelector("[data-reading-wrap]"),
    phonetic: document.querySelector("[data-phonetic]"),
    phoneticWrap: document.querySelector("[data-phonetic-wrap]"),
    romanization: document.querySelector("[data-romanization]"),
    romanizationWrap: document.querySelector("[data-romanization-wrap]"),
    meaning: document.querySelector("[data-meaning]"),
    example: document.querySelector("[data-example]"),
    exampleZh: document.querySelector("[data-example-zh]"),
    collocations: document.querySelector("[data-collocations]"),
    related: document.querySelector("[data-related]"),
    sourceText: document.querySelector("[data-source]"),
    sourceNote: document.querySelector("[data-source-note]"),
    topics: document.querySelector("[data-topics]"),
    paperContext: document.querySelector("[data-paper-context]"),
    paperTitle: document.querySelector("[data-paper-title]"),
    paperNoteTitleWrap: document.querySelector("[data-paper-note-title-wrap]"),
    paperNoteTitle: document.querySelector("[data-paper-note-title]"),
    paperSection: document.querySelector("[data-paper-section]"),
    paperQuote: document.querySelector("[data-paper-quote]"),
    paperExcerpt: document.querySelector("[data-paper-excerpt]"),
    paperContextZhWrap: document.querySelector("[data-paper-context-zh-wrap]"),
    paperContextZh: document.querySelector("[data-paper-context-zh]"),
    paperNoteLink: document.querySelector("[data-paper-note-link]"),
    paperSourceLink: document.querySelector("[data-paper-source-link]"),
    statTotal: document.querySelector("[data-stat-total]"),
    statKnown: document.querySelector("[data-stat-known]"),
    statReview: document.querySelector("[data-stat-review]"),
    progressKnown: document.querySelector("[data-progress-known]"),
    progressReview: document.querySelector("[data-progress-review]"),
    progressFavorite: document.querySelector("[data-progress-favorite]"),
    importTrigger: document.querySelector("[data-import-trigger]"),
    importInput: document.querySelector("[data-import-progress]")
  };

  let dataset = null;
  let entries = [];
  let visibleEntries = [];
  let currentId = "";
  let shuffleSeed = Date.now();
  let progress = readProgress();
  let settings = readSettings();
  let voices = speechAvailable() ? window.speechSynthesis.getVoices() : [];
  let speakingButton = null;
  let offlineCacheReady = false;

  bindEvents();
  setupConnectivity();
  loadDataset();

  function bindEvents() {
    ui.filterForm.addEventListener("submit", event => {
      event.preventDefault();
      render({ announce: "搜索结果已更新。" });
    });
    [ui.language, ui.topic, ui.difficulty, ui.frequency, ui.source, ui.progressFilter].forEach(control => {
      control.addEventListener("change", () => render({ announce: "筛选结果已更新。" }));
    });
    ui.query.addEventListener("input", () => render({ announce: "搜索结果已更新。" }));
    ui.sort.addEventListener("change", () => {
      if (ui.sort.value === "shuffle") shuffleSeed = Date.now();
      render({ announce: "词列顺序已更新。" });
    });
    document.querySelectorAll("[data-reset-filters], [data-empty-reset]").forEach(button => {
      button.addEventListener("click", resetFilters);
    });
    ui.previous.addEventListener("click", () => move(-1));
    ui.next.addEventListener("click", () => move(1));
    ui.shuffle.addEventListener("click", () => {
      ui.sort.value = "shuffle";
      shuffleSeed = Date.now();
      currentId = "";
      render({ focusTerm: true, announce: "已重新打乱当前词列。" });
    });
    document.querySelectorAll("[data-speak]").forEach(button => {
      button.addEventListener("click", () => speak(button.dataset.speak, button));
    });
    ui.voice.addEventListener("change", () => {
      const entry = currentEntry();
      if (!entry) return;
      settings.voiceByLocale[entry.speech.locale] = ui.voice.value;
      saveSettings();
      announce(ui.voice.value ? "已保存当前语言的系统语音。" : "已恢复自动选择系统语音。");
    });
    document.querySelectorAll("[data-progress-action]").forEach(button => {
      button.addEventListener("click", () => setProgress(button.dataset.progressAction));
    });
    document.querySelector("[data-export-progress]").addEventListener("click", exportProgress);
    ui.importTrigger.addEventListener("click", () => ui.importInput.click());
    ui.importInput.addEventListener("change", importProgress);
    document.querySelector("[data-clear-progress]").addEventListener("click", clearProgress);
    document.querySelector("[data-retry-load]").addEventListener("click", loadDataset);
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("pagehide", stopSpeech);
    window.addEventListener("storage", handleStorageChange);

    if (speechAvailable()) {
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        voices = window.speechSynthesis.getVoices();
        const entry = currentEntry();
        if (entry) renderVoiceOptions(entry);
      });
    }
  }

  async function loadDataset() {
    ui.loading.hidden = false;
    ui.card.hidden = true;
    ui.empty.hidden = true;
    ui.error.hidden = true;
    ui.app.setAttribute("aria-busy", "true");
    try {
      const [baseDataset, paperDataset] = await Promise.all([
        fetchDataset("./words.json"),
        fetchDataset("./paper-words.json", { optional: true })
      ]);
      dataset = mergeVocabularyDatasets(baseDataset, paperDataset);
      entries = validateVocabularyData(dataset);
      progress = cleanStoredProgress(progress);
      populateFilters();
      ui.statTotal.textContent = String(entries.length);
      ui.loading.hidden = true;
      ui.app.setAttribute("aria-busy", "false");
      document.body.dataset.vocabularyReady = "true";
      render();
      updateOfflineMessage(
        navigator.onLine === false
          ? "离线模式 · 已从本地缓存载入词库"
          : offlineCacheReady
            ? "离线缓存已就绪 · 进度保存在当前浏览器"
            : "本地词库已载入 · 正在确认离线缓存",
        navigator.onLine === false ? "offline" : offlineCacheReady ? "ready" : "warning"
      );
    } catch (error) {
      ui.loading.hidden = true;
      ui.error.hidden = false;
      ui.errorMessage.textContent = `无法载入词库（${error instanceof Error ? error.message : "未知错误"}）。如果是首次访问，请先恢复网络后重试。`;
      ui.resultSummary.textContent = "词库载入失败";
      ui.app.setAttribute("aria-busy", "false");
      updateOfflineMessage("词库尚未缓存 · 需要联网完成首次载入", "warning");
    }
  }

  async function fetchDataset(path, { optional = false } = {}) {
    let response;
    try {
      response = await fetch(path, { cache: "no-cache" });
    } catch (error) {
      throw new Error(`${path} 请求失败：${error instanceof Error ? error.message : "网络错误"}`);
    }
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`${path} 返回 HTTP ${response.status}`);
    try {
      return await response.json();
    } catch (_error) {
      throw new Error(`${path} 不是有效的 JSON`);
    }
  }

  function populateFilters() {
    fillSelect(ui.language, uniqueBy(entries, entry => entry.languageCode, entry => entry.language));
    fillSelect(ui.topic, uniqueValues(entries.flatMap(entry => entry.topics)).map(value => [value, value]));
    fillSelect(ui.difficulty, uniqueBy(entries, entry => entry.difficulty.key, entry => entry.difficulty.label,
      (a, b) => a.difficulty.level - b.difficulty.level));
    fillSelect(ui.frequency, uniqueBy(entries, entry => entry.frequency.band, entry => entry.frequency.label,
      (a, b) => b.frequency.score - a.frequency.score));
    fillSelect(ui.source, uniqueBy(entries, entry => entry.source.label, entry => entry.source.label));
  }

  function fillSelect(select, options) {
    const current = select.value;
    while (select.options.length > 1) select.remove(1);
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    if (Array.from(select.options).some(option => option.value === current)) select.value = current;
  }

  function render({ focusTerm = false, announce: message = "" } = {}) {
    if (!entries.length) return;
    visibleEntries = sortEntries(filterEntries(entries, progress, currentFilters()), progress, ui.sort.value, shuffleSeed);
    if (!visibleEntries.some(entry => entry.id === currentId)) currentId = visibleEntries[0]?.id || "";

    updateProgressStats();
    ui.resultSummary.textContent = visibleEntries.length
      ? `符合条件 ${visibleEntries.length} 条 · 当前 ${currentIndex() + 1} / ${visibleEntries.length}`
      : "符合条件 0 条";
    ui.previous.disabled = visibleEntries.length < 2;
    ui.next.disabled = visibleEntries.length < 2;
    ui.shuffle.disabled = visibleEntries.length < 2;
    ui.error.hidden = true;
    ui.empty.hidden = visibleEntries.length !== 0;
    ui.card.hidden = visibleEntries.length === 0;

    if (!visibleEntries.length) {
      ui.list.replaceChildren();
      if (message) announce(message);
      return;
    }

    renderWord(currentEntry());
    renderQueue();
    if (focusTerm) ui.term.focus({ preventScroll: true });
    if (message) announce(message);
  }

  function renderWord(entry) {
    const index = currentIndex();
    ui.term.textContent = entry.term;
    ui.term.lang = entry.locale;
    ui.languageBadge.textContent = entry.language;
    ui.difficultyText.textContent = entry.difficulty.label;
    ui.frequencyText.textContent = entry.frequency.label;
    ui.grammar.textContent = entry.grammar;
    ui.position.textContent = `${String(index + 1).padStart(2, "0")} / ${String(visibleEntries.length).padStart(2, "0")}`;
    const isJapanese = entry.languageCode === "ja";
    setPronunciation(ui.readingWrap, ui.reading, isJapanese ? entry.pronunciation.reading : "", {
      language: entry.locale,
      label: "假名"
    });
    setPronunciation(ui.phoneticWrap, ui.phonetic, isJapanese ? "" : entry.pronunciation.phonetic, {
      label: "国际音标",
      ariaLabel: `国际音标：${entry.pronunciation.phonetic}`
    });
    setPronunciation(ui.romanizationWrap, ui.romanization, isJapanese ? entry.pronunciation.romanization : "", {
      language: "en",
      label: "罗马音"
    });
    ui.meaning.textContent = entry.meaningZh;
    ui.example.textContent = entry.example;
    ui.example.lang = entry.locale;
    ui.exampleZh.textContent = entry.exampleZh;
    renderTermList(ui.collocations, entry.collocations, "meaningZh", entry.locale);
    renderTermList(ui.related, entry.related, "note", entry.locale);
    ui.sourceText.textContent = entry.source.label;
    ui.sourceNote.textContent = cleanText(entry.source.note);
    ui.topics.replaceChildren(...entry.topics.map(topic => makeElement("span", "", topic)));
    renderPaperContext(entry);
    renderProgressButtons(entry);
    renderVoiceOptions(entry);
    document.querySelector('[data-speak="term"]').setAttribute("aria-label", `播放${entry.language}原词“${entry.term}”`);
    document.querySelector('[data-speak="example"]').setAttribute("aria-label", `播放${entry.language}例句`);
  }

  function renderPaperContext(entry) {
    const source = entry.source || {};
    const paperFields = ["paperTitle", "noteTitle", "section", "excerpt", "contextZh", "noteUrl", "paperUrl"];
    const isPaperEntry = source.kind === "paper-note" || paperFields.some(key => cleanText(source[key]));
    ui.paperContext.hidden = !isPaperEntry;
    if (!isPaperEntry) {
      clearPaperContext();
      return;
    }

    const paperTitle = cleanText(source.paperTitle);
    const noteTitle = cleanText(source.noteTitle);
    const section = cleanText(source.section);
    const excerpt = cleanText(source.excerpt);
    const contextZh = cleanText(source.contextZh);

    ui.paperTitle.textContent = paperTitle || noteTitle || "论文语境";
    ui.paperNoteTitle.textContent = noteTitle;
    ui.paperNoteTitleWrap.hidden = !noteTitle;
    ui.paperSection.textContent = section ? `SECTION · ${section}` : "";
    ui.paperSection.hidden = !section;
    ui.paperExcerpt.textContent = excerpt;
    ui.paperQuote.hidden = !excerpt;
    ui.paperContextZh.textContent = contextZh;
    ui.paperContextZhWrap.hidden = !contextZh;

    setPaperLink(ui.paperNoteLink, source.noteUrl, "internal");
    setPaperLink(ui.paperSourceLink, source.paperUrl, "external");
  }

  function clearPaperContext() {
    ui.paperTitle.textContent = "";
    ui.paperNoteTitle.textContent = "";
    ui.paperNoteTitleWrap.hidden = true;
    ui.paperSection.textContent = "";
    ui.paperSection.hidden = true;
    ui.paperExcerpt.textContent = "";
    ui.paperQuote.hidden = true;
    ui.paperContextZh.textContent = "";
    ui.paperContextZhWrap.hidden = true;
    setPaperLink(ui.paperNoteLink, "", "internal");
    setPaperLink(ui.paperSourceLink, "", "external");
  }

  function setPronunciation(wrapper, target, value, { language = "", label = "", ariaLabel = "" } = {}) {
    wrapper.hidden = !value;
    const visibleLabel = wrapper.querySelector("small");
    if (visibleLabel && label) visibleLabel.textContent = label;
    target.textContent = value || "";
    if (language) target.lang = language;
    else target.removeAttribute("lang");
    if (ariaLabel && value) target.setAttribute("aria-label", ariaLabel);
    else target.removeAttribute("aria-label");
  }

  function renderTermList(list, items, detailKey, language) {
    const nodes = items.map(item => {
      const row = document.createElement("li");
      const term = makeElement("strong", "", item.term);
      term.lang = language;
      row.append(term, makeElement("span", "", item[detailKey]));
      return row;
    });
    list.replaceChildren(...nodes);
  }

  function renderProgressButtons(entry) {
    const saved = progress[entry.id] || {};
    document.querySelectorAll("[data-progress-action]").forEach(button => {
      const action = button.dataset.progressAction;
      const pressed = action === "favorite" ? saved.favorite === true : saved.knowledge === action;
      button.setAttribute("aria-pressed", String(pressed));
      const icon = button.querySelector("span");
      const hint = button.querySelector("small");
      if (action === "favorite") {
        icon.textContent = pressed ? "★" : "☆";
        hint.textContent = pressed ? "已单独保存" : "单独保存";
      } else if (action === "known") {
        hint.textContent = pressed ? "已标记掌握" : "已经掌握";
      } else {
        hint.textContent = pressed ? "明天再看" : "加入复习";
      }
    });
  }

  function renderQueue() {
    const fragment = document.createDocumentFragment();
    for (const entry of visibleEntries) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.wordId = entry.id;
      button.setAttribute("aria-current", String(entry.id === currentId));
      const term = makeElement("strong", "", entry.term);
      term.lang = entry.locale;
      const saved = progress[entry.id] || {};
      const state = saved.knowledge === "known" ? "认识" : saved.knowledge === "review" ? "待复习" : "未标记";
      const favorite = saved.favorite ? " · ★" : "";
      button.append(term, makeElement("small", "", `${entry.language} · ${state}${favorite}`));
      button.addEventListener("click", () => {
        stopSpeech();
        currentId = entry.id;
        render({ focusTerm: true, announce: `已切换到${entry.term}。` });
      });
      item.append(button);
      fragment.append(item);
    }
    ui.list.replaceChildren(fragment);
  }

  function renderVoiceOptions(entry) {
    const locale = entry.speech.locale;
    const language = locale.toLocaleLowerCase().split("-")[0];
    const compatible = voices.filter(voice => voice.lang && voice.lang.toLocaleLowerCase().split("-")[0] === language)
      .sort((a, b) => Number(b.lang.toLocaleLowerCase() === locale.toLocaleLowerCase()) - Number(a.lang.toLocaleLowerCase() === locale.toLocaleLowerCase())
        || a.name.localeCompare(b.name));
    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = compatible.length ? `自动选择（${entry.language}）` : `浏览器默认（${entry.language}）`;
    const options = compatible.map(voice => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? " · 本地" : ""}`;
      return option;
    });
    ui.voice.replaceChildren(automatic, ...options);
    const preferred = settings.voiceByLocale[locale] || "";
    ui.voice.value = options.some(option => option.value === preferred) ? preferred : "";
    ui.voice.disabled = !speechAvailable();
  }

  function updateProgressStats() {
    const counts = progressCounts(entries, progress);
    ui.statKnown.textContent = String(counts.known);
    ui.statReview.textContent = String(counts.review);
    ui.progressKnown.textContent = String(counts.known);
    ui.progressReview.textContent = String(counts.review);
    ui.progressFavorite.textContent = String(counts.favorite);
  }

  function setProgress(action) {
    const entry = currentEntry();
    if (!entry) return;
    progress = updateProgress(progress, entry.id, action);
    saveProgress();
    const saved = progress[entry.id];
    const message = action === "favorite"
      ? (saved.favorite ? `已收藏“${entry.term}”。` : `已取消收藏“${entry.term}”。`)
      : action === "known"
        ? (saved.knowledge === "known" ? `已将“${entry.term}”标记为认识。` : `已清除“${entry.term}”的认识状态。`)
        : (saved.knowledge === "review" ? `已将“${entry.term}”加入稍后复习。` : `已将“${entry.term}”移出复习。`);
    render({ announce: message });
  }

  function move(offset) {
    if (visibleEntries.length < 2) return;
    stopSpeech();
    const nextIndex = (currentIndex() + offset + visibleEntries.length) % visibleEntries.length;
    currentId = visibleEntries[nextIndex].id;
    render({ focusTerm: true, announce: `已切换到${visibleEntries[nextIndex].term}。` });
  }

  function resetFilters() {
    ui.query.value = "";
    [ui.language, ui.topic, ui.difficulty, ui.frequency, ui.source, ui.progressFilter].forEach(select => { select.value = "all"; });
    ui.sort.value = "curated";
    currentId = "";
    render({ announce: "已清空全部筛选。" });
  }

  function currentFilters() {
    return {
      query: ui.query.value,
      language: ui.language.value,
      topic: ui.topic.value,
      difficulty: ui.difficulty.value,
      frequency: ui.frequency.value,
      source: ui.source.value,
      progress: ui.progressFilter.value
    };
  }

  function currentIndex() {
    return Math.max(0, visibleEntries.findIndex(entry => entry.id === currentId));
  }

  function currentEntry() {
    return visibleEntries.find(entry => entry.id === currentId) || null;
  }

  function speak(kind, button) {
    const entry = currentEntry();
    if (!entry) return;
    if (!speechAvailable() || typeof window.SpeechSynthesisUtterance !== "function") {
      announce("当前浏览器不支持语音合成；请参考页面保留的读音、假名或音标。");
      return;
    }

    stopSpeech();
    const text = kind === "example" ? entry.speech.example : entry.speech.term;
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = entry.speech.locale;
    utterance.rate = kind === "example" ? 0.88 : 0.82;
    const preferred = settings.voiceByLocale[entry.speech.locale] || "";
    const voice = chooseVoice(voices, entry.speech.locale, preferred);
    if (voice) utterance.voice = voice;
    utterance.addEventListener("start", () => {
      speakingButton = button;
      button.classList.add("is-speaking");
      announce(`正在播放${entry.language}${kind === "example" ? "例句" : "原词"}${voice ? `，语音为 ${voice.name}` : "，使用浏览器默认语音"}。`);
    });
    utterance.addEventListener("end", clearSpeakingButton);
    utterance.addEventListener("error", event => {
      clearSpeakingButton();
      if (event.error !== "canceled" && event.error !== "interrupted") {
        announce("系统语音播放失败；读音文本仍可正常查看。部分系统 voice 可能需要联网下载。");
      }
    });
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if (speechAvailable()) window.speechSynthesis.cancel();
    clearSpeakingButton();
  }

  function clearSpeakingButton() {
    if (speakingButton) speakingButton.classList.remove("is-speaking");
    speakingButton = null;
  }

  function handleKeyboard(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest("input, select, textarea, button, a")) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key.toLocaleLowerCase() === "p") {
      event.preventDefault();
      const button = document.querySelector('[data-speak="term"]');
      speak("term", button);
    }
  }

  function exportProgress() {
    if (!dataset) return;
    const payload = {
      format: "lsqy-vocabulary-progress",
      schemaVersion: 1,
      datasetUpdatedAt: dataset.updatedAt,
      exportedAt: new Date().toISOString(),
      progress,
      settings: { voiceByLocale: settings.voiceByLocale }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `vocabulary-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    ui.storage.textContent = `已导出 ${Object.keys(progress).length} 条学习记录。`;
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      ui.storage.textContent = "导入失败：进度文件不能超过 2 MB。";
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      const imported = normalizedImportedProgress(payload, entries.map(entry => entry.id));
      progress = { ...progress, ...imported };
      if (payload.settings?.voiceByLocale && typeof payload.settings.voiceByLocale === "object") {
        for (const [locale, voiceURI] of Object.entries(payload.settings.voiceByLocale)) {
          if (typeof locale === "string" && typeof voiceURI === "string") settings.voiceByLocale[locale] = voiceURI;
        }
      }
      saveProgress();
      saveSettings();
      render();
      ui.storage.textContent = `已合并导入 ${Object.keys(imported).length} 条有效学习记录。`;
    } catch (error) {
      ui.storage.textContent = `导入失败：${error instanceof Error ? error.message : "无法解析文件"}`;
    }
  }

  function clearProgress() {
    if (!window.confirm("确定清空当前浏览器中的认识、复习和收藏状态吗？建议先导出备份。")) {
      ui.storage.textContent = "已取消清空。";
      return;
    }
    progress = {};
    saveProgress();
    render();
    ui.storage.textContent = "当前浏览器中的学习进度已清空；版本化词库未受影响。";
  }

  function readProgress() {
    try {
      const payload = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      return payload?.schemaVersion === 1 && payload.progress && typeof payload.progress === "object" ? payload.progress : {};
    } catch (_error) {
      queueMicrotask(() => { ui.storage.textContent = "旧进度无法解析，已使用空白进度；下次保存会修复本地记录。"; });
      return {};
    }
  }

  function cleanStoredProgress(value) {
    try {
      return normalizedImportedProgress({ schemaVersion: 1, progress: value }, entries.map(entry => entry.id));
    } catch (_error) {
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ schemaVersion: 1, progress }));
    } catch (_error) {
      announce("浏览器拒绝保存学习进度；本次页面内操作仍然有效。");
    }
  }

  function readSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      return {
        schemaVersion: 1,
        voiceByLocale: value?.schemaVersion === 1 && value.voiceByLocale && typeof value.voiceByLocale === "object"
          ? { ...value.voiceByLocale }
          : {}
      };
    } catch (_error) {
      return { schemaVersion: 1, voiceByLocale: {} };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_error) {
      announce("浏览器拒绝保存语音偏好；当前页面仍可继续使用。");
    }
  }

  function handleStorageChange(event) {
    if (!entries.length) return;
    if (event.key === PROGRESS_KEY) {
      progress = cleanStoredProgress(readProgress());
      render({ announce: "已同步另一个标签页的学习进度。" });
    } else if (event.key === SETTINGS_KEY) {
      settings = readSettings();
      const entry = currentEntry();
      if (entry) renderVoiceOptions(entry);
    }
  }

  function announce(message) {
    ui.live.textContent = "";
    window.requestAnimationFrame(() => { ui.live.textContent = message; });
  }

  function setupConnectivity() {
    window.addEventListener("online", () => updateOfflineMessage("网络已恢复 · 页面继续使用本地词库", "ready"));
    window.addEventListener("offline", () => updateOfflineMessage("离线模式 · 页面与已缓存词库仍可使用", "offline"));

    const serviceWorkerAllowed = "serviceWorker" in navigator
      && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname));
    if (!serviceWorkerAllowed) {
      updateOfflineMessage("本地词库已启用 · HTTPS 或 localhost 下可安装离线缓存", "warning");
      return;
    }

    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        offlineCacheReady = true;
        updateOfflineMessage(
          navigator.onLine === false ? "离线模式 · 缓存已就绪" : "离线缓存已就绪 · 进度保存在当前浏览器",
          navigator.onLine === false ? "offline" : "ready"
        );
      })
      .catch(() => updateOfflineMessage("词库可正常使用 · 当前浏览器未能启用离线缓存", "warning"));
  }

  function updateOfflineMessage(message, state) {
    ui.offline.textContent = "";
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    ui.offline.append(dot, document.createTextNode(message));
    ui.offline.classList.toggle("is-ready", state === "ready");
    ui.offline.classList.toggle("is-offline", state === "offline");
  }

}

function speechAvailable() {
  return "speechSynthesis" in window;
}

function uniqueValues(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function uniqueBy(entries, keyFor, labelFor, compare = (a, b) => keyFor(a).localeCompare(keyFor(b), "zh-CN")) {
  const sorted = [...entries].sort(compare);
  const seen = new Set();
  const result = [];
  for (const entry of sorted) {
    const key = keyFor(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([key, labelFor(entry)]);
  }
  return result;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function setPaperLink(link, value, kind) {
  link.hidden = true;
  link.removeAttribute("href");
  const candidate = cleanText(value);
  if (!candidate) return "";

  try {
    const url = new URL(candidate, window.location.href);
    if (!(["http:", "https:"].includes(url.protocol))) return "";
    if (kind === "internal" && url.origin !== window.location.origin) return "";
    const safeHref = kind === "internal"
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
    link.setAttribute("href", safeHref);
    link.hidden = false;
    return safeHref;
  } catch (_error) {
    return "";
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}
