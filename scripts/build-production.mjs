import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "app/style.css",
  "app/app.js",
  "app/generated/protected-question-bank.generated.js",
  "app/security/loadProtectedQuestionBank.js",
  "app/security/runtimeGuard.js",
  "app/security/questionBank.worker.js",
];

const forbiddenDistEntries = new Set([
  "app/questions.json",
  "app/questions.js",
]);

function copyFile(relativePath) {
  if (forbiddenDistEntries.has(relativePath)) {
    throw new Error(`Refusing to publish plaintext source: ${relativePath}`);
  }

  const from = path.join(root, relativePath);
  const to = path.join(dist, relativePath);
  if (!fs.existsSync(from)) {
    throw new Error(`Missing production asset: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    if (entry.isFile()) output.push(full);
  }
  return output;
}

fs.rmSync(dist, { recursive: true, force: true });
for (const file of files) copyFile(file);

const publishedFiles = walkFiles(dist).map((file) => path.relative(dist, file).replace(/\\/g, "/"));
const sourceMaps = publishedFiles.filter((file) => {
  const content = fs.readFileSync(path.join(dist, file), "utf8");
  return file.endsWith(".map") || /sourceMappingURL=/i.test(content);
});
const leakedSources = publishedFiles.filter((file) => forbiddenDistEntries.has(file));

if (sourceMaps.length) {
  throw new Error(`Production dist must not include sourcemaps: ${sourceMaps.join(", ")}`);
}

if (leakedSources.length) {
  throw new Error(`Production dist includes plaintext bank source: ${leakedSources.join(", ")}`);
}

console.log(JSON.stringify({
  output: "dist",
  files: publishedFiles.length,
  sourcemaps: 0,
  plaintextSources: 0,
  encryptedQuestionBank: true,
  encryptedHtmlShell: false,
}, null, 2));
