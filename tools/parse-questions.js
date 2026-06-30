const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "编译原理.md");
const appDir = path.join(root, "app");
const jsonPath = path.join(appDir, "questions.json");
const jsPath = path.join(appDir, "questions.js");
const reportPath = path.join(root, "docx", "自测脚本-题库解析报告.md");

const SECTION_NAMES = ["编译基础", "词法分析", "语法分析"];
const SECTION_PREFIX = ["basic", "lexer", "parser"];

const raw = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const lines = raw.split("\n");

const tableStart = lines.findIndex((line) => /^\|\s*题号\s*\|\s*题目\s*\|\s*答案\s*\|\s*解析\s*\|/.test(line));
let tableEnd = tableStart;
if (tableStart >= 0) {
  while (tableEnd < lines.length && /^\|/.test(lines[tableEnd])) tableEnd += 1;
}

const questions = [];
const warnings = [];

function compact(text) {
  return text
    .replace(/^\s*[-–—]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripAnswer(text) {
  return text.replace(/\s+/g, "").replace(/[，,、]/g, "");
}

function difficultyFor(type, section) {
  if (type === "long_answer") return 3;
  if (section === "语法分析") return 2;
  return 1;
}

function tagsFor(section, title) {
  const text = `${section} ${title}`;
  const tags = new Set([section]);
  const pairs = [
    ["编译", "编译器"],
    ["解释", "解释器"],
    ["前端", "前后端"],
    ["后端", "前后端"],
    ["文法", "文法"],
    ["Chomsky", "文法分类"],
    ["正规", "正规式"],
    ["DFA", "自动机"],
    ["NFA", "自动机"],
    ["ε", "ε-闭包"],
    ["FIRST", "FIRST"],
    ["FOLLOW", "FOLLOW"],
    ["LL", "LL(1)"],
    ["LR", "LR"],
    ["SLR", "SLR(1)"],
    ["句柄", "句柄"],
    ["左递归", "左递归"],
    ["左因子", "左因子"],
    ["语法树", "语法树"],
  ];
  for (const [needle, tag] of pairs) {
    if (text.includes(needle)) tags.add(tag);
  }
  return Array.from(tags);
}

function blockEndFrom(start) {
  let end = start + 1;
  while (end < lines.length) {
    if (/^##\s+(一、单选题|\d+\.)/.test(lines[end])) break;
    if (tableStart >= 0 && end === tableStart) break;
    end += 1;
  }
  return end;
}

function parseChoiceBlock(start, groupIndex) {
  const block = lines.slice(start, blockEndFrom(start));
  const heading = block[0];
  const number = Number((heading.match(/^##\s+(\d+)\./) || [])[1]);
  const title = heading.replace(/^##\s+\d+\.\s*/, "").trim();
  const section = SECTION_NAMES[groupIndex - 1];
  const prefix = SECTION_PREFIX[groupIndex - 1];

  const questionMarker = block.findIndex((line) => /^\*\*题目：\*\*/.test(line));
  const optionsMarker = block.findIndex((line) => /^\*\*选项：\*\*/.test(line));
  const answerIndex = block.findIndex((line) => /^\*\*答案：\*\*/.test(line));
  const explanationMarker = block.findIndex((line) => /^\*\*解析：\*\*/.test(line));

  if (answerIndex < 0) warnings.push(`选择题缺少答案：${section} 第 ${number} 题`);

  const questionText = questionMarker >= 0 && optionsMarker > questionMarker
    ? compact(block.slice(questionMarker + 1, optionsMarker).join("\n"))
    : title;

  const options = [];
  const optionLines = optionsMarker >= 0 && answerIndex > optionsMarker
    ? block.slice(optionsMarker + 1, answerIndex)
    : [];

  for (const line of optionLines) {
    const match = line.match(/^-\s*([A-Z])\.\s*(.*)$/);
    if (match) {
      options.push({ key: match[1], text: match[2].trim() });
    } else if (options.length && line.trim()) {
      options[options.length - 1].text += `\n${line.trim()}`;
    }
  }

  const answer = answerIndex >= 0
    ? stripAnswer(block[answerIndex].replace(/^\*\*答案：\*\*\s*/, ""))
    : "";

  const explanation = explanationMarker >= 0
    ? compact(block.slice(explanationMarker + 1).join("\n"))
    : "";

  const type = answer.length > 1 ? "multi_choice" : "single_choice";
  if (!options.length) warnings.push(`选择题缺少选项：${section} 第 ${number} 题`);

  return {
    id: `${prefix}-${String(number).padStart(3, "0")}`,
    number,
    section,
    type,
    title,
    prompt: questionText,
    options,
    answer,
    explanation,
    tags: tagsFor(section, title),
    difficulty: difficultyFor(type, section),
    sourceLine: start + 1,
  };
}

function parseJudgementRows() {
  if (tableStart < 0) return;
  for (let i = tableStart + 2; i < tableEnd; i += 1) {
    const line = lines[i];
    const match = line.match(/^\|\s*(\d+)\s*\|\s*(.+)\|\s*([AB])\s*\|\s*(.+)\s*\|$/);
    if (!match) {
      warnings.push(`判断题表格行无法解析：第 ${i + 1} 行`);
      continue;
    }

    const number = Number(match[1]);
    const title = match[2].trim();
    const answer = match[3].trim();
    const explanation = match[4].trim();
    const topicSection = number <= 20 ? "编译基础" : number <= 39 ? "词法分析" : "语法分析";

    questions.push({
      id: `judge-${String(number).padStart(3, "0")}`,
      number,
      section: "判断题",
      topicSection,
      type: "true_false",
      title,
      prompt: title,
      options: [
        { key: "A", text: "正确" },
        { key: "B", text: "错误" },
      ],
      answer,
      explanation,
      tags: tagsFor(topicSection, title),
      difficulty: difficultyFor("true_false", topicSection),
      sourceLine: i + 1,
    });
  }
}

function parseLongAnswers() {
  if (tableEnd <= tableStart) return;
  let i = tableEnd;
  while (i < lines.length) {
    const heading = lines[i].match(/^##\s+(\d+)\.\s*(.+)$/);
    if (!heading) {
      i += 1;
      continue;
    }

    const number = Number(heading[1]);
    const title = heading[2].trim();
    let end = i + 1;
    while (end < lines.length && !/^##\s+\d+\.\s*/.test(lines[end])) end += 1;
    const answerText = compact(lines.slice(i + 1, end).join("\n"));

    questions.push({
      id: `long-${String(number).padStart(3, "0")}`,
      number,
      section: "综合题",
      type: "long_answer",
      title,
      prompt: title,
      options: [],
      answer: "",
      explanation: answerText,
      tags: tagsFor("综合题", title),
      difficulty: 3,
      sourceLine: i + 1,
    });
    i = end;
  }
}

let choiceGroup = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (/^##\s+一、单选题/.test(lines[i])) {
    choiceGroup += 1;
    continue;
  }
  if (choiceGroup >= 1 && choiceGroup <= 3 && (tableStart < 0 || i < tableStart) && /^##\s+\d+\.\s+/.test(lines[i])) {
    const question = parseChoiceBlock(i, choiceGroup);
    questions.push(question);
    i = blockEndFrom(i) - 1;
  }
}

parseJudgementRows();
parseLongAnswers();

const byType = {};
const bySection = {};
for (const question of questions) {
  byType[question.type] = (byType[question.type] || 0) + 1;
  bySection[question.section] = (bySection[question.section] || 0) + 1;
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: "编译原理.md",
  version: 1,
  total: questions.length,
  questions,
};

function buildBrowserQuestionBundle(payload) {
  const keyBytes = Buffer.from('lambda-quiz-guard-v2', 'utf8');
  const input = Buffer.from(JSON.stringify(payload), 'utf8');
  const encoded = Buffer.from(input.map((byte, index) => (
    byte ^ keyBytes[index % keyBytes.length] ^ ((index * 31 + 17) & 255)
  ))).toString('base64');
  const chunks = [];
  for (let index = 0; index < encoded.length; index += 96) {
    chunks.push(encoded.slice(index, index + 96));
  }

  return [
    '(() => {',
    '  "use strict";',
    `  const _chunks = ${JSON.stringify(chunks.reverse())};`,
    `  const _key = ${JSON.stringify(Array.from(keyBytes))};`,
    '  const _encoded = _chunks.reverse().join("");',
    '  const _binary = atob(_encoded);',
    '  const _bytes = Uint8Array.from(_binary, (char, index) => char.charCodeAt(0) ^ _key[index % _key.length] ^ ((index * 31 + 17) & 255));',
    '  const _json = new TextDecoder().decode(_bytes);',
    '  const _freeze = (value) => {',
    '    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;',
    '    Object.freeze(value);',
    '    Object.values(value).forEach(_freeze);',
    '    return value;',
    '  };',
    '  Object.defineProperty(window, "QUESTION_BANK", {',
    '    value: _freeze(JSON.parse(_json)),',
    '    configurable: false,',
    '    writable: false,',
    '  });',
    '})();',
    '',
  ].join('\n');
}

fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
fs.writeFileSync(jsPath, buildBrowserQuestionBundle(payload), "utf8");

const report = `# 自测脚本题库解析报告

生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}

## 解析结果

- 源文件：\`编译原理.md\`
- 输出 JSON：\`app/questions.json\`
- 输出浏览器数据：\`app/questions.js\`
- 题目总数：${questions.length}

## 按题型统计

${Object.entries(byType).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## 按章节统计

${Object.entries(bySection).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## 解析告警

${warnings.length ? warnings.map((item) => `- ${item}`).join("\n") : "- 暂无告警"}

## 工程说明

- 单选题和多选题会自动判分。
- 判断题使用 A/B，A 表示正确，B 表示错误。
- 综合题采用参考答案展示和自评方式，不做机器强判。
- 每题保留 \`sourceLine\`，便于回到原始题库核对。
`;

fs.writeFileSync(reportPath, report, "utf8");

console.log(JSON.stringify({ total: questions.length, byType, bySection, warnings }, null, 2));
