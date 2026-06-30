import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceCandidates = [
  process.env.QUESTION_BANK_SOURCE,
  "app/questions.json",
  "src/data/question-bank.json",
  "src/data/questions.json",
  "src/question-bank.json",
  "src/questions.json",
].filter(Boolean).map((item) => path.resolve(root, item));

const generatedPath = path.join(root, "app", "generated", "protected-question-bank.generated.js");
const legacyPath = path.join(root, "app", "questions.js");
const layerCount = Math.max(1, Math.min(8, Number(process.env.QUESTION_BANK_PROTECT_LAYERS || 3)));
const bankVersion = "protected-bank-v2";
const alg = "AES-256-GCM+HKDF-SHA256";
const manifestSlots = ["buildId", "version", "createdAt", "layerCount", "alg", "chunkBag", "chunkOrder", "decoyIndexes", "layers", "integrityHash"];
const sensitiveKeys = new Set([
  "generatedAt", "source", "version", "total", "questions", "id", "number", "section", "type", "title",
  "prompt", "question", "options", "key", "text", "answer", "correct", "correctAnswer", "right", "solution",
  "explanation", "analysis", "category", "difficulty", "tags", "sourceLine",
]);

function findSourceFile() {
  const direct = sourceCandidates.find((candidate) => fs.existsSync(candidate));
  if (direct) return direct;
  const fallbackRoots = [path.join(root, "src"), path.join(root, "app")].filter((dir) => fs.existsSync(dir));
  const found = [];
  for (const dir of fallbackRoots) walk(dir, found);
  const candidate = found.find((file) => /question.*\.json$/i.test(path.basename(file)))
    || found.find((file) => /QUESTION_BANK/.test(fs.readFileSync(file, "utf8")));
  if (candidate) return candidate;
  throw new Error("Question bank source file was not found. Set QUESTION_BANK_SOURCE to the JSON source path.");
}

function walk(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    if (entry.isFile() && /\.(json|js|ts)$/i.test(entry.name)) found.push(full);
  }
}

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(used) {
  let token;
  do {
    const body = crypto.randomBytes(3).toString("hex").slice(0, crypto.randomInt(3, 6));
    token = "_" + String.fromCharCode(97 + crypto.randomInt(0, 26)) + body;
  } while (used.has(token));
  used.add(token);
  return token;
}

function buildFieldMap(value, map = {}, used = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => buildFieldMap(item, map, used));
    return map;
  }
  if (!value || typeof value !== "object") return map;
  for (const key of Object.keys(value)) {
    if (!map[key] && sensitiveKeys.has(key)) map[key] = randomToken(used);
    buildFieldMap(value[key], map, used);
  }
  return map;
}

function obfuscateFields(value, map) {
  if (Array.isArray(value)) return value.map((item) => obfuscateFields(item, map));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) output[map[key] || key] = obfuscateFields(item, map);
  return output;
}

function encryptLayer(input, keyMaterial, layerIndex, buildId) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const aad = bankVersion + ":" + layerIndex + ":" + buildId;
  const key = Buffer.from(crypto.hkdfSync("sha256", keyMaterial, salt, Buffer.from(aad), 32));
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return { bytes: encrypted, meta: { s: b64url(salt), i: b64url(iv), t: b64url(tag), a: b64url(Buffer.from(aad)) } };
}

function splitCiphertext(bytes) {
  const encoded = b64url(bytes);
  const realChunks = [];
  for (let index = 0; index < encoded.length;) {
    const size = Math.min(encoded.length - index, 72 + crypto.randomInt(0, 81));
    realChunks.push(encoded.slice(index, index + size));
    index += size;
  }
  const decoyCount = Math.max(1, Math.ceil(realChunks.length * (0.05 + Math.random() * 0.1)));
  const bag = realChunks.map((value, order) => ({ value, order, real: true }));
  for (let index = 0; index < decoyCount; index += 1) bag.push({ value: b64url(crypto.randomBytes(54 + crypto.randomInt(0, 70))), order: -1, real: false });
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  const values = bag.map((item) => item.value);
  const realIndexes = bag.filter((item) => item.real).sort((a, b) => a.order - b.order).map((item) => bag.indexOf(item));
  const decoyIndexes = bag.map((item, index) => item.real ? -1 : index).filter((index) => index >= 0);
  return { values, realIndexes, decoyIndexes };
}

