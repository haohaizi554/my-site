import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const explicitTargets = [
  "app/generated/protected-question-bank.generated.js",
  "app/security/loadProtectedQuestionBank.js",
  "app/security/runtimeGuard.js",
  "app/questions.js",
  "index.html",
];

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    if (entry.isFile()) output.push(full);
  }
  return output;
}

const targets = new Set(explicitTargets.map((item) => path.join(root, item)));
for (const file of walkFiles(path.join(root, "dist"))) targets.add(file);

const forbidden = [
  { label: "window.QUESTION_BANK literal", pattern: /window\.QUESTION_BANK\s*=\s*\{/ },
  { label: "legacy reverse chunk join", pattern: /_chunks\.reverse\(\)\.join\(/ },
  { label: "legacy fixed key xor", pattern: /charCodeAt\(0\)\s*\^\s*_key/ },
  { label: "legacy _key declaration", pattern: /\b(?:const|let|var)\s+_key\b/ },
  { label: "legacy direct JSON.parse(_json)", pattern: /JSON\.parse\s*\(\s*_json\s*\)/ },
  { label: "plain answer field", pattern: /"answer"\s*:/ },
  { label: "plain explanation field", pattern: /"explanation"\s*:/ },
  { label: "plain correctAnswer field", pattern: /"correctAnswer"\s*:/ },
  { label: "plain solution field", pattern: /"solution"\s*:/ },
];

const distForbiddenFiles = new Set([
  "app/questions.json",
  "app/questions.js",
]);

const errors = [];
for (const file of targets) {
  if (!fs.existsSync(file)) {
    errors.push(`missing ${path.relative(root, file)}`);
    continue;
  }

  const relative = path.relative(root, file).replace(/\\/g, "/");
  if (relative.startsWith("dist/")) {
    const insideDist = relative.slice("dist/".length);
    if (distForbiddenFiles.has(insideDist)) errors.push(`dist contains plaintext source file ${insideDist}`);
    if (relative.endsWith(".map")) errors.push(`dist contains sourcemap ${insideDist}`);
  }

  const content = fs.readFileSync(file, "utf8");
  if (relative.startsWith("dist/") && /sourceMappingURL=/i.test(content)) {
    errors.push(`${relative} contains sourceMappingURL`);
  }

  for (const item of forbidden) {
    if (item.pattern.test(content)) errors.push(`${relative} contains ${item.label}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No protected-bundle plaintext markers found.");
}
