import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const shellLayerCount = Math.max(1, Math.min(8, Number(process.env.FRONTEND_SHELL_PROTECT_LAYERS || process.env.QUESTION_BANK_PROTECT_LAYERS || 3)));
const shellVersion = "protected-shell-v1";
const alg = "AES-256-GCM+HKDF-SHA256";
const manifestSlots = ["buildId", "version", "createdAt", "layerCount", "alg", "chunkBag", "chunkOrder", "decoyIndexes", "layers", "integrityHash"];

const files = [
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

function encryptLayer(input, keyMaterial, layerIndex, buildId) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const aad = `${shellVersion}:${layerIndex}:${buildId}`;
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
    const size = Math.min(encoded.length - index, 80 + crypto.randomInt(0, 96));
    realChunks.push(encoded.slice(index, index + size));
    index += size;
  }

  const decoyCount = Math.max(1, Math.ceil(realChunks.length * (0.05 + Math.random() * 0.1)));
  const bag = realChunks.map((value, order) => ({ value, order, real: true }));
  for (let index = 0; index < decoyCount; index += 1) {
    bag.push({ value: b64url(crypto.randomBytes(60 + crypto.randomInt(0, 80))), order: -1, real: false });
  }

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

function protectHtmlShell(html) {
  const keyMaterial = crypto.randomBytes(32);
  const buildId = crypto.randomBytes(12).toString("hex");
  let layerBytes = Buffer.from(html, "utf8");
  const layers = [];

  for (let index = 0; index < shellLayerCount; index += 1) {
    const encrypted = encryptLayer(layerBytes, keyMaterial, index, buildId);
    layerBytes = encrypted.bytes;
    layers.push(encrypted.meta);
  }

  const { values, realIndexes, decoyIndexes } = splitCiphertext(layerBytes);
  const usedManifestNames = new Set();
  const shape = manifestSlots.map(() => randomToken(usedManifestNames));
  const manifest = {
    [shape[0]]: buildId,
    [shape[1]]: shellVersion,
    [shape[2]]: new Date().toISOString(),
    [shape[3]]: shellLayerCount,
    [shape[4]]: alg,
    [shape[5]]: values,
    [shape[6]]: realIndexes,
    [shape[7]]: decoyIndexes,
    [shape[8]]: layers,
  };
  manifest[shape[9]] = b64url(crypto.createHash("sha256").update(integrityPayload({ buildId, version: shellVersion, layerCount: shellLayerCount, alg, values, realIndexes, layers })).digest());

  const bundle = { v: manifest, p: buildKeyPieces(keyMaterial), mode: "static-compatible" };
  keyMaterial.fill(0);
  layerBytes.fill(0);
  return { bundle, shape };
}

