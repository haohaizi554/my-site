let bank = { questions: [] };
let questions = [];
const STORAGE_APP_ID = "compiler-principles-quiz";
const STORAGE_SCHEMA_VERSION = 2;
const CANONICAL_HOST = "www.haohaizi554.cloud";
const GITHUB_PAGES_HOST = "haohaizi554.github.io";
const PROTECTED_HOSTS = new Set([CANONICAL_HOST, GITHUB_PAGES_HOST]);
redirectToCanonicalHost();
installPublicSiteProtection();
const STORAGE_SCOPE = getStorageScope();
const legacyProgressStorageKeys = [
  `${STORAGE_APP_ID}:personal-progress-v${STORAGE_SCHEMA_VERSION}`,
  "compiler-principles-quiz-progress-v1",
];
const legacyAttemptStorageKeys = [
  `${STORAGE_APP_ID}:active-attempt-v${STORAGE_SCHEMA_VERSION}`,
  "compiler-principles-quiz-active-attempt-v1",
];
const storageKey = `${STORAGE_APP_ID}:${STORAGE_SCOPE}:personal-progress-v${STORAGE_SCHEMA_VERSION}`;
const attemptStorageKey = `${STORAGE_APP_ID}:${STORAGE_SCOPE}:active-attempt-v${STORAGE_SCHEMA_VERSION}`;
const ALL_SECTIONS = "全部";
const RANDOM_SIZE = 20;
const EXAM_SIZE = 50;
const EXAM_TYPE_ORDER = ["single_choice", "multi_choice", "true_false", "long_answer"];
const AUTO_GRADED_TYPES = new Set(["single_choice", "multi_choice", "true_false"]);
const EXAM_TYPE_WEIGHTS = {
  single_choice: 0.44,
  multi_choice: 0.14,
  true_false: 0.34,
  long_answer: 0.08,
};
const QUESTION_POINTS = {
  single_choice: 1,
  multi_choice: 2,
  true_false: 1,
  long_answer: 10,
};

const state = {
  mode: "sequential",
  section: ALL_SECTIONS,
  queue: [],
  index: 0,
  selected: new Set(),
  progress: loadProgress(),
  draftAnswers: {},
  draftLongAnswers: {},
  flagged: {},
  results: {},
  sessionSubmitted: false,
  sessionSummary: null,
  restoredAttempt: false,
};

const $ = (id) => document.getElementById(id);

function redirectToCanonicalHost() {
  if (window.location.hostname !== GITHUB_PAGES_HOST) return;

  const target = new URL(window.location.href);
  target.protocol = "https:";
  target.hostname = CANONICAL_HOST;
  target.pathname = target.pathname.replace(/^\/my-site(?=\/|$)/, "") || "/";
  window.location.replace(target.toString());
}

function isProtectedPublicHost() {
  return PROTECTED_HOSTS.has(window.location.hostname);
}

function installPublicSiteProtection() {
  if (!isProtectedPublicHost()) return;

  const guardTitle = "\u5c0f \u03bb \u62b1\u4f4f\u9898\u5e93\u5566";
  const guardMessage = "\u8fd9\u91cc\u662f\u5237\u9898\u5c0f\u7a9d\uff0c\u4e0d\u5f00\u653e\u76f4\u63a5\u6252\u9898\u54e6\u3002\u7ee7\u7eed\u7b54\u9898\u5c31\u597d\u5566\u3002";
  const guardLockedLabel = "\u5c0f \u03bb \u6b63\u5728\u4fdd\u62a4\u9898\u5e93\uff5e\u5173\u6389\u8c03\u8bd5\u9762\u677f\u540e\u7ee7\u7eed\u5237\u9898";
  document.body.dataset.guardLabel = guardLockedLabel;
  const quizLayout = document.querySelector(".quiz-layout");
  if (quizLayout) quizLayout.dataset.guardLabel = guardLockedLabel;

  if (typeof window.installQuizRuntimeGuard === "function") {
    window.installQuizRuntimeGuard({
      onNotice: () => showGuardNotice(guardTitle, guardMessage),
      onLockChange: (locked) => document.body.classList.toggle("privacy-locked", locked),
    });
  }
}

function showGuardNotice(title, message) {
  let notice = document.querySelector(".guard-toast");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "guard-toast";
    notice.setAttribute("role", "status");
    notice.innerHTML = `
      <span class="guard-toast-mark" aria-hidden="true">\u03bb</span>
      <span class="guard-toast-copy">
        <strong></strong>
        <span></span>
      </span>
    `;
    document.body.appendChild(notice);
  }

  notice.querySelector("strong").textContent = title;
  notice.querySelector(".guard-toast-copy > span").textContent = message;
  notice.classList.add("show");
  clearTimeout(showGuardNotice.timer);
  showGuardNotice.timer = setTimeout(() => notice.classList.remove("show"), 2600);
}

function getStorageScope() {
  const clean = (value) => String(value || "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const host = clean(window.location.hostname);
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  if (window.location.hostname.endsWith("github.io") && pathParts[0]) {
    return clean(pathParts[0]);
  }

  return host || "local-file";
}

function loadProgress() {
  const currentPayload = readStorageJson(storageKey);
  if (currentPayload) return normalizeProgressPayload(currentPayload);

  for (const legacyKey of legacyProgressStorageKeys) {
    const legacyPayload = readStorageJson(legacyKey);
    if (!legacyPayload) continue;

    const migrated = normalizeProgressPayload(legacyPayload);
    if (Object.keys(migrated).length) {
      writeStorageJson(storageKey, createProgressPayload(migrated));
      return migrated;
    }
  }

  return {};
}

function saveProgress() {
  writeStorageJson(storageKey, createProgressPayload(state.progress), "浏览器无法保存学习记录，请检查本地存储权限。");
}

function readStorageJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(key, payload, failureMessage = "") {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    if (failureMessage) showNotice(failureMessage);
    return false;
  }
}

function removeStorageKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore localStorage cleanup failures
  }
}

function normalizeProgressPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  const records = payload.records || payload.progress || payload;
  if (!records || typeof records !== "object" || Array.isArray(records)) return {};

  return Object.fromEntries(
    Object.entries(records)
      .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => [id, { ...value }])
  );
}

