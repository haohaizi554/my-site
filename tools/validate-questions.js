const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "app", "questions.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const allowedTypes = new Set(["single_choice", "multi_choice", "true_false", "long_answer"]);
const autoGradedTypes = new Set(["single_choice", "multi_choice", "true_false"]);
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

if (!Array.isArray(data.questions)) {
  fail("questions must be an array");
}

const questions = Array.isArray(data.questions) ? data.questions : [];

if (data.total !== questions.length) {
  fail(`payload total ${data.total} does not match questions length ${questions.length}`);
}

const ids = new Set();
for (const question of questions) {
  const label = question.id || "(missing id)";

  for (const key of ["id", "number", "section", "type", "title", "prompt", "sourceLine"]) {
    if (question[key] === undefined || question[key] === null || question[key] === "") {
      fail(`${label}: missing required field ${key}`);
    }
  }

  if (ids.has(question.id)) fail(`${label}: duplicated id`);
  ids.add(question.id);

  if (!allowedTypes.has(question.type)) fail(`${label}: unsupported type ${question.type}`);
  if (!Number.isInteger(question.sourceLine) || question.sourceLine <= 0) fail(`${label}: invalid sourceLine`);

  if (autoGradedTypes.has(question.type)) {
    if (!Array.isArray(question.options) || question.options.length < 2) {
      fail(`${label}: auto graded question must have at least two options`);
      continue;
    }

    const optionKeys = question.options.map((option) => option.key);
    const keySet = new Set(optionKeys);
    if (keySet.size !== optionKeys.length) fail(`${label}: duplicated option key`);
    if (!question.answer) fail(`${label}: missing answer`);

    for (const answerKey of String(question.answer).split("")) {
      if (!keySet.has(answerKey)) fail(`${label}: answer key ${answerKey} has no matching option`);
    }

    if (question.type === "single_choice" && String(question.answer).length !== 1) {
      fail(`${label}: single choice answer must contain exactly one option`);
    }

    if (question.type === "multi_choice" && String(question.answer).length <= 1) {
      fail(`${label}: multi choice answer must contain multiple options`);
    }
  }

  if (question.type === "long_answer") {
    if (!question.explanation || question.explanation.length < 20) {
      fail(`${label}: long answer must have a substantial reference answer`);
    }
  }

  if (!question.explanation && question.type !== "long_answer") {
    warn(`${label}: missing explanation`);
  }
}

const byType = questions.reduce((acc, question) => {
  acc[question.type] = (acc[question.type] || 0) + 1;
  return acc;
}, {});

const bySection = questions.reduce((acc, question) => {
  acc[question.section] = (acc[question.section] || 0) + 1;
  return acc;
}, {});

const result = {
  total: questions.length,
  byType,
  bySection,
  warnings,
  errors,
};

console.log(JSON.stringify(result, null, 2));

if (errors.length) {
  process.exitCode = 1;
}
