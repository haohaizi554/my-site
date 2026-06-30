(() => {
  "use strict";
  function boundedNoiseLoop(maxMs = 18) { const limit = Math.min(30, Math.max(0, Number(maxMs) || 0)); const start = performance.now(); let seed = 0; while (performance.now() - start < limit) seed = (seed + 17) % 997; return seed; }
  function installQuizRuntimeGuard(options = {}) {
    const onNotice = typeof options.onNotice === "function" ? options.onNotice : () => {};
    const onLockChange = typeof options.onLockChange === "function" ? options.onLockChange : () => {};
    const threshold = 3;
    let abnormalCount = 0;
    let locked = false;
    const setLocked = (value) => { if (locked === value) return; locked = value; onLockChange(locked); };
    const bump = () => { abnormalCount += 1; if (abnormalCount >= threshold) setLocked(true); };
    const blockedShortcut = (event) => { const key = String(event.key || "").toLowerCase(); return key === "f12" || (event.ctrlKey && event.shiftKey && ["i", "j", "c", "k"].includes(key)) || (event.ctrlKey && ["u", "s"].includes(key)); };
    document.addEventListener("keydown", (event) => { if (!blockedShortcut(event)) return; event.preventDefault(); event.stopPropagation(); onNotice(); bump(); boundedNoiseLoop(8); }, true);
    document.addEventListener("contextmenu", (event) => { if (event.target.closest("textarea,input,select")) return; event.preventDefault(); onNotice(); boundedNoiseLoop(6); });
    window.setInterval(() => { const widthGap = Math.abs(window.outerWidth - window.innerWidth); const heightGap = Math.abs(window.outerHeight - window.innerHeight); const sizeTriggered = (window.outerWidth > 1100 && widthGap > 280) || (window.outerHeight > 850 && heightGap > 300); if (sizeTriggered) bump(); else if (abnormalCount > 0) abnormalCount -= 1; if (abnormalCount < threshold) setLocked(false); }, 1500);
    window.setInterval(() => { const start = performance.now(); debugger; const gap = performance.now() - start; if (gap > 220) bump(); }, 4000);
  }
  Object.defineProperty(globalThis, "installQuizRuntimeGuard", { value: installQuizRuntimeGuard, configurable: false, writable: false });
})();
