import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Modal expects `entry` normalized like:
 * { chu, hanViet, nghia, kun:[{am,...}], on:[{am,...}], bo, svg:{path,exists} }
 *
 * - SVG file is loaded from: / + entry.svg.path
 *   => Make sure you put KanjiVG SVGs under `public/resources/kanji_svg/`
 *      so that "resources/kanji_svg/065e5.svg" is reachable.
 */

function safeSvgUrl(entry) {
  const p = entry?.svg?.path;
  if (!p || typeof p !== "string") return "";
  // Ensure single leading slash
  return p.startsWith("/") ? p : `/${p}`;
}

function extractStrokes(svgEl) {
  if (!svgEl) return [];
  const paths = Array.from(svgEl.querySelectorAll("path"));
  // Filter out the grid guide lines (#bcc9e2)
  const strokes = paths.filter((p) => {
    const stroke = (p.getAttribute("stroke") || "").toLowerCase();
    if (stroke === "#bcc9e2") return false;
    // Some SVGs may have empty stroke but are real strokes; include if they have a d
    const d = p.getAttribute("d");
    return Boolean(d);
  });
  return strokes;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function KanjiModal({ entry, onClose }) {
  const [svgText, setSvgText] = useState("");
  const [svgErr, setSvgErr] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [drawMode, setDrawMode] = useState(false);

  const svgHostRef = useRef(null);
  const canvasRef = useRef(null);
  const abortAnimRef = useRef({ abort: false });

  const svgUrl = useMemo(() => safeSvgUrl(entry), [entry]);

  useEffect(() => {
    let cancelled = false;

    async function loadSvg() {
      try {
        setSvgErr("");
        setSvgText("");
        if (!svgUrl) {
          setSvgErr("Không có SVG path.");
          return;
        }

        const res = await fetch(svgUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Load SVG failed: HTTP ${res.status}`);
        const raw = await res.text();

        // Parse & re-serialize to avoid stray text nodes like "]>"
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, "image/svg+xml");
        const root = doc.documentElement;

        // Remove any weird pure-text nodes
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const toRemove = [];
        let node = walker.nextNode();
        while (node) {
          const v = (node.nodeValue || "").trim();
          if (!v || v === "]>" || v === "]]>") toRemove.push(node);
          node = walker.nextNode();
        }
        toRemove.forEach((n) => n.parentNode && n.parentNode.removeChild(n));

        const cleaned = root.outerHTML;
        if (!cancelled) setSvgText(cleaned);
      } catch (e) {
        if (!cancelled) setSvgErr(String(e?.message || e));
      }
    }

    loadSvg();
    return () => {
      cancelled = true;
    };
  }, [svgUrl]);

  // Canvas draw helpers
  useEffect(() => {
    if (!drawMode) return;

    const host = svgHostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
    }

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let drawing = false;
    let last = null;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onDown(e) {
      drawing = true;
      last = pos(e);
    }
    function onMove(e) {
      if (!drawing || !last) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function onUp() {
      drawing = false;
      last = null;
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drawMode]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const host = svgHostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = host.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  async function playAnimation() {
    const host = svgHostRef.current;
    if (!host) return;

    const svgEl = host.querySelector("svg");
    if (!svgEl) return;

    if (isAnimating) return;
    setIsAnimating(true);
    abortAnimRef.current.abort = false;

    try {
      const strokes = extractStrokes(svgEl);
      if (!strokes.length) return;

      // Slower animation
      const perStrokeMs = 900;
      const gapMs = 180;

      // Reset strokes
      strokes.forEach((p) => {
        const len = p.getTotalLength ? p.getTotalLength() : 0;
        p.style.transition = "none";
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len}`;
        p.style.opacity = "1";
      });

      // Force layout
      // eslint-disable-next-line no-unused-expressions
      svgEl.getBoundingClientRect();

      for (const p of strokes) {
        if (abortAnimRef.current.abort) break;
        p.style.transition = `stroke-dashoffset ${perStrokeMs}ms linear`;
        p.style.strokeDashoffset = "0";
        await sleep(perStrokeMs + gapMs);
      }
    } finally {
      setIsAnimating(false);
    }
  }

  function stopAnimation() {
    abortAnimRef.current.abort = true;
    setIsAnimating(false);
  }

  function renderPills(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return <span className="muted">—</span>;
    return (
      <div className="pillWrap">
        {arr.map((x, i) => {
          const am = typeof x === "string" ? x : x?.am;
          if (!am) return null;
          return (
            <span className="pill" key={`${am}-${i}`}>
              {am}
            </span>
          );
        })}
      </div>
    );
  }

  function collectExamples(entry) {
  // Return a flat list of examples:
  // [{ tu, hiragana, nghia }]
  const out = [];
  const seen = new Set();

  const pushExample = (ex) => {
    if (!ex) return;

    // Normalize various shapes:
    // - {tu, hiragana, nghia}
    // - {word, reading, meaning}
    // - "日本（にほん）" or "日本(にほん)" or "日本: nghĩa"
    if (typeof ex === "string") {
      const s = ex.trim();
      if (!s) return;

      // Try patterns:
      // 1) 漢字（かな）: meaning
      // 2) 漢字（かな）
      // 3) 漢字: meaning
      const m1 = s.match(/^(.+?)[（(]([^）)]+)[）)]\s*[:：]\s*(.+)$/);
      const m2 = s.match(/^(.+?)[（(]([^）)]+)[）)]$/);
      const m3 = s.match(/^(.+?)\s*[:：]\s*(.+)$/);

      const tu = (m1?.[1] ?? m2?.[1] ?? m3?.[1] ?? s).trim();
      const hiragana = (m1?.[2] ?? m2?.[2] ?? "").trim();
      const nghia = (m1?.[3] ?? m3?.[2] ?? "").trim();

      const key = `${tu}||${hiragana}||${nghia}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ tu, hiragana, nghia });
      return;
    }

    const tu = (ex.tu ?? ex.word ?? "").toString().trim();
    const hiragana = (ex.hiragana ?? ex.reading ?? "").toString().trim();
    const nghia = (ex.nghia ?? ex.meaning ?? "").toString().trim();

    if (!tu) return;
    const key = `${tu}||${hiragana}||${nghia}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tu, hiragana, nghia });
  };

  const walkExampleArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) pushExample(item);
  };

  const walkReadings = (readings) => {
    if (!Array.isArray(readings)) return;

    for (const r of readings) {
      // New format: { am, nghia, viDu:[...] }
      if (r && typeof r === "object" && Array.isArray(r.viDu)) {
        walkExampleArray(r.viDu);
        continue;
      }

      // Sometimes examples might be directly embedded as objects
      // e.g. {tu, hiragana, nghia}
      pushExample(r);
    }
  };

  // 1) New format: nested examples inside entry.on/entry.kun
  walkReadings(entry?.kun);
  walkReadings(entry?.on);

  // 2) Alternate formats (if you build json from text manually)
  walkExampleArray(entry?.viDuKun);
  walkExampleArray(entry?.viDuOn);

  // 3) Generic fallbacks
  if (entry?.viDu) walkExampleArray(entry.viDu);
  if (entry?.examples) {
    // examples could be an array or {kun:[...], on:[...]}
    if (Array.isArray(entry.examples)) walkExampleArray(entry.examples);
    if (entry.examples?.kun) walkExampleArray(entry.examples.kun);
    if (entry.examples?.on) walkExampleArray(entry.examples.on);
  }

  return out;
}

