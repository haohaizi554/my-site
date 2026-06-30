import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const generatedSource = readFileSync('app/generated/protected-question-bank.generated.js', 'utf8');
const loaderSource = readFileSync('app/security/loadProtectedQuestionBank.js', 'utf8');
const guardSource = readFileSync('app/security/runtimeGuard.js', 'utf8');

function makeContext(protectedSource = generatedSource) {
  const context = {
    console: {
      log() {},
      warn() {},
      error() {},
      info() {},
    },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    Object,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    atob(value) {
      return Buffer.from(String(value), 'base64').toString('binary');
    },
    btoa(value) {
      return Buffer.from(String(value), 'binary').toString('base64');
    },
  };

  context.globalThis = context;
  context.window = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(protectedSource, context, { filename: 'protected-question-bank.generated.js' });
  vm.runInContext(loaderSource, context, { filename: 'loadProtectedQuestionBank.js' });
  return context;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function mutateString(value) {
  if (!value) {
    return 'x';
  }
  const index = Math.floor(value.length / 2);
  const replacement = value[index] === 'A' ? 'B' : 'A';
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

function tamperFirstProtectedString(source) {
  const pattern = /"([A-Za-z0-9_-]{24,})"/;
  const match = source.match(pattern);
  assert(match, 'did not find a protected string literal to tamper');
  return source.replace(pattern, `"${mutateString(match[1])}"`);
}

function tamperKeyFragment(source) {
  const patterns = [
    /("p"\s*:\s*\[\s*\[\s*)(\d{1,3})/,
    /(\bp\s*:\s*\[\s*\[\s*)(\d{1,3})/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const next = (Number(match[2]) + 1) & 255;
      return source.replace(pattern, `${match[1]}${next}`);
    }
  }

  throw new Error('did not find a key fragment byte to tamper');
}

async function expectTamperRejected(label, buildSource) {
  const tamperedSource = buildSource(generatedSource);
  assert(tamperedSource !== generatedSource, `${label}: source did not change`);

  const context = makeContext(tamperedSource);
  let rejected = false;
  try {
    await context.loadProtectedQuestionBank();
  } catch {
    rejected = true;
  }

  assert(rejected, `${label}: tampered protected bank should be rejected`);
}

const context = makeContext();
const bank = await context.loadProtectedQuestionBank();
assert(bank && Array.isArray(bank.questions), 'protected bank should expose a questions array');
assert(bank.questions.length === 172, `expected 172 questions, got ${bank.questions.length}`);
assert(Object.isFrozen(bank), 'loaded bank should be frozen');
assert(Object.isFrozen(bank.questions), 'loaded questions array should be frozen');
assert(!context.QUESTION_BANK, 'protected loader should not expose QUESTION_BANK globally');

await expectTamperRejected('ciphertext/manifest tamper', tamperFirstProtectedString);
await expectTamperRejected('key-fragment tamper', tamperKeyFragment);

assert(!/while\s*\(\s*true\s*\)/.test(guardSource), 'runtime guard must not use infinite loops');
assert(!/\b(alert|confirm|prompt)\s*\(/.test(guardSource), 'runtime guard must not use native dialogs');

for (const match of guardSource.matchAll(/setInterval\s*\([^,]+,\s*(\d+)/g)) {
  const interval = Number(match[1]);
  assert(interval >= 1000, `runtime guard interval is too aggressive: ${interval}ms`);
}

console.log('protected question bank passed load, tamper, and guard checks');
