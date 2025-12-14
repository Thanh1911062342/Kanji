import React, { useEffect, useMemo, useRef, useState } from "react";

function normalizeInfo(info = {}) {
  // Site keys are Vietnamese; keep flexible.
  const get = (...keys) => {
    for (const k of keys) {
      if (k in info) return info[k];
    }
    return "";
  };

  const hanTu = get("Hán tự");
  const hanViet = get("Hán-Việt", "Hán Việt", "Âm Hán", "Âm hán");
  const nghia = get("Nghĩa", "Ý nghĩa", "Nghĩa:", "Nghia");
  const kun = get("Kunyomi", "Kun", "Âm Kun", "Âm kunyomi");
  const on = get("Onyomi", "On", "Âm On", "Âm onyomi");
  const bo = get("Bộ");

  const hanTuVal = typeof hanTu === "object" ? (hanTu.kanji || hanTu.text || "") : hanTu;

  const boVal = typeof bo === "object" ? (bo.text || "") : bo;

  return {
    hanTu: hanTuVal,
    hanViet,
    nghia,
    kun,
    on,
    bo: boVal,
  };
}

function useEscToClose(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);
}

function BrushIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 2c-1.5 0-3 1-4.2 2.2l-7.9 7.9c-.6.6-.9 1.4-.9 2.2v1.7c0 .6-.5 1-1 1H4c-1.1 0-2 .9-2 2 0 1.6 1.3 3 3 3 3.3 0 6-2.7 6-6v-.2c0-.3.1-.5.3-.7l7.8-7.8C20.7 6.2 22 4.4 22 3c0-.6-.4-1-1-1h-1z" fill="currentColor"/>
      <path d="M7 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function TrashIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2z" fill="currentColor" opacity="0.9"/>
      <path d="M6 9h12l-1 12H7L6 9z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 11v8M14 11v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PlayIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.2 7.1c0-.9 1-1.4 1.7-.9l8 4.9c.7.4.7 1.4 0 1.8l-8 4.9c-.7.4-1.7 0-1.7-.9V7.1z"
        fill="currentColor"
      />
    </svg>
  );
}

function Modal({ open, onClose, children }) {
  useEscToClose(open, onClose);

  if (!open) return null;

  return (
    <div className="modalOverlay" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="modalSheet" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Canvas drawing overlay.
// Note: the canvas only exists when the modal is open, so we must (re)setup
// whenever the modal mounts.
function useCanvasDraw(enabled, mountedKey) {
  const canvasRef = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const setupRef = useRef(false);

  // Setup size + drawing style when the canvas is mounted (modal open).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const applyStyle = () => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      // White ink (visible on dark UI)
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyStyle();
    };

    // Run immediately once it exists.
    resize();
    applyStyle();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);

    setupRef.current = true;

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      setupRef.current = false;
    };
  }, [mountedKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let drawing = false;
    let last = null;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
      return { x, y };
    };

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If the canvas mounted after the first render, ensure style exists.
    // (Without this, some browsers will draw black-on-black => looks like "no drawing".)
    if (!setupRef.current) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
    }

    const start = (e) => {
      if (!enabled) return;
      drawing = true;
      last = getPos(e);
      e.preventDefault();
    };

    const move = (e) => {
      if (!enabled || !drawing) return;
      const pos = getPos(e);
      if (!last) last = pos;

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      last = pos;
      setHasInk(true);
      e.preventDefault();
    };

    const end = (e) => {
      if (!enabled) return;
      drawing = false;
      last = null;
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // For Safari iOS fallback
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);

      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [enabled, mountedKey]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  };

  return { canvasRef, clear, hasInk };
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function sanitizeKanjivgSvg(raw) {
  // KanjiVG SVGs ship with XML declaration + DOCTYPE (often with an internal subset).
  // When injected into HTML via dangerouslySetInnerHTML, the DOCTYPE can leak as visible
  // text (e.g. showing "]>" on screen). We strip it.
  if (!raw) return "";
  let s = String(raw);

  // Remove XML prolog.
  s = s.replace(/<\?xml[\s\S]*?\?>\s*/i, "");

  // Remove DOCTYPE with internal subset: ... [ ... ]>
  s = s.replace(/<!DOCTYPE[\s\S]*?\]>\s*/i, "");
  // Fallback: plain DOCTYPE
  s = s.replace(/<!DOCTYPE[^>]*>\s*/i, "");

  // Remove top comments (copyright header), keep rest as-is.
  s = s.replace(/^(\s*<!--[\s\S]*?-->\s*)+/g, "");

  return s.trim();
}

