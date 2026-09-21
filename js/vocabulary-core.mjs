const KNOWLEDGE_STATES = new Set(["known", "review"]);
const FILTER_KEYS = ["language", "topic", "difficulty", "frequency", "source", "progress"];

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function progressEntry(progress, id) {
  const value = progress && progress[id];
  return value && typeof value === "object" ? value : {};
}

function normalizeSearchText(value) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]+/g, "")
    .toLocaleLowerCase();
}

function normalizeTermSurface(value) {
  return asText(value)
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\u00df/g, "ss")
    .replace(/\u03c2/g, "\u03c3")
    .replace(/\s+/g, " ")
    .normalize("NFKC");
}

function searchableText(entry) {
  const collocations = entry.collocations.flatMap(item => [item.term, item.meaningZh]);
  const related = entry.related.flatMap(item => [item.term, item.note]);
  const text = [
    entry.term,
    entry.language,
    entry.pronunciation.reading,
    entry.pronunciation.phonetic,
    entry.pronunciation.romanization,
    entry.grammar,
    entry.meaningZh,
    entry.example,
    entry.exampleZh,
    entry.source.label,
    entry.source.note,
    entry.source.paperTitle,
    entry.source.noteTitle,
    entry.source.section,
    entry.source.excerpt,
    entry.source.contextZh,
    ...entry.topics,
    ...collocations,
    ...related
  ].join(" ");
  return normalizeSearchText(text);
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function validateVocabularyData(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    throw new TypeError("词库数据必须是对象。");
  }
  if (payload.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    errors.push("entries 必须是非空数组");
  }

  const ids = new Set();
  for (const [index, entry] of (Array.isArray(payload.entries) ? payload.entries : []).entries()) {
    const prefix = `entries[${index}]`;
    for (const key of ["id", "term", "language", "languageCode", "locale", "grammar", "meaningZh", "example", "exampleZh"]) {
      if (!asText(entry && entry[key])) errors.push(`${prefix}.${key} 不能为空`);
    }
    if (entry && asText(entry.id)) {
      if (ids.has(entry.id)) errors.push(`${prefix}.id 重复：${entry.id}`);
      ids.add(entry.id);
    }
    if (!entry || !entry.pronunciation || !asText(entry.pronunciation.reading)) {
      errors.push(`${prefix}.pronunciation.reading 不能为空`);
    }
    if (!entry || !entry.speech || !asText(entry.speech.term) || !asText(entry.speech.locale)) {
      errors.push(`${prefix}.speech 需要 term 与 locale`);
    }
    if (!entry || !Array.isArray(entry.topics) || entry.topics.length === 0) {
      errors.push(`${prefix}.topics 必须是非空数组`);
    }
    if (!entry || !Array.isArray(entry.collocations) || entry.collocations.length === 0) {
      errors.push(`${prefix}.collocations 必须是非空数组`);
    }
    if (!entry || !Array.isArray(entry.related) || entry.related.length === 0) {
      errors.push(`${prefix}.related 必须是非空数组`);
    }
    if (!entry || !entry.difficulty || !asText(entry.difficulty.key) || !Number.isFinite(entry.difficulty.level)) {
      errors.push(`${prefix}.difficulty 无效`);
    }
    if (!entry || !entry.frequency || !asText(entry.frequency.band) || !Number.isFinite(entry.frequency.score)) {
      errors.push(`${prefix}.frequency 无效`);
    }
    if (!entry || !entry.source || !asText(entry.source.label)) {
      errors.push(`${prefix}.source.label 不能为空`);
    }
    if (entry && entry.languageCode === "ja" && !asText(entry.pronunciation.romanization)) {
      errors.push(`${prefix} 的日语词条需要罗马音`);
    }
    if (entry && entry.languageCode === "fr" && !asText(entry.grammar)) {
      errors.push(`${prefix} 的法语词条需要词性与性数信息`);
    }
  }

  if (errors.length) {
    throw new TypeError(`词库数据无效：${errors.slice(0, 8).join("；")}${errors.length > 8 ? "……" : ""}`);
  }
  return payload.entries;
}