function createProgressPayload(progress) {
  return {
    appId: STORAGE_APP_ID,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    origin: window.location.origin || "file://",
    bankSize: questions.length,
    records: progress,
  };
}

function readActiveAttemptPayload() {
  const currentPayload = readStorageJson(attemptStorageKey);
  if (currentPayload) return currentPayload;

  for (const legacyKey of legacyAttemptStorageKeys) {
    const legacyPayload = readStorageJson(legacyKey);
    if (!legacyPayload || !Array.isArray(legacyPayload.queueIds)) continue;

    const migrated = {
      ...legacyPayload,
      appId: STORAGE_APP_ID,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
    };
    writeStorageJson(attemptStorageKey, migrated);
    return migrated;
  }

  return null;
}

function hasAttemptActivity() {
  return state.index > 0
    || Object.keys(state.draftAnswers).length > 0
    || Object.values(state.draftLongAnswers).some((value) => String(value || "").trim())
    || Object.keys(state.flagged).length > 0;
}

function questionById() {
  return new Map(questions.map((question) => [question.id, question]));
}

function saveActiveAttempt() {
  if (state.sessionSubmitted || !state.queue.length) {
    clearActiveAttempt();
    return;
  }

  if (!hasAttemptActivity()) {
    clearActiveAttempt();
    return;
  }

  const payload = {
    appId: STORAGE_APP_ID,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    mode: state.mode,
    section: state.section,
    index: state.index,
    queueIds: state.queue.map((question) => question.id),
    draftAnswers: state.draftAnswers,
    draftLongAnswers: state.draftLongAnswers,
    flagged: state.flagged,
    savedAt: new Date().toISOString(),
  };

  writeStorageJson(attemptStorageKey, payload, "浏览器无法保存当前作答草稿，请检查本地存储权限。");
}

function clearActiveAttempt() {
  removeStorageKey(attemptStorageKey);
  legacyAttemptStorageKeys.forEach(removeStorageKey);
}

function restoreActiveAttempt() {
  try {
    const payload = readActiveAttemptPayload();
    if (!payload || !Array.isArray(payload.queueIds) || !payload.queueIds.length) return false;

    const map = questionById();
    const queue = payload.queueIds.map((id) => map.get(id)).filter(Boolean);
    if (queue.length !== payload.queueIds.length) return false;

    state.mode = payload.mode || "sequential";
    state.section = payload.section || ALL_SECTIONS;
    state.queue = queue;
    state.index = Math.min(Math.max(Number(payload.index) || 0, 0), queue.length - 1);
    state.selected = new Set();
    state.draftAnswers = payload.draftAnswers || {};
    state.draftLongAnswers = payload.draftLongAnswers || {};
    state.flagged = payload.flagged || {};
    state.results = {};
    state.sessionSubmitted = false;
    state.sessionSummary = null;
    state.restoredAttempt = true;
    return true;
  } catch {
    return false;
  }
}

function exportLearningArchive() {
  saveProgress();
  saveActiveAttempt();

  const archive = {
    appId: STORAGE_APP_ID,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin || "file://",
    bankSize: questions.length,
    progress: state.progress,
    activeAttempt: readActiveAttemptPayload(),
  };
  const date = new Date().toISOString().slice(0, 10);
  const filename = `编译原理学习档案-${date}.json`;
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showNotice("学习档案已导出，换设备时导入它就能接上进度。");
}