const boText = entry?.bo ? String(entry.bo) : "—";

  return (
    <div className="modalOverlay" onMouseDown={onClose} role="presentation">
      <div
        className="modalPanel"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modalHeader">
          <div className="modalTitle">
            <span className="modalKanji">{entry?.chu}</span>
            <span className="modalHanviet">({entry?.hanViet || "—"})</span>
          </div>

          <div className="modalActions">
            <button
              className="iconBtn"
              type="button"
              onClick={isAnimating ? stopAnimation : playAnimation}
              title={isAnimating ? "Dừng" : "Play animation"}
            >
              {isAnimating ? "■" : "▶"}
            </button>

            <button
              className={"iconBtn" + (drawMode ? " active" : "")}
              type="button"
              onClick={() => setDrawMode((v) => !v)}
              title="Vẽ"
            >
              🖌
            </button>

            <button className="iconBtn" type="button" onClick={clearCanvas} title="Xóa nét vẽ">
              🗑
            </button>
          </div>
        </div>

        <div className="modalBody">
          <div className="svgBlock">
            <div className="svgSquare" ref={svgHostRef}>
              {svgErr ? (
                <div className="svgError">{svgErr}</div>
              ) : svgText ? (
                <div
                  className={`svgInner${isAnimating ? " playing" : ""}`}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: svgText }}
                />
              ) : (
                <div className="svgLoading">Loading SVG...</div>
              )}
              <canvas
                ref={canvasRef}
                className={"drawCanvas" + (drawMode ? " on" : "")}
              />
            </div>
          </div>

          <div className="infoCard">
            <div className="infoRow">
              <div className="infoLabel">Hán-Việt</div>
              <div className="infoValue">{entry?.hanViet || "—"}</div>
            </div>
            <div className="infoRow">
              <div className="infoLabel">Nghĩa</div>
              <div className="infoValue">{entry?.nghia || "—"}</div>
            </div>
            <div className="infoRow">
              <div className="infoLabel">Kun</div>
              <div className="infoValue">{renderPills(entry?.kun)}</div>
            </div>
            <div className="infoRow">
              <div className="infoLabel">On</div>
              <div className="infoValue">{renderPills(entry?.on)}</div>
            </div>

            <div className="infoRow">
              <div className="infoLabel">Ví dụ</div>
              <div className="infoValue">
                {(() => {
                  // Examples are nested inside entry.kun[].viDu / entry.on[].viDu
                  // so we must pass the current entry into the collector.
                  const exs = collectExamples(entry);
                  if (!exs.length) return <span className="muted">—</span>;
                  return (
                    <div className="exampleList">
                      {exs.map((ex, idx) => (
                        <div className="exampleLine" key={`${ex.tu}-${idx}`}>
                          <span className="exWord">{ex.tu}</span>
                          {ex.hiragana ? (
                            <span className="exHira"> ({ex.hiragana})</span>
                          ) : null}
                          <span className="exSep">: </span>
                          <span className="exMean">{ex.nghia || "—"}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="infoRow">
              <div className="infoLabel">Bộ</div>
              <div className="infoValue">{boText}</div>
            </div>
          </div>
        </div>

        <div className="modalHint">Chạm ra ngoài để đóng.</div>
      </div>
    </div>
  );
}