export function mergeVocabularyDatasets(base, supplement = null) {
  validateVocabularyData(base);
  if (supplement !== null && supplement !== undefined) {
    if (!supplement || typeof supplement !== "object") {
      throw new TypeError("补充词库数据必须是对象。");
    }
    if (supplement.schemaVersion !== 1) {
      throw new TypeError("补充词库数据无效：schemaVersion 必须为 1");
    }
    if (!Array.isArray(supplement.entries)) {
      throw new TypeError("补充词库数据无效：entries 必须是数组");
    }
    if (supplement.entries.length) validateVocabularyData(supplement);
  }

  const baseEntries = base.entries;
  const supplementEntries = supplement?.entries || [];
  const entries = [...baseEntries, ...supplementEntries];
  const ids = new Map();
  const surfaces = new Map();

  for (const entry of entries) {
    const existingId = ids.get(entry.id);
    if (existingId) {
      throw new TypeError(`词库数据无效：词条 ID 重复：${entry.id}`);
    }
    ids.set(entry.id, entry);

    const surfaceKey = `${normalizeTermSurface(entry.languageCode)}\u0000${normalizeTermSurface(entry.term)}`;
    const existingSurfaces = surfaces.get(surfaceKey) || [];
    if (existingSurfaces.length) {
      const incomingSense = asText(entry.senseKey);
      const conflictingEntry = existingSurfaces.find(existingEntry => {
        const existingSense = asText(existingEntry.senseKey);
        return !(existingSense && incomingSense && existingSense !== incomingSense);
      });
      if (conflictingEntry) {
        throw new TypeError(
          `词库数据无效：同语言词面冲突：${conflictingEntry.term}（${conflictingEntry.id} / ${entry.id}）；如为不同义项，请为双方设置不同的 senseKey`
        );
      }
    }
    existingSurfaces.push(entry);
    surfaces.set(surfaceKey, existingSurfaces);
  }

  const updateDates = [asText(base.updatedAt), asText(supplement?.updatedAt)]
    .filter(Boolean)
    .sort();
  const updatedAt = updateDates[updateDates.length - 1];
  const merged = {
    ...base,
    entries
  };
  if (updatedAt) merged.updatedAt = updatedAt;
  validateVocabularyData(merged);
  return merged;
}

export function filterEntries(entries, progress, filters = {}) {
  const query = normalizeSearchText(filters.query);
  return entries.filter(entry => {
    if (query && !searchableText(entry).includes(query)) return false;
    if (filters.language && filters.language !== "all" && entry.languageCode !== filters.language) return false;
    if (filters.topic && filters.topic !== "all" && !entry.topics.includes(filters.topic)) return false;
    if (filters.difficulty && filters.difficulty !== "all" && entry.difficulty.key !== filters.difficulty) return false;
    if (filters.frequency && filters.frequency !== "all" && entry.frequency.band !== filters.frequency) return false;
    if (filters.source && filters.source !== "all" && entry.source.label !== filters.source) return false;

    const saved = progressEntry(progress, entry.id);
    if (filters.progress === "known" && saved.knowledge !== "known") return false;
    if (filters.progress === "review" && saved.knowledge !== "review") return false;
    if (filters.progress === "favorite" && saved.favorite !== true) return false;
    if (filters.progress === "new" && saved.knowledge) return false;
    return true;
  });
}

