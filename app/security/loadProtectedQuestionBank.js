(() => {
  "use strict";
  const genericMessage = "\u9898\u5e93\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u91cd\u8bd5\u3002";
  const slot = { buildId: 0, version: 1, createdAt: 2, layerCount: 3, alg: 4, bag: 5, order: 6, decoys: 7, layers: 8, hash: 9 };
  function fail(buffers = []) { for (const item of buffers) if (item && typeof item.fill === "function") item.fill(0); throw new Error(genericMessage); }
  function b64urlToBytes(value) { const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/"); const padded = base64 + "===".slice((base64.length + 3) % 4); const binary = atob(padded); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
  function bytesToB64url(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.slice(index, index + 0x8000)); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  function textBytes(value) { return new TextEncoder().encode(value); }
  function concatBytes(left, right) { const output = new Uint8Array(left.length + right.length); output.set(left, 0); output.set(right, left.length); return output; }
  async function sha256B64url(text) { const digest = await crypto.subtle.digest("SHA-256", textBytes(text)); return bytesToB64url(new Uint8Array(digest)); }
  function assembleStaticMaterial(parts) { const sorted = [...parts].sort((a, b) => a[0] - b[0]); const bytes = []; for (const [pieceIndex, mask, encoded] of sorted) for (let inner = 0; inner < encoded.length; inner += 1) bytes.push(encoded[inner] ^ mask ^ (((pieceIndex * 4) + inner) * 13 & 255)); return new Uint8Array(bytes); }
  function restoreFields(value, reverseMap) { if (Array.isArray(value)) return value.map((item) => restoreFields(item, reverseMap)); if (!value || typeof value !== "object") return value; const output = {}; for (const [key, item] of Object.entries(value)) output[reverseMap[key] || key] = restoreFields(item, reverseMap); return output; }
  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
  async function deriveLayerKey(material, salt, aad) { const base = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: textBytes(aad) }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]); }
  async function decryptLayer(bytes, layer, material) { const salt = b64urlToBytes(layer.s); const iv = b64urlToBytes(layer.i); const tag = b64urlToBytes(layer.t); const aad = new TextDecoder().decode(b64urlToBytes(layer.a)); const key = await deriveLayerKey(material, salt, aad); const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: textBytes(aad), tagLength: 128 }, key, concatBytes(bytes, tag)); salt.fill(0); iv.fill(0); tag.fill(0); bytes.fill(0); return new Uint8Array(decrypted); }
  async function loadProtectedQuestionBank() {
    if (!crypto || !crypto.subtle) fail();
    const vault = globalThis.__lambdaQuizVault;
    if (!vault || !Array.isArray(vault.n) || !vault.v || !Array.isArray(vault.p)) fail();
    const names = vault.n, manifest = vault.v;
    const buildId = manifest[names[slot.buildId]], version = manifest[names[slot.version]], layerCount = manifest[names[slot.layerCount]], alg = manifest[names[slot.alg]];
    const values = manifest[names[slot.bag]], realIndexes = manifest[names[slot.order]], layers = manifest[names[slot.layers]], expectedHash = manifest[names[slot.hash]];
    if (!Array.isArray(values) || !Array.isArray(realIndexes) || !Array.isArray(layers)) fail();
    const actualHash = await sha256B64url(JSON.stringify({ buildId, version, layerCount, alg, values, realIndexes, layers }));
    if (actualHash !== expectedHash) fail();
    let current = b64urlToBytes(realIndexes.map((index) => values[index]).join(""));
    const material = assembleStaticMaterial(vault.p);
    try {
      for (let index = layers.length - 1; index >= 0; index -= 1) current = await decryptLayer(current, layers[index], material);
      const payload = JSON.parse(new TextDecoder().decode(current));
      current.fill(0); material.fill(0);
      const reverseMap = Object.fromEntries(Object.entries(payload.m || {}).map(([original, obfuscated]) => [obfuscated, original]));
      return deepFreeze(restoreFields(payload.b, reverseMap));
    } catch { fail([current, material]); }
  }
  Object.defineProperty(globalThis, "loadProtectedQuestionBank", { value: loadProtectedQuestionBank, configurable: false, writable: false });
})();