function encryptedIndexHtml({ bundle, shape }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow,noarchive,noimageindex" />
  <title>小 λ 正在整理题库</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 20% 20%, rgba(255, 176, 208, .55), transparent 28%),
        radial-gradient(circle at 80% 18%, rgba(158, 229, 219, .6), transparent 30%),
        linear-gradient(135deg, #fff4dc, #fff7f1 46%, #e9fbf8);
      color: #2b2435;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    }
    .boot-card {
      width: min(88vw, 420px);
      padding: 34px 30px;
      border: 1px solid rgba(255, 151, 190, .42);
      border-radius: 34px;
      background: rgba(255, 255, 255, .72);
      text-align: center;
    }
    .boot-mark {
      width: 72px;
      height: 72px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border-radius: 24px;
      background: linear-gradient(135deg, #f38fbd, #55b8ad);
      color: white;
      font-size: 42px;
      font-weight: 900;
    }
    h1 { margin: 0 0 10px; font-size: 26px; }
    p { margin: 0; color: #7a6d80; line-height: 1.7; }
  </style>
</head>
<body>
  <main class="boot-card">
    <div class="boot-mark">λ</div>
    <h1>小 λ 正在整理题库</h1>
    <p>页面糖纸正在拆开，请稍等一下下～</p>
  </main>
  <script>
(() => {
  "use strict";
  const slot = { buildId: 0, version: 1, createdAt: 2, layerCount: 3, alg: 4, bag: 5, order: 6, decoys: 7, layers: 8, hash: 9 };
  const names = ${JSON.stringify(shape)};
  const vault = ${JSON.stringify(bundle)};
  const genericMessage = "页面加载失败，请刷新重试。";

  function fail(buffers = []) {
    for (const item of buffers) if (item && typeof item.fill === "function") item.fill(0);
    document.body.innerHTML = '<main class="boot-card"><div class="boot-mark">λ</div><h1>小 λ 卡住啦</h1><p>页面没有解开，请刷新重试。</p></main>';
    throw new Error(genericMessage);
  }

  function b64urlToBytes(value) {
    const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function bytesToB64url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function textBytes(value) { return new TextEncoder().encode(value); }
  function concatBytes(left, right) {
    const output = new Uint8Array(left.length + right.length);
    output.set(left, 0);
    output.set(right, left.length);
    return output;
  }

  async function sha256B64url(text) {
    const digest = await crypto.subtle.digest("SHA-256", textBytes(text));
    return bytesToB64url(new Uint8Array(digest));
  }

  function assembleStaticMaterial(parts) {
    const sorted = [...parts].sort((a, b) => a[0] - b[0]);
    const bytes = [];
    for (const [pieceIndex, mask, encoded] of sorted) {
      for (let inner = 0; inner < encoded.length; inner += 1) {
        bytes.push(encoded[inner] ^ mask ^ (((pieceIndex * 4) + inner) * 13 & 255));
      }
    }
    return new Uint8Array(bytes);
  }

  async function deriveLayerKey(material, salt, aad) {
    const base = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: textBytes(aad) }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  async function decryptLayer(bytes, layer, material) {
    const salt = b64urlToBytes(layer.s);
    const iv = b64urlToBytes(layer.i);
    const tag = b64urlToBytes(layer.t);
    const aad = new TextDecoder().decode(b64urlToBytes(layer.a));
    const key = await deriveLayerKey(material, salt, aad);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: textBytes(aad), tagLength: 128 }, key, concatBytes(bytes, tag));
    salt.fill(0); iv.fill(0); tag.fill(0); bytes.fill(0);
    return new Uint8Array(decrypted);
  }

  function loadScriptElement(sourceScript) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      for (const attribute of sourceScript.attributes) {
        script.setAttribute(attribute.name, attribute.value);
      }

      if (sourceScript.src) {
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(genericMessage));
        script.src = sourceScript.getAttribute("src");
        document.body.appendChild(script);
        return;
      }

      script.textContent = sourceScript.textContent || "";
      document.body.appendChild(script);
      resolve();
    });
  }

  async function mountHtml(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const scripts = Array.from(parsed.querySelectorAll("script"));
    scripts.forEach((script) => script.remove());

    document.documentElement.lang = parsed.documentElement.lang || "zh-CN";
    document.head.replaceChildren(...Array.from(parsed.head.childNodes));
    document.body.replaceChildren(...Array.from(parsed.body.childNodes));

    for (const script of scripts) {
      await loadScriptElement(script);
    }
  }

  async function boot() {
    if (!crypto || !crypto.subtle) fail();
    const manifest = vault.v;
    const buildId = manifest[names[slot.buildId]];
    const version = manifest[names[slot.version]];
    const layerCount = manifest[names[slot.layerCount]];
    const alg = manifest[names[slot.alg]];
    const values = manifest[names[slot.bag]];
    const realIndexes = manifest[names[slot.order]];
    const layers = manifest[names[slot.layers]];
    const expectedHash = manifest[names[slot.hash]];
    if (!Array.isArray(values) || !Array.isArray(realIndexes) || !Array.isArray(layers)) fail();
    const actualHash = await sha256B64url(JSON.stringify({ buildId, version, layerCount, alg, values, realIndexes, layers }));
    if (actualHash !== expectedHash) fail();

    let current = b64urlToBytes(realIndexes.map((index) => values[index]).join(""));
    const material = assembleStaticMaterial(vault.p);
    try {
      for (let index = layers.length - 1; index >= 0; index -= 1) current = await decryptLayer(current, layers[index], material);
      const html = new TextDecoder().decode(current);
      current.fill(0); material.fill(0);
      await mountHtml(html);
    } catch {
      fail([current, material]);
    }
  }

  boot().catch(() => fail());
})();
  </script>
</body>
</html>
`;
}

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
fs.mkdirSync(dist, { recursive: true });
const sourceHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const protectedShell = protectHtmlShell(sourceHtml);
fs.writeFileSync(path.join(dist, "index.html"), encryptedIndexHtml(protectedShell), "utf8");
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

console.log(JSON.stringify({ output: "dist", files: publishedFiles.length, sourcemaps: 0, plaintextSources: 0, encryptedHtml: true, shellLayers: shellLayerCount }, null, 2));