export function sortEntries(entries, progress, sort = "curated", shuffleSeed = 0) {
  const result = [...entries];
  const fallback = (a, b) => (a.curatedOrder || 0) - (b.curatedOrder || 0);
  const collator = new Intl.Collator(["zh-CN", "ja", "fr", "en"], { sensitivity: "base", numeric: true });
  if (sort === "frequency") {
    result.sort((a, b) => b.frequency.score - a.frequency.score || fallback(a, b));
  } else if (sort === "difficulty") {
    result.sort((a, b) => a.difficulty.level - b.difficulty.level || fallback(a, b));
  } else if (sort === "language") {
    result.sort((a, b) => collator.compare(a.language, b.language) || fallback(a, b));
  } else if (sort === "topic") {
    const topicKey = entry => [...entry.topics].sort(collator.compare).join(" · ");
    result.sort((a, b) => collator.compare(topicKey(a), topicKey(b)) || fallback(a, b));
  } else if (sort === "source") {
    result.sort((a, b) => collator.compare(a.source.label, b.source.label) || fallback(a, b));
  } else if (sort === "recent") {
    result.sort((a, b) => {
      const aTime = Date.parse(progressEntry(progress, a.id).reviewedAt || "") || 0;
      const bTime = Date.parse(progressEntry(progress, b.id).reviewedAt || "") || 0;
      return bTime - aTime || fallback(a, b);
    });
  } else if (sort === "alphabetical") {
    result.sort((a, b) => collator.compare(a.term, b.term) || fallback(a, b));
  } else if (sort === "shuffle") {
    result.sort((a, b) => stableHash(`${shuffleSeed}:${a.id}`) - stableHash(`${shuffleSeed}:${b.id}`));
  } else {
    result.sort(fallback);
  }
  return result;
}

export function updateProgress(progress, id, action, now = Date.now()) {
  const next = { ...(progress || {}) };
  const current = { ...progressEntry(progress, id) };
  const timestamp = new Date(now).toISOString();

  if (action === "favorite") {
    current.favorite = !current.favorite;
  } else if (action === "known") {
    current.knowledge = current.knowledge === "known" ? null : "known";
    current.reviewedAt = timestamp;
    current.dueAt = null;
  } else if (action === "review") {
    const enable = current.knowledge !== "review";
    current.knowledge = enable ? "review" : null;
    current.reviewedAt = timestamp;
    current.dueAt = enable ? new Date(now + 24 * 60 * 60 * 1000).toISOString() : null;
  } else {
    throw new RangeError(`未知学习动作：${action}`);
  }

  current.changedAt = timestamp;
  next[id] = current;
  return next;
}

export function progressCounts(entries, progress) {
  return entries.reduce((counts, entry) => {
    const saved = progressEntry(progress, entry.id);
    if (saved.knowledge === "known") counts.known += 1;
    if (saved.knowledge === "review") counts.review += 1;
    if (saved.favorite === true) counts.favorite += 1;
    return counts;
  }, { known: 0, review: 0, favorite: 0 });
}

export function chooseVoice(voices, locale, preferredURI = "") {
  const list = Array.from(voices || []);
  const normalizedLocale = asText(locale).toLocaleLowerCase();
  const language = normalizedLocale.split("-")[0];
  const exact = list.filter(voice => asText(voice.lang).toLocaleLowerCase() === normalizedLocale);
  const compatible = list.filter(voice => asText(voice.lang).toLocaleLowerCase().split("-")[0] === language);
  const candidates = [...exact, ...compatible.filter(voice => !exact.includes(voice))];
  return candidates.find(voice => voice.voiceURI === preferredURI)
    || candidates.find(voice => voice.default)
    || candidates[0]
    || null;
}

export function normalizedImportedProgress(payload, knownIds) {
  if (!payload || payload.schemaVersion !== 1 || !payload.progress || typeof payload.progress !== "object") {
    throw new TypeError("进度文件格式不正确。");
  }
  const allowed = new Set(knownIds);
  const clean = {};
  for (const [id, value] of Object.entries(payload.progress)) {
    if (!allowed.has(id) || !value || typeof value !== "object") continue;
    const item = {};
    if (KNOWLEDGE_STATES.has(value.knowledge)) item.knowledge = value.knowledge;
    if (value.favorite === true) item.favorite = true;
    for (const key of ["reviewedAt", "dueAt", "changedAt"]) {
      if (asText(value[key]) && Number.isFinite(Date.parse(value[key]))) item[key] = new Date(value[key]).toISOString();
    }
    if (Object.keys(item).length) clean[id] = item;
  }
  return clean;
}

export { FILTER_KEYS };