function animateKanjiSvg(svgEl) {
  // Animate all <path> strokes by drawing them sequentially.
  const paths = Array.from(svgEl.querySelectorAll("path"));
  if (!paths.length) return 0;

  // Tuning (ms)
  // Slower, easier-to-follow animation.
  const dur = 800;
  const gap = 500;

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    let len = 0;
    try {
      len = p.getTotalLength();
    } catch {
      // Some paths may not support getTotalLength; skip.
      continue;
    }

    // Reset any previous animation.
    p.style.animation = "none";
    // Force reflow for reliable restart.
    // eslint-disable-next-line no-unused-expressions
    p.getBoundingClientRect();

    // Force stroke-only style (KanjiVG paths may have fill styles).
    p.style.fill = "none";
    p.style.stroke = "rgba(255,255,255,0.92)";
    p.style.strokeWidth = "4";
    p.style.strokeLinecap = "round";
    p.style.strokeLinejoin = "round";

    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    p.style.animation = `kvg-draw ${dur}ms ease forwards`;
    p.style.animationDelay = `${i * gap}ms`;
  }

  return (paths.length - 1) * gap + dur;
}

export default function App() {
  const [db, setDb] = useState(null);
  const [query, setQuery] = useState("");
  const [activeKanji, setActiveKanji] = useState(null);
  const [svgText, setSvgText] = useState("");
  const [drawMode, setDrawMode] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const svgHostRef = useRef(null);

  // Pass a "mounted key" so the canvas hook can re-initialize when the modal mounts.
  const { canvasRef, clear, hasInk } = useCanvasDraw(drawMode, activeKanji?.kanji || null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/kanji_db.json", { cache: "no-store" });
      const j = await res.json();
      setDb(j);
    })();
  }, []);

  const items = useMemo(() => {
    if (!db) return [];
    const order = db.order || Object.keys(db.items || {});
    const all = order.map((k) => db.items[k]).filter(Boolean);

    const q = query.trim();
    if (!q) return all;

    // Search: kanji char, hanviet input, meaning, readings
    const qLower = q.toLowerCase();
    return all.filter((it) => {
      const info = normalizeInfo(it.info);
      const haystack = [
        it.kanji,
        it.hanviet_input,
        info.hanViet,
        info.nghia,
        info.kun,
        info.on,
        info.bo,
      ]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();

      return haystack.includes(qLower);
    });
  }, [db, query]);

  const totalCount = useMemo(() => {
    if (!db) return 0;
    const order = db.order || Object.keys(db.items || {});
    return order.length;
  }, [db]);

  const openDetail = async (it) => {
    setActiveKanji(it);
    setDrawMode(false);
    setAnimating(false);
    setAnimKey(0);
    clear();
    setSvgText("");

    // Prefer local KanjiVG svg (public/resources/kanji_svg/<hex>.svg)
    const code = (it?.svg?.codepoint_hex || "").toLowerCase();
    if (code) {
      try {
        const t = await fetchText(`/resources/kanji_svg/${code}.svg`);
        setSvgText(sanitizeKanjivgSvg(t));
        return;
      } catch {
        // fall through
      }
    }
    // Fallback: show big character if SVG missing
    setSvgText("");
  };

  const closeDetail = () => {
    setActiveKanji(null);
    setSvgText("");
    setDrawMode(false);
    setAnimating(false);
    setAnimKey(0);
    clear();
  };

  const playSvg = () => {
    if (!svgText) return;
    setDrawMode(false);
    clear();
    setAnimating(true);
    setAnimKey((k) => k + 1); // force re-mount of SVG container to restart cleanly
  };

  // Run animation after the SVG is mounted into the modal.
  useEffect(() => {
    if (!animating) return;
    const host = svgHostRef.current;
    if (!host) return;

    let timeoutId = null;
    let raf1 = 0;
    let raf2 = 0;

    const run = () => {
      const svg = host.querySelector("svg");
      if (!svg) {
        setAnimating(false);
        return;
      }

      const total = animateKanjiSvg(svg);
      timeoutId = window.setTimeout(() => setAnimating(false), Math.max(600, total + 200));
    };

    // Two rAFs to ensure layout + SVG is ready.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(run);
    });

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [animKey, animating]);

  const activeInfo = normalizeInfo(activeKanji?.info);

  return (
    <div className="page">
      <div className="phoneFrame">
        <header className="navbar">
          <div className="navTitle">Kanji</div>
        </header>

        <div className="toolbar">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: kanji / hán-việt / nghĩa / kun / on..."
            inputMode="search"
          />
          <div className="count" title="Số chữ đang hiển thị / tổng số">
            <span className="countLabel">Hiển thị</span> {items.length}/{totalCount}
          </div>
        </div>

        <main className="gridWrap">
          <div className="grid">
            {items.map((it) => (
              <button
                key={it.kanji}
                className="card"
                onClick={() => openDetail(it)}
                title={`${it.kanji} (${it.hanviet_input || ""})`}
              >
                <div className="cardKanji">{it.kanji}</div>
                <div className="cardHv">({(it.hanviet_input || "").toUpperCase()})</div>
              </button>
            ))}
          </div>
        </main>

        <Modal open={!!activeKanji} onClose={closeDetail}>
          <div className="detail">
            <div className="detailTop">
              <div className="svgBox">
                {svgText ? (
                  <div
                    className="svgInner"
                    ref={svgHostRef}
                    key={`${activeKanji?.kanji || ""}-${animKey}`}
                    // SVG from KanjiVG contains inline styles; safe enough in local use.
                    dangerouslySetInnerHTML={{ __html: svgText }}
                  />
                ) : (
                  <div className="svgFallback">{activeKanji?.kanji || ""}</div>
                )}

                <canvas
                  ref={canvasRef}
                  className={"drawCanvas" + (drawMode ? " on" : "")}
                />

                <div className="svgActions">
                  <button
                    className={"iconBtn" + (animating ? " active" : "") + (!svgText ? " disabled" : "")}
                    onClick={playSvg}
                    title="Phát animation nét chữ"
                    aria-label="Phát animation nét chữ"
                    disabled={!svgText}
                  >
                    <PlayIcon />
                  </button>
                  <button
                    className={"iconBtn" + (drawMode ? " active" : "")}
                    onClick={() => {
                      // If user wants to hand-draw, stop the auto animation.
                      setAnimating(false);
                      setDrawMode((v) => !v);
                    }}
                    title="Bật/tắt chế độ viết"
                    aria-label="Bật/tắt chế độ viết"
                  >
                    <BrushIcon />
                  </button>
                  <button
                    className={"iconBtn" + (hasInk ? "" : " disabled")}
                    onClick={clear}
                    title="Xóa nét vẽ"
                    aria-label="Xóa nét vẽ"
                    disabled={!hasInk}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>

            <section className="infoCard">
              <div className="row">
                <div className="label">Hán-Việt</div>
                <div className="value">{activeKanji?.hanviet_input || activeInfo.hanViet || "—"}</div>
              </div>
              <div className="row">
                <div className="label">Nghĩa</div>
                <div className="value">{activeInfo.nghia || "—"}</div>
              </div>
              <div className="row">
                <div className="label">Kun</div>
                <div className="value">{activeInfo.kun || "—"}</div>
              </div>
              <div className="row">
                <div className="label">On</div>
                <div className="value">{activeInfo.on || "—"}</div>
              </div>
              <div className="row">
                <div className="label">Bộ</div>
                <div className="value">{activeInfo.bo || "—"}</div>
              </div>

              <div className="hint">
                * Tắt popup: bấm ra ngoài (hoặc nhấn ESC trên desktop).
              </div>
            </section>
          </div>
        </Modal>
      </div>
    </div>
  );
}