function buildKeyPieces(keyMaterial) {
  const pieces = [];
  for (let offset = 0; offset < keyMaterial.length; offset += 4) {
    const raw = Array.from(keyMaterial.slice(offset, offset + 4));
    const mask = crypto.randomInt(1, 255);
    pieces.push([offset / 4, mask, raw.map((byte, index) => byte ^ mask ^ (((offset + index) * 13) & 255))]);
  }
  for (let index = pieces.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [pieces[index], pieces[swap]] = [pieces[swap], pieces[index]];
  }
  return pieces;
}

function integrityPayload({ buildId, version, layerCount, alg, values, realIndexes, layers }) {
  return JSON.stringify({ buildId, version, layerCount, alg, values, realIndexes, layers });
}

function makeGeneratedModule(bundle, shape) {
  return [
    "(() => {",
    "  \"use strict\";",
    "  // Static frontend key fragments only raise reverse-engineering cost; they are not equivalent to server-side security.",
    "  const _shape = " + JSON.stringify(shape) + ";",
    "  const _vault = " + JSON.stringify(bundle) + ";",
    "  Object.defineProperty(globalThis, \"__lambdaQuizVault\", {",
    "    value: Object.freeze({ n: Object.freeze(_shape), v: Object.freeze(_vault.v), p: Object.freeze(_vault.p), mode: _vault.mode }),",
    "    configurable: false,",
    "    writable: false,",
    "  });",
    "})();",
    "",
  ].join("\n");
}

const sourceFile = findSourceFile();
const source = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const fieldMap = buildFieldMap(source);
const obfuscated = obfuscateFields(source, fieldMap);
const protectedPayload = Buffer.from(JSON.stringify({ m: fieldMap, b: obfuscated }), "utf8");
const keyMaterial = crypto.randomBytes(32);
const buildId = crypto.randomBytes(12).toString("hex");
let layerBytes = protectedPayload;
const layers = [];
for (let index = 0; index < layerCount; index += 1) {
  const encrypted = encryptLayer(layerBytes, keyMaterial, index, buildId);
  layerBytes = encrypted.bytes;
  layers.push(encrypted.meta);
}
const { values, realIndexes, decoyIndexes } = splitCiphertext(layerBytes);
const usedManifestNames = new Set();
const shape = manifestSlots.map(() => randomToken(usedManifestNames));
const manifest = {
  [shape[0]]: buildId,
  [shape[1]]: bankVersion,
  [shape[2]]: new Date().toISOString(),
  [shape[3]]: layerCount,
  [shape[4]]: alg,
  [shape[5]]: values,
  [shape[6]]: realIndexes,
  [shape[7]]: decoyIndexes,
  [shape[8]]: layers,
};
manifest[shape[9]] = b64url(crypto.createHash("sha256").update(integrityPayload({ buildId, version: bankVersion, layerCount, alg, values, realIndexes, layers })).digest());
fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
fs.writeFileSync(generatedPath, makeGeneratedModule({ v: manifest, p: buildKeyPieces(keyMaterial), mode: "static-compatible" }, shape), "utf8");
fs.writeFileSync(legacyPath, "/* Legacy placeholder: the protected bank is generated at app/generated/protected-question-bank.generated.js. */\n", "utf8");
keyMaterial.fill(0);
console.log(JSON.stringify({ source: path.relative(root, sourceFile), output: path.relative(root, generatedPath), layerCount, mode: "static-compatible" }, null, 2));