async function importLearningArchive(file) {
  if (!file) return;

  let archive;
  try {
    archive = JSON.parse(await file.text());
  } catch {
    showNotice("这个文件不是可识别的学习档案 JSON。");
    return;
  }

  const importedProgress = normalizeProgressPayload(archive);
  const importedAttempt = archive?.activeAttempt && Array.isArray(archive.activeAttempt.queueIds)
    ? {
      ...archive.activeAttempt,
      appId: STORAGE_APP_ID,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
    }
    : null;
  const recordCount = Object.keys(importedProgress).length;

  if (!recordCount && !importedAttempt) {
    showNotice("这个档案里没有可恢复的做题记录。");
    return;
  }

  const confirmed = await showCuteDialog({
    title: "导入学习档案吗？",
    message: `会用档案里的 ${recordCount} 条做题记录覆盖当前浏览器记录。导入后，小 λ 会帮你继续接上学习进度。`,
    confirmText: "导入档案",
    cancelText: "先不导入",
  });
  if (!confirmed) return;

  state.progress = importedProgress;
  saveProgress();

  if (importedAttempt) {
    writeStorageJson(attemptStorageKey, importedAttempt, "浏览器无法保存导入的作答草稿。");
  } else {
    clearActiveAttempt();
  }

  state.draftAnswers = {};
  state.draftLongAnswers = {};
  state.flagged = {};
  state.results = {};
  state.sessionSubmitted = false;
  state.sessionSummary = null;
  state.restoredAttempt = false;

  if (importedAttempt && restoreActiveAttempt()) {
    renderAll();
  } else {
    buildQueue();
  }

  showNotice(`已导入 ${recordCount} 条学习记录。`);
}
function questionTypeName(type) {
  return {
    single_choice: "单选",
    multi_choice: "多选",
    true_false: "判断",
    long_answer: "综合",
  }[type] || type;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderText(text = "") {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderInlineMarkdown(text = "") {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function splitMarkdownCells(line) {
  const source = line.trim();
  const start = source.startsWith("|") ? 1 : 0;
  const end = source.endsWith("|") ? source.length - 1 : source.length;
  const cells = [];
  let cell = "";
  let inInlineCode = false;
  let escaped = false;

  for (let index = start; index < end; index += 1) {
    const char = source[index];

    if (char === "`" && !escaped) {
      inInlineCode = !inInlineCode;
      cell += char;
      escaped = false;
      continue;
    }

    if (char === "|" && !inInlineCode && !escaped) {
      cells.push(cell.trim());
      cell = "";
      escaped = false;
      continue;
    }

    cell += char;
    escaped = char === "\\" && !escaped;
  }

  cells.push(cell.trim());
  return cells;
}

function isMarkdownTable(lines, index) {
  return /^\s*\|.+\|\s*$/.test(lines[index] || "")
    && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || "");
}

function renderMarkdown(text = "") {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const language = line.trim().replace(/^```/, "").trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(`<pre><code${language ? ` data-lang="${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (isMarkdownTable(lines, i)) {
      const headers = splitMarkdownCells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        rows.push(splitMarkdownCells(lines[i]));
        i += 1;
      }
      blocks.push(`
        <div class="md-table-wrap">
          <table>
            <thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      `);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^```/.test(lines[i].trim())
      && !isMarkdownTable(lines, i)
      && !/^(#{1,4})\s+/.test(lines[i])
      && !/^\s*-\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }

  return `<div class="markdown-body">${blocks.join("")}</div>`;
}

function sections() {
  return [ALL_SECTIONS, ...Array.from(new Set(questions.map((q) => q.section)))];
}

function isAutoGraded(question) {
  return AUTO_GRADED_TYPES.has(question?.type);
}

function questionPoints(question) {
  return QUESTION_POINTS[question?.type] || 0;
}

function formatScore(score) {
  const value = Number(score) || 0;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function longGradeScore(grade, points) {
  const value = Number(grade);
  if (value === 2) return points;
  if (value === 1) return points / 2;
  return 0;
}

function longGradeLabel(grade) {
  return {
    0: "不会",
    1: "半会",
    2: "掌握",
  }[Number(grade)] || "未自评";
}

function refreshSessionSummary() {
  if (!state.sessionSubmitted) return;

  const totalPoints = state.queue.reduce((sum, question) => sum + questionPoints(question), 0);
  const earnedPoints = Object.values(state.results).reduce((sum, result) => sum + (Number(result.earned) || 0), 0);
  const skipped = state.queue.filter((question) => isAutoGraded(question) && !state.draftAnswers[question.id]).length;
  const pendingLong = state.queue.filter((question) => question.type === "long_answer" && state.results[question.id]?.selfGrade === undefined).length;

  state.sessionSummary = {
    totalPoints,
    earnedPoints,
    skipped,
    pendingLong,
    rate: totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0,
  };
}

function sessionSummaryText() {
  if (!state.sessionSummary) return "本组已交卷";
  const pending = state.sessionSummary.pendingLong ? ` · 综合题待自评 ${state.sessionSummary.pendingLong} 题` : "";
  const skipped = state.sessionSummary.skipped ? ` · 客观题未答 ${state.sessionSummary.skipped} 题` : "";
  return `得分 ${formatScore(state.sessionSummary.earnedPoints)}/${formatScore(state.sessionSummary.totalPoints)} 分 · 得分率 ${state.sessionSummary.rate}%${pending}${skipped}`;
}

function filteredQuestions() {
  let list = questions;
  if (state.section !== ALL_SECTIONS) list = list.filter((q) => q.section === state.section);
  if (state.mode === "wrong") list = list.filter((q) => state.progress[q.id]?.isWrongBook);
  if (state.mode === "exam") list = list.filter((question) => QUESTION_POINTS[question.type]);
  return list;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function groupBy(list, keyOf) {
  return list.reduce((groups, item) => {
    const key = keyOf(item);
    groups[key] ||= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function allocateCounts(groups, total, weights = {}) {
  const keys = Object.keys(groups).filter((key) => groups[key]?.length);
  const capacity = keys.reduce((sum, key) => sum + groups[key].length, 0);
  const target = Math.min(total, capacity);
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  if (!keys.length || target <= 0) return counts;

  let remainingKeys = [...keys];
  let remainingTotal = target;

  while (remainingKeys.length && remainingTotal > 0) {
    const weightSum = remainingKeys.reduce((sum, key) => sum + (weights[key] ?? 1), 0);
    const desired = remainingKeys.map((key) => {
      const raw = (remainingTotal * (weights[key] ?? 1)) / weightSum;
      const count = Math.min(groups[key].length - counts[key], Math.floor(raw));
      return { key, raw, count, remainder: raw - Math.floor(raw) };
    });

    let assigned = 0;
    for (const item of desired) {
      counts[item.key] += item.count;
      assigned += item.count;
    }

    let left = remainingTotal - assigned;
    for (const item of desired.sort((a, b) => b.remainder - a.remainder)) {
      if (left <= 0) break;
      if (counts[item.key] < groups[item.key].length) {
        counts[item.key] += 1;
        left -= 1;
      }
    }

    const nextRemaining = target - Object.values(counts).reduce((sum, count) => sum + count, 0);
    const nextKeys = remainingKeys.filter((key) => counts[key] < groups[key].length);
    if (nextRemaining === remainingTotal || !nextKeys.length) break;
    remainingTotal = nextRemaining;
    remainingKeys = nextKeys;
  }

  return counts;
}

function sampleAcrossSections(list, count) {
  const sectionGroups = groupBy(list, (question) => question.section || "未分类");
  const sectionCounts = allocateCounts(sectionGroups, count);
  return Object.entries(sectionCounts).flatMap(([section, amount]) => shuffle(sectionGroups[section]).slice(0, amount));
}

function buildExamQueue(list) {
  const candidates = list.filter((question) => QUESTION_POINTS[question.type]);
  const target = Math.min(EXAM_SIZE, candidates.length);
  const typeGroups = groupBy(candidates, (question) => question.type);
  const typeCounts = allocateCounts(typeGroups, target, EXAM_TYPE_WEIGHTS);
  const selected = [];
  const used = new Set();

  for (const type of EXAM_TYPE_ORDER) {
    const amount = typeCounts[type] || 0;
    if (!amount || !typeGroups[type]) continue;
    const picked = shuffle(sampleAcrossSections(typeGroups[type], amount));
    for (const question of picked) {
      selected.push(question);
      used.add(question.id);
    }
  }

  if (selected.length < target) {
    const restByType = groupBy(candidates.filter((question) => !used.has(question.id)), (question) => question.type);
    for (const type of EXAM_TYPE_ORDER) {
      if (selected.length >= target) break;
      const rest = shuffle(restByType[type] || []);
      for (const question of rest) {
        if (selected.length >= target) break;
        selected.push(question);
        used.add(question.id);
      }
    }
  }

  return selected;
}

function buildQueue() {
  const list = filteredQuestions();
  if (state.mode === "random") {
    state.queue = shuffle(list).slice(0, Math.min(RANDOM_SIZE, list.length));
  } else if (state.mode === "exam") {
    state.queue = buildExamQueue(list);
  } else {
    state.queue = [...list];
  }

  state.index = 0;
  state.selected = new Set();
  state.draftAnswers = {};
  state.draftLongAnswers = {};
  state.flagged = {};
  state.results = {};
  state.sessionSubmitted = false;
  state.sessionSummary = null;
  state.restoredAttempt = false;
  clearActiveAttempt();
  renderAll();
  saveActiveAttempt();
}

function currentQuestion() {
  return state.queue[state.index];
}

function answerOfSelection() {
  return Array.from(state.selected).sort().join("");
}

function selectedFromAnswer(answer = "") {
  return new Set(String(answer).split("").filter(Boolean));
}

function currentDraftAnswer(question) {
  return state.draftAnswers[question.id] || "";
}

function answeredCount() {
  return state.queue.filter((question) => {
    if (isAutoGraded(question)) return Boolean(state.draftAnswers[question.id]);
    return Boolean((state.draftLongAnswers[question.id] || "").trim());
  }).length;
}

function unansweredCount() {
  return state.queue.length - answeredCount();
}

function flaggedCount() {
  return state.queue.filter((question) => state.flagged[question.id]).length;
}

function recordChoice(question, answer, correct) {
  const old = state.progress[question.id] || { attempts: 0, correct: 0 };
  state.progress[question.id] = {
    attempts: old.attempts + 1,
    correct: old.correct + (correct ? 1 : 0),
    lastAnswer: answer,
    lastResult: correct,
    isWrongBook: !correct,
    updatedAt: new Date().toISOString(),
  };
}

function recordLongAnswer(question, grade) {
  if (!question) return;

  const points = questionPoints(question);
  const earned = longGradeScore(grade, points);
  const old = state.progress[question.id] || { attempts: 0, correct: 0 };
  const mastered = Number(grade) === 2;
  const previousGrade = state.results[question.id]?.selfGrade;
  const previousMastered = Number(previousGrade) === 2;
  const isUpdate = previousGrade !== undefined;

  state.progress[question.id] = {
    attempts: old.attempts + (isUpdate ? 0 : 1),
    correct: Math.max(0, old.correct - (isUpdate && previousMastered ? 1 : 0) + (mastered ? 1 : 0)),
    lastAnswer: String(grade),
    lastResult: mastered,
    isWrongBook: !mastered,
    updatedAt: new Date().toISOString(),
  };

  state.results[question.id] = {
    ...(state.results[question.id] || {}),
    type: "long_answer",
    answer: state.draftLongAnswers[question.id] || "",
    points,
    earned,
    pending: false,
    selfGrade: Number(grade),
  };

  refreshSessionSummary();
  saveProgress();
  renderDashboard();
  renderStats();

  const feedback = $("feedback");
  feedback.style.display = "block";
  feedback.className = "feedback compact";
  feedback.innerHTML = renderMarkdown(`本题 ${formatScore(points)} 分，自评：${longGradeLabel(grade)}，得分 ${formatScore(earned)} 分。\n\n${question.explanation || "暂无参考答案"}`);
  $("selfGrade").style.display = "flex";
}

function renderDashboard() {
  const values = Object.values(state.progress);
  const attempted = values.filter((item) => item.attempts > 0).length;
  const totalAttempts = values.reduce((sum, item) => sum + item.attempts, 0);
  const correctAttempts = values.reduce((sum, item) => sum + item.correct, 0);
  const wrong = values.filter((item) => item.isWrongBook).length;
  $("attemptedCount").textContent = `${attempted}/${questions.length}`;
  $("accuracyRate").textContent = totalAttempts ? `${Math.round((correctAttempts / totalAttempts) * 100)}%` : "0%";
  $("wrongCount").textContent = wrong;
  $("queueCount").textContent = `${answeredCount()}/${state.queue.length}`;
  $("bankMeta").textContent = `${questions.length} 题 · ${new Date(bank.generatedAt || Date.now()).toLocaleDateString("zh-CN")}`;
  $("wrongNavCount").textContent = wrong;
  $("wrongNavCount").classList.toggle("show", wrong > 0);
}

function renderQuestion() {
  const question = currentQuestion();
  const feedback = $("feedback");
  const answerBox = $("longAnswer");
  const showReference = $("showReference");
  const submit = $("submitAnswer");
  const selfGrade = $("selfGrade");
  const mark = $("markQuestion");
  const clear = $("clearAnswer");

  feedback.style.display = "none";
  feedback.className = "feedback";
  feedback.innerHTML = "";
  selfGrade.style.display = "none";
  state.selected = new Set();

  if (!question) {
    $("questionSection").textContent = state.mode === "wrong" ? "暂无错题" : "暂无题目";
    $("questionType").textContent = "空";
    $("progressText").textContent = "0 / 0";
    $("questionTitle").textContent = "当前范围没有题目";
    $("questionPrompt").textContent = state.mode === "exam"
      ? "当前范围没有可自动判分的题目，请切换章节或练习模式。"
      : "换一个章节或模式继续。";
    $("options").innerHTML = "";
    answerBox.style.display = "none";
    showReference.style.display = "none";
    submit.style.display = "none";
    mark.disabled = true;
    clear.disabled = true;
    return;
  }

  const isLong = question.type === "long_answer";
  const isAnswered = isAutoGraded(question)
    ? Boolean(state.draftAnswers[question.id])
    : Boolean((state.draftLongAnswers[question.id] || "").trim());

  $("questionSection").textContent = question.section;
  $("questionType").textContent = `${questionTypeName(question.type)} · ${questionPoints(question)} 分 · ${state.sessionSubmitted ? "讲评" : isAnswered ? "已答" : "未答"}`;
  $("progressText").textContent = `${state.index + 1} / ${state.queue.length}`;
  $("questionTitle").textContent = question.title;
  $("questionPrompt").innerHTML = renderText(question.prompt);

  answerBox.style.display = isLong ? "block" : "none";
  answerBox.disabled = state.sessionSubmitted;
  answerBox.value = state.draftLongAnswers[question.id] || "";
  showReference.style.display = isLong && state.sessionSubmitted ? "inline-flex" : "none";
  submit.style.display = "inline-flex";
  submit.textContent = state.sessionSubmitted ? "重新开始本组" : "交卷并看结果";
  mark.disabled = state.sessionSubmitted;
  mark.textContent = state.flagged[question.id] ? "取消标记" : "标记本题";
  mark.classList.toggle("marked", Boolean(state.flagged[question.id]));
  clear.disabled = state.sessionSubmitted || (!isAnswered && !isLong);
  clear.textContent = isLong ? "清空作答" : "清除答案";

  if (isAutoGraded(question)) {
    state.selected = selectedFromAnswer(currentDraftAnswer(question));
    $("options").innerHTML = question.options.map((option) => renderOption(question, option)).join("");
  } else {
    $("options").innerHTML = "";
  }

  $("prevQuestion").disabled = state.index === 0;
  $("nextQuestion").disabled = state.index >= state.queue.length - 1 && state.sessionSubmitted;
  $("nextQuestion").textContent = state.index >= state.queue.length - 1 && !state.sessionSubmitted ? "完成" : "下一题";

  if (state.sessionSubmitted) {
    renderReviewFeedback(question);
  }
}

function renderOption(question, option) {
  const draft = currentDraftAnswer(question);
  const selected = draft.includes(option.key);
  const result = state.results[question.id];
  const correctKey = state.sessionSubmitted && question.answer.includes(option.key);
  const wrongKey = state.sessionSubmitted && selected && !question.answer.includes(option.key);
  const classes = [
    "option",
    selected ? "selected" : "",
    correctKey ? "correct" : "",
    wrongKey ? "wrong" : "",
    state.sessionSubmitted ? "review-locked" : "",
  ].filter(Boolean).join(" ");

  return `
    <button class="${classes}" data-option="${option.key}" ${state.sessionSubmitted ? "disabled" : ""}>
      <span class="option-key">${option.key}</span>
      <span>${renderText(option.text)}</span>
      ${result && selected ? `<span class="option-mark">你的选择</span>` : ""}
    </button>
  `;
}

function showNotice(message) {
  const feedback = $("feedback");
  feedback.style.display = "block";
  feedback.className = "feedback";
  feedback.innerHTML = renderText(message);
}

function showPassiveNotice(message) {
  const feedback = $("feedback");
  feedback.style.display = "block";
  feedback.className = "feedback compact";
  feedback.innerHTML = renderMarkdown(message);
}

function renderAttemptPanel() {
  const answered = answeredCount();
  const flagged = flaggedCount();
  $("attemptStatusText").textContent = `${answered} / ${state.queue.length} 已答${flagged ? ` · ${flagged} 标记` : ""}`;
  $("attemptGrid").innerHTML = state.queue.map((question, index) => {
    const result = state.results[question.id];
    const auto = isAutoGraded(question);
    const answeredClass = isAutoGraded(question)
      ? Boolean(state.draftAnswers[question.id])
      : Boolean((state.draftLongAnswers[question.id] || "").trim());
    const classes = [
      "attempt-cell",
      index === state.index ? "current" : "",
      answeredClass ? "answered" : "",
      state.flagged[question.id] ? "flagged" : "",
      state.sessionSubmitted && auto && result?.correct ? "correct" : "",
      state.sessionSubmitted && auto && result && !result.correct && !result.skipped ? "wrong" : "",
      state.sessionSubmitted && auto && result?.skipped ? "skipped" : "",
    ].filter(Boolean).join(" ");
    return `<button class="${classes}" data-jump="${index}" title="第 ${index + 1} 题">${index + 1}</button>`;
  }).join("");
}

let lastQuestionViewportKey = "";

function resetQuestionWorkspaceIfNeeded() {
  const question = currentQuestion();
  const workspace = document.querySelector(".question-workspace");
  if (!question || !workspace) return;

  const viewportKey = `${state.mode}:${question.id}:${state.sessionSubmitted ? "review" : "answer"}`;
  if (lastQuestionViewportKey === viewportKey) return;

  workspace.scrollTop = 0;
  lastQuestionViewportKey = viewportKey;
}

function scrollAttemptGridToCurrent() {
  const grid = $("attemptGrid");
  if (!grid) return;

  const current = grid.querySelector(".attempt-cell.current");
  if (!current) return;

  const padding = 12;
  const currentTop = current.offsetTop;
  const currentBottom = currentTop + current.offsetHeight;
  const visibleTop = grid.scrollTop + padding;
  const visibleBottom = grid.scrollTop + grid.clientHeight - padding;

  if (currentTop < visibleTop) {
    grid.scrollTop = Math.max(0, currentTop - padding);
  } else if (currentBottom > visibleBottom) {
    grid.scrollTop = currentBottom - grid.clientHeight + padding;
  }
}

function renderStats() {
  const grouped = {};
  for (const question of questions) {
    grouped[question.section] ||= [];
    grouped[question.section].push(question);
  }

  $("sectionStats").innerHTML = Object.entries(grouped).map(([section, items]) => {
    const records = items.map((q) => state.progress[q.id]).filter(Boolean);
    const attempts = records.reduce((sum, item) => sum + item.attempts, 0);
    const correct = records.reduce((sum, item) => sum + item.correct, 0);
    const rate = attempts ? Math.round((correct / attempts) * 100) : 0;
    return `
      <div class="stat-row">
        <strong>${section}</strong>
        <div class="bar"><span style="width:${rate}%"></span></div>
        <p>${items.length} 题 · 正确率 ${rate}%</p>
      </div>
    `;
  }).join("");

  const wrongItems = questions.filter((q) => state.progress[q.id]?.isWrongBook);
  $("wrongList").innerHTML = wrongItems.length
    ? wrongItems.slice(0, 30).map((q) => `
      <div class="wrong-item">
        <strong>${q.section} · ${questionTypeName(q.type)}</strong>
        <span>${escapeHtml(q.title)}</span>
      </div>
    `).join("")
    : `<div class="wrong-item"><strong>错题本为空</strong><span>继续保持。</span></div>`;
}

function renderAll() {
  renderDashboard();
  renderQuestion();
  resetQuestionWorkspaceIfNeeded();
  renderAttemptPanel();
  scrollAttemptGridToCurrent();
  renderStats();
  if (state.restoredAttempt) {
    state.restoredAttempt = false;
    showPassiveNotice("已恢复上次未交卷的作答进度。");
  }
}

function setActiveNav(activeButton) {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function setActiveModeNav() {
  const modeButton = document.querySelector(`[data-action="mode"][data-mode="${state.mode}"]`);
  if (modeButton) setActiveNav(modeButton);
}

function renderReviewFeedback(question) {
  const feedback = $("feedback");
  const points = questionPoints(question);

  if (!isAutoGraded(question)) {
    const result = state.results[question.id] || {};
    const gradeLine = result.selfGrade === undefined
      ? `本题 ${formatScore(points)} 分，待自评。`
      : `本题 ${formatScore(points)} 分，自评：${longGradeLabel(result.selfGrade)}，得分 ${formatScore(result.earned)} 分。`;
    feedback.style.display = "block";
    feedback.className = "feedback compact";
    feedback.innerHTML = renderMarkdown(`${gradeLine}\n\n综合题请点击“查看参考答案”，再按掌握情况自评。`);
    return;
  }

  const result = state.results[question.id];
  const correct = Boolean(result?.correct);
  feedback.style.display = "block";
  feedback.className = `feedback ${correct ? "good" : result?.skipped ? "" : "bad"}`;
  feedback.innerHTML = renderMarkdown(`本题 ${formatScore(points)} 分，得分 ${formatScore(result?.earned || 0)} 分。\n${correct ? "本题正确" : result?.skipped ? "本题未作答" : "本题错误"}\n你的答案：${result?.answer || "未作答"}\n正确答案：${question.answer}\n\n${question.explanation || "暂无解析"}`);
}

function submitSession() {
  if (!state.queue.length) return;

  if (state.sessionSubmitted) {
    buildQueue();
    return;
  }

  openSubmitDialog();
}

function openSubmitDialog() {
  const answered = answeredCount();
  const missing = unansweredCount();
  const flagged = flaggedCount();
  const totalPoints = state.queue.reduce((sum, question) => sum + questionPoints(question), 0);
  const longCount = state.queue.filter((question) => question.type === "long_answer").length;
  $("submitDialogText").textContent = `本组共 ${state.queue.length} 题，总分 ${formatScore(totalPoints)} 分；已答 ${answered} 题，未答 ${missing} 题，综合题 ${longCount} 题，标记 ${flagged} 题。交卷后客观题自动判分，综合题需要对照参考答案自评给分。`;
  $("submitOverlay").classList.remove("hidden");
}

function closeSubmitDialog() {
  $("submitOverlay").classList.add("hidden");
}

function finalizeSession() {
  state.results = {};

  for (const question of state.queue) {
    const points = questionPoints(question);

    if (question.type === "long_answer") {
      state.results[question.id] = {
        type: "long_answer",
        answer: state.draftLongAnswers[question.id] || "",
        points,
        earned: 0,
        pending: true,
      };
      continue;
    }

    const answer = state.draftAnswers[question.id] || "";
    const hasAnswer = Boolean(answer);
    const ok = hasAnswer && answer === question.answer;
    const earned = ok ? points : 0;
    state.results[question.id] = {
      answer,
      correct: ok,
      skipped: !hasAnswer,
      points,
      earned,
    };

    const countsInProgress = state.mode === "exam" || hasAnswer;
    if (countsInProgress) recordChoice(question, answer, ok);
  }

  state.sessionSubmitted = true;
  refreshSessionSummary();
  saveProgress();
  clearActiveAttempt();
  renderAll();
}

function chooseOption(key) {
  const question = currentQuestion();
  if (!question || !isAutoGraded(question) || state.sessionSubmitted) return;

  if (question.type === "multi_choice") {
    state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
  } else {
    state.selected = new Set([key]);
  }

  const answer = answerOfSelection();
  if (answer) {
    state.draftAnswers[question.id] = answer;
  } else {
    delete state.draftAnswers[question.id];
  }

  renderDashboard();
  renderQuestion();
  renderAttemptPanel();
  saveActiveAttempt();
}

function goNext() {
  if (state.index < state.queue.length - 1) {
    state.index += 1;
    renderAll();
    saveActiveAttempt();
    return;
  }

  if (!state.sessionSubmitted) {
    submitSession();
  }
}

function goPrev() {
  if (state.index > 0) {
    state.index -= 1;
    renderAll();
    saveActiveAttempt();
  }
}

function toggleFlagCurrent() {
  const question = currentQuestion();
  if (!question || state.sessionSubmitted) return;
  state.flagged[question.id] = !state.flagged[question.id];
  if (!state.flagged[question.id]) delete state.flagged[question.id];
  renderDashboard();
  renderQuestion();
  renderAttemptPanel();
  saveActiveAttempt();
}

function jumpFirstUnanswered() {
  const index = state.queue.findIndex((question) => {
    if (isAutoGraded(question)) return !state.draftAnswers[question.id];
    return !(state.draftLongAnswers[question.id] || "").trim();
  });
  if (index >= 0) {
    state.index = index;
    renderAll();
    saveActiveAttempt();
  } else {
    showNotice("当前题组没有未答题。");
  }
}

function clearCurrentAnswer() {
  const question = currentQuestion();
  if (!question || state.sessionSubmitted) return;

  if (isAutoGraded(question)) {
    delete state.draftAnswers[question.id];
    state.selected = new Set();
  } else if (question.type === "long_answer") {
    delete state.draftLongAnswers[question.id];
  }

  renderDashboard();
  renderQuestion();
  renderAttemptPanel();
  saveActiveAttempt();
}

function closeSectionCuteMenu() {
  const menu = $("sectionCuteMenu");
  const trigger = $("sectionCuteTrigger");
  const shell = $("sectionCuteSelect");
  if (!menu || !trigger) return;
  menu.classList.add("hidden");
  trigger.setAttribute("aria-expanded", "false");
  shell?.classList.remove("open-up");
}

function syncSectionCuteSelect() {
  const select = $("sectionSelect");
  const value = select?.value || state.section || ALL_SECTIONS;
  const label = $("sectionCuteValue");
  const menu = $("sectionCuteMenu");
  if (label) label.textContent = value;
  if (!menu) return;

  menu.querySelectorAll("[data-section-option]").forEach((option) => {
    const selected = option.dataset.sectionOption === value;
    option.classList.toggle("active", selected);
    option.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function renderSectionCuteOptions() {
  const menu = $("sectionCuteMenu");
  if (!menu) return;
  menu.innerHTML = sections().map((section) => `
    <button class="cute-select-option" type="button" role="option" data-section-option="${escapeHtml(section)}">
      <span>${escapeHtml(section)}</span>
    </button>
  `).join("");
  syncSectionCuteSelect();
}

async function confirmDiscardActiveAttempt(actionText = "切换题组") {
  if (!hasAttemptActivity() || state.sessionSubmitted) return true;

  return showCuteDialog({
    title: "要离开当前题组吗？",
    message: `你这一组还没有交卷，${actionText} 会清空当前未交卷的选择、综合题草稿和标记。确定继续吗？`,
    confirmText: "继续切换",
    cancelText: "留下继续做",
  });
}

function applySection(section, { rebuild = true } = {}) {
  const nextSection = sections().includes(section) ? section : ALL_SECTIONS;
  const select = $("sectionSelect");
  if (select) select.value = nextSection;
  state.section = nextSection;
  closeSectionCuteMenu();
  syncSectionCuteSelect();
  if (rebuild) buildQueue();
}

async function selectSection(section, { rebuild = true } = {}) {
  const nextSection = sections().includes(section) ? section : ALL_SECTIONS;
  if (nextSection === state.section) {
    closeSectionCuteMenu();
    syncSectionCuteSelect();
    return;
  }

  const confirmed = await confirmDiscardActiveAttempt("切换章节");
  if (!confirmed) {
    closeSectionCuteMenu();
    syncSectionCuteSelect();
    return;
  }

  applySection(nextSection, { rebuild });
}

function isSectionCuteMenuOpen() {
  const menu = $("sectionCuteMenu");
  return Boolean(menu && !menu.classList.contains("hidden"));
}

function focusSectionOption(direction = 1) {
  const menu = $("sectionCuteMenu");
  if (!menu) return;
  const options = Array.from(menu.querySelectorAll("[data-section-option]"));
  if (!options.length) return;
  const currentIndex = Math.max(0, options.indexOf(document.activeElement));
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

function positionSectionCuteMenu() {
  const menu = $("sectionCuteMenu");
  const trigger = $("sectionCuteTrigger");
  const shell = $("sectionCuteSelect");
  if (!menu || !trigger || !shell) return;

  const rect = trigger.getBoundingClientRect();
  const margin = 24;
  const gap = 12;
  const below = window.innerHeight - rect.bottom - margin;
  const above = rect.top - margin;
  const openUp = below < 240 && above > below;
  const available = Math.max(150, Math.min(310, (openUp ? above : below) - gap));

  shell.classList.toggle("open-up", openUp);
  menu.style.setProperty("--cute-menu-max-height", `${available}px`);
}

function toggleSectionCuteMenu() {
  const menu = $("sectionCuteMenu");
  const trigger = $("sectionCuteTrigger");
  if (!menu || !trigger) return;
  const opening = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !opening);
  trigger.setAttribute("aria-expanded", opening ? "true" : "false");
  if (opening) {
    syncSectionCuteSelect();
    positionSectionCuteMenu();
    requestAnimationFrame(() => {
      positionSectionCuteMenu();
      const active = menu.querySelector(".cute-select-option.active");
      const first = menu.querySelector("[data-section-option]");
      (active || first)?.focus();
    });
  }
}

function handleSectionCuteKeydown(event) {
  if (!isSectionCuteMenuOpen()) return false;

  if (event.key === "Escape") {
    event.preventDefault();
    closeSectionCuteMenu();
    $("sectionCuteTrigger")?.focus();
    return true;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusSectionOption(1);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusSectionOption(-1);
    return true;
  }

  if (event.key === "Enter" || event.key === " ") {
    const option = event.target.closest?.("[data-section-option]");
    if (option) {
      event.preventDefault();
      selectSection(option.dataset.sectionOption);
      $("sectionCuteTrigger")?.focus();
      return true;
    }
  }

  event.preventDefault();
  return true;
}

let cuteDialogResolver = null;

function closeCuteDialog(value = false) {
  const overlay = $("cuteDialog");
  if (!overlay || !cuteDialogResolver) return;

  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  const resolve = cuteDialogResolver;
  cuteDialogResolver = null;
  resolve(value);
}

function showCuteDialog({
  title = "确认一下",
  message = "",
  confirmText = "好的",
  cancelText = "先等等",
} = {}) {
  const overlay = $("cuteDialog");
  const titleNode = $("cuteDialogTitle");
  const messageNode = $("cuteDialogText");
  const confirmButton = $("cuteDialogConfirm");
  const cancelButton = $("cuteDialogCancel");

  titleNode.textContent = title;
  messageNode.textContent = message;
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;

  if (cuteDialogResolver) closeCuteDialog(false);

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => confirmButton.focus());

  return new Promise((resolve) => {
    cuteDialogResolver = resolve;
  });
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const option = event.target.closest(".option");
    if (option) {
      chooseOption(option.dataset.option);
    }

    const jumpButton = event.target.closest("[data-jump]");
    if (jumpButton) {
      state.index = Number(jumpButton.dataset.jump);
      renderAll();
      saveActiveAttempt();
    }

    const modeButton = event.target.closest("[data-action='mode']");
    if (modeButton) {
      const nextMode = modeButton.dataset.mode;
      if (nextMode === state.mode) {
        setActiveNav(modeButton);
        $("statsPanel").classList.add("hidden");
        $("quizPanel").classList.remove("hidden");
        renderAll();
        return;
      }

      const confirmed = await confirmDiscardActiveAttempt("切换练习模式");
      if (!confirmed) return;

      state.mode = nextMode;
      setActiveNav(modeButton);
      $("statsPanel").classList.add("hidden");
      $("quizPanel").classList.remove("hidden");
      buildQueue();
    }

    const statsButton = event.target.closest("[data-action='view'][data-view='stats']");
    if (statsButton) {
      setActiveNav(statsButton);
      $("quizPanel").classList.add("hidden");
      $("statsPanel").classList.remove("hidden");
      renderStats();
    }

    const sectionOption = event.target.closest("[data-section-option]");
    if (sectionOption) {
      selectSection(sectionOption.dataset.sectionOption);
      return;
    }

    if (!event.target.closest("#sectionCuteSelect")) {
      closeSectionCuteMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    const cuteDialog = $("cuteDialog");
    if (cuteDialog && !cuteDialog.classList.contains("hidden")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCuteDialog(false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        closeCuteDialog(event.target?.id !== "cuteDialogCancel");
        return;
      }
      return;
    }

    const submitOverlay = $("submitOverlay");
    if (submitOverlay && !submitOverlay.classList.contains("hidden")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSubmitDialog();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.target?.id === "cancelSubmit") {
          closeSubmitDialog();
        } else {
          $("confirmSubmit").click();
        }
        return;
      }
      return;
    }

    if (handleSectionCuteKeydown(event)) return;

    const target = event.target;
    const tag = target?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;

    const key = event.key.toUpperCase();
    if (key === "ENTER") {
      event.preventDefault();
      goNext();
      return;
    }
    if (key === "F") {
      event.preventDefault();
      toggleFlagCurrent();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
      return;
    }
    if (/^[A-Z]$/.test(key)) {
      const option = document.querySelector(`.option[data-option="${key}"]`);
      if (option) {
        event.preventDefault();
        chooseOption(key);
      }
    }
  });

  $("sectionSelect").addEventListener("change", (event) => {
    selectSection(event.target.value);
  });
  $("sectionCuteTrigger").addEventListener("click", toggleSectionCuteMenu);

  $("submitAnswer").addEventListener("click", submitSession);
  $("confirmSubmit").addEventListener("click", () => {
    closeSubmitDialog();
    finalizeSession();
  });
  $("cancelSubmit").addEventListener("click", closeSubmitDialog);
  $("submitOverlay").addEventListener("click", (event) => {
    if (event.target.id === "submitOverlay") closeSubmitDialog();
  });
  $("cuteDialogCancel").addEventListener("click", () => closeCuteDialog(false));
  $("cuteDialogConfirm").addEventListener("click", () => closeCuteDialog(true));
  $("cuteDialog").addEventListener("click", (event) => {
    if (event.target.id === "cuteDialog") closeCuteDialog(false);
  });
  $("nextQuestion").addEventListener("click", goNext);
  $("prevQuestion").addEventListener("click", goPrev);
  $("markQuestion").addEventListener("click", toggleFlagCurrent);
  $("clearAnswer").addEventListener("click", clearCurrentAnswer);
  $("jumpFirstUnanswered").addEventListener("click", jumpFirstUnanswered);
  $("longAnswer").addEventListener("input", (event) => {
    const question = currentQuestion();
    if (!question || question.type !== "long_answer" || state.sessionSubmitted) return;
    state.draftLongAnswers[question.id] = event.target.value;
    renderDashboard();
    renderAttemptPanel();
    saveActiveAttempt();
  });
  $("showReference").addEventListener("click", () => {
    const question = currentQuestion();
    if (!state.sessionSubmitted) {
      showNotice("交卷后才能查看参考答案。");
      return;
    }
    const points = questionPoints(question);
    const result = state.results[question.id] || {};
    const gradeLine = result.selfGrade === undefined
      ? `本题 ${formatScore(points)} 分，尚未自评。`
      : `本题 ${formatScore(points)} 分，自评：${longGradeLabel(result.selfGrade)}，得分 ${formatScore(result.earned)} 分。`;
    $("feedback").style.display = "block";
    $("feedback").className = "feedback compact";
    $("feedback").innerHTML = renderMarkdown(`${gradeLine}\n\n${question.explanation || "暂无参考答案"}`);
    $("selfGrade").style.display = question.type === "long_answer" ? "flex" : "none";
  });
  $("selfGrade").addEventListener("click", (event) => {
    const button = event.target.closest("[data-grade]");
    if (button) recordLongAnswer(currentQuestion(), button.dataset.grade);
  });
  $("backToQuiz").addEventListener("click", () => {
    setActiveModeNav();
    $("statsPanel").classList.add("hidden");
    $("quizPanel").classList.remove("hidden");
  });
  $("resetProgress").addEventListener("click", async () => {
    const confirmed = await showCuteDialog({
      title: "要清空做题记录吗？",
      message: "这会清掉正确率、错题和练习痕迹，但题库本身不会受影响。小 λ 会重新陪你从第一题开始。",
      confirmText: "清空记录",
      cancelText: "先不清空",
    });
    if (!confirmed) return;
    state.progress = {};
    saveProgress();
    buildQueue();
  });
  $("exportProgress").addEventListener("click", exportLearningArchive);
  $("importProgressTrigger").addEventListener("click", () => $("importProgressFile").click());
  $("importProgressFile").addEventListener("change", async (event) => {
    await importLearningArchive(event.target.files?.[0]);
    event.target.value = "";
  });
}

function init() {
  $("sectionSelect").innerHTML = sections().map((section) => `<option value="${section}">${section}</option>`).join("");
  renderSectionCuteOptions();
  bindEvents();
  if (restoreActiveAttempt()) {
    $("sectionSelect").value = sections().includes(state.section) ? state.section : ALL_SECTIONS;
    syncSectionCuteSelect();
    const modeButton = document.querySelector(`[data-action="mode"][data-mode="${state.mode}"]`);
    if (modeButton) setActiveNav(modeButton);
    renderAll();
  } else {
    syncSectionCuteSelect();
    buildQueue();
  }
}

async function boot() {
  try {
    if (typeof window.loadProtectedQuestionBank !== "function") throw new Error("loader unavailable");
    bank = await window.loadProtectedQuestionBank();
    questions = Array.isArray(bank.questions) ? bank.questions : [];
  } catch {
    bank = { questions: [] };
    questions = [];
  }

  init();
  if (!questions.length) {
    showPassiveNotice("小 λ 暂时没抱住题库，请刷新页面再试一次～");
  }
}

boot();

