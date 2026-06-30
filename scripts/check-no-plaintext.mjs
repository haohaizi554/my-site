import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const targets = [
  "app/generated/protected-question-bank.generated.js",
  "app/security/loadProtectedQuestionBank.js",
  "app/security/runtimeGuard.js",
  "app/questions.js",
  "index.html",
].map((item) => path.join(root, item));
const forbidden = [
  /window\.QUESTION_BANK\s*=\s*\{/,
  /_chunks\.reverse\(\)\.join\(/,
  /charCodeAt\(0\)\s*\^\s*_key/,
  /"answer"\s*:/,
  /"explanation"\s*:/,
  /"correctAnswer"\s*:/,
  /"solution"\s*:/,
];
const errors = [];
for (const file of targets) {
  if (!fs.existsSync(file)) {
    errors.push(`missing ${path.relative(root, file)}`);
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) errors.push(`${path.relative(root, file)} contains ${pattern}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No protected-bundle plaintext markers found.");
}
