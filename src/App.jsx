import React, { useEffect, useMemo, useState } from "react";
import KanjiModal from "./components/KanjiModal";
import AdminPage from "./pages/AdminPage";
import "./styles.css";

/**
 * Expected DB formats supported:
 * 1) NEW: Array of entries:
 *    [{ chu, hanViet, nghia, on:[{am,nghia,viDu}], kun:[...], bo, svg:{path,exists,...}, updatedAt }, ...]
 * 2) OLD (your previous db): { order: [...], items: { "日": {...}, ... } }
 */
function parseReadingsFromString(s) {
  if (!s || typeof s !== "string") return [];
  // Example: "ひ -び -か" => ["ひ","び","か"]
  const cleaned = s.replace(/[　]/g, " ").trim();
  const parts = cleaned
    .split(/[\s,]+/)
    .flatMap((tok) => tok.split("-"))
    .map((x) => x.trim())
    .filter(Boolean);

  // De-dup while keeping order
  const seen = new Set();
  return parts
    .filter((am) => {
      if (seen.has(am)) return false;
      seen.add(am);
      return true;
    })
    .map((am) => ({ am }));
}

function normalizeOne(raw, fallbackKanji) {
  if (!raw || typeof raw !== "object") return null;

  // New schema
  if (typeof raw.chu === "string") {
    return {
      chu: raw.chu,
      hanViet: raw.hanViet ?? "",
      nghia: raw.nghia ?? "",
      kun: Array.isArray(raw.kun) ? raw.kun : [],
      on: Array.isArray(raw.on) ? raw.on : [],
      bo: raw.bo ?? null,
      svg: raw.svg ?? null,
      updatedAt: raw.updatedAt ?? null,
      _raw: raw,
    };
  }

  // Old schema (kanji_db.json you uploaded earlier)
  const chu = raw.kanji || fallbackKanji || raw?.info?.["Hán tự"]?.kanji || "";
  const hanViet = raw.hanviet_input || "";
  const nghia = raw?.info?.["Giải nghĩa"] || raw?.info?.["Nghĩa"] || "";
  const kun = parseReadingsFromString(raw?.info?.["Kunyomi"]);
  const on = parseReadingsFromString(raw?.info?.["Onyomi"]);
  const bo = raw?.info?.["Bộ"] ?? null;

  return {
    chu,
    hanViet,
    nghia,
    kun,
    on,
    bo,
    svg: raw.svg ?? null,
    updatedAt: raw.fetched_at ?? null,
    _raw: raw,
  };
}

function normalizeDb(db) {
  // New schema: array
  if (Array.isArray(db)) {
    return db.map((x) => normalizeOne(x)).filter(Boolean);
  }

  // Old schema: { order, items }
  if (db && typeof db === "object") {
    // If items is already an array (rare)
    if (Array.isArray(db.items)) {
      return db.items.map((x) => normalizeOne(x)).filter(Boolean);
    }

    // items is a dict keyed by kanji
    if (db.items && typeof db.items === "object") {
      const order = Array.isArray(db.order) ? db.order : Object.keys(db.items);
      return order.map((k) => normalizeOne(db.items[k], k)).filter(Boolean);
    }
  }

  return [];
}

export default function App() {
  const [rawDb, setRawDb] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  // main | admin
  const [page, setPage] = useState("main");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError("");
        const res = await fetch("/kanji_db.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRawDb(json);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => normalizeDb(rawDb), [rawDb]);

  // Minimal search (optional): type to filter by kanji or hanviet
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim();
    if (!t) return items;
    return items.filter(
      (x) =>
        x.chu?.includes(t) ||
        (x.hanViet || "").toLowerCase().includes(t.toLowerCase())
    );
  }, [items, q]);

  const openAdmin = () => {
    setSelected(null);
    setPage("admin");
  };

  const backToMain = () => {
    setPage("main");
  };

  return (
    <div className="appShell">
      {page === "main" ? (
        <>
          <div className="navBar" style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 44 }} />
            <div className="navTitle" style={{ flex: 1, textAlign: "center" }}>
              Kanji
            </div>

            <button
              type="button"
              onClick={openAdmin}
              aria-label="Mở trang quản trị"
              title="Quản trị"
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.92)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              ⚙
            </button>
          </div>

          <div className="content">
            <div className="toolbar">
              <input
                className="searchInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm kanji / Hán-Việt..."
                inputMode="search"
              />
              <div className="toolbarMeta">
                {error ? (
                  <span className="errorText">Lỗi load DB: {error}</span>
                ) : (
                  <span className="mutedText">{filtered.length} chữ</span>
                )}
              </div>
            </div>

            <div className="grid">
              {filtered.map((k) => (
                <button
                  key={k.chu}
                  className="kanjiCard"
                  onClick={() => setSelected(k)}
                  type="button"
                >
                  <div className="kanjiChar">{k.chu}</div>
                  <div className="kanjiHanviet">({k.hanViet || "—"})</div>
                </button>
              ))}
            </div>
          </div>

          {selected && <KanjiModal entry={selected} onClose={() => setSelected(null)} />}
        </>
      ) : (
        <AdminPage onBack={backToMain} />
      )}
    </div>
  );
}
