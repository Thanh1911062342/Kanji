import React, { useEffect, useMemo, useRef, useState } from "react";
import "./AdminPage.css";

// ========= Small helpers =========
const nowIso = () => new Date().toISOString();

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toCodepointHex(ch) {
  if (!ch) return "";
  const cp = ch.codePointAt(0);
  if (cp == null) return "";
  // KanjiVG filenames for BMP kanji are typically 5 hex digits (e.g. 065e5)
  return cp.toString(16).toLowerCase().padStart(5, "0");
}

function normalizeKanjiItem(raw) {
  const item = raw ?? {};
  const chu = (item.chu ?? "").toString();
  const svg = item.svg ?? {};
  const hex = svg.codepoint_hex ?? (chu ? toCodepointHex(chu) : "");

  const normReading = (r) => {
    const rr = r ?? {};
    return {
      am: (rr.am ?? "").toString(),
      nghia: (rr.nghia ?? "").toString(),
      viDu: Array.isArray(rr.viDu)
        ? rr.viDu.map((ex) => ({
            tu: (ex?.tu ?? "").toString(),
            hiragana: (ex?.hiragana ?? "").toString(),
            nghia: (ex?.nghia ?? "").toString(),
          }))
        : [],
    };
  };

  return {
    chu,
    hanViet: (item.hanViet ?? "").toString(),
    nghia: (item.nghia ?? "").toString(),
    on: Array.isArray(item.on) ? item.on.map(normReading) : [],
    kun: Array.isArray(item.kun) ? item.kun.map(normReading) : [],
    bo: item.bo == null ? "" : item.bo.toString(),
    svg: {
      codepoint_hex: hex,
      path: (svg.path ?? (hex ? `resources/kanji_svg/${hex}.svg` : "")).toString(),
      exists: svg.exists === false ? false : true,
    },
    updatedAt: (item.updatedAt ?? nowIso()).toString(),
  };
}

function createEmptyKanji(chu) {
  const hex = chu ? toCodepointHex(chu) : "";
  return normalizeKanjiItem({
    chu: chu ?? "",
    hanViet: "",
    nghia: "",
    on: [],
    kun: [],
    bo: "",
    svg: {
      codepoint_hex: hex,
      path: hex ? `resources/kanji_svg/${hex}.svg` : "",
      exists: true,
    },
    updatedAt: nowIso(),
  });
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

async function tryOpenFileHandle() {
  if (!window.showOpenFilePicker) return null;
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  });
  return handle ?? null;
}

async function trySaveToHandle(handle, text) {
  if (!handle?.createWritable) return false;
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

// ========= UI components =========
function IconButton({ className = "", title, onClick, children, type = "button" }) {
  return (
    <button type={type} className={`adm-icon-btn ${className}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="adm-row">
      <div className="adm-label">{label}</div>
      <div className="adm-value">{children}</div>
    </div>
  );
}

function ReadingEditor({ title, value, onChange }) {
  const readings = value;

  const updateReading = (idx, patch) => {
    const next = readings.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addReading = () => {
    onChange([
      ...readings,
      {
        am: "",
        nghia: "",
        viDu: [],
      },
    ]);
  };

  const removeReading = (idx) => {
    const next = readings.filter((_, i) => i !== idx);
    onChange(next);
  };

  const addExample = (idx) => {
    const next = readings.map((r, i) =>
      i === idx
        ? { ...r, viDu: [...(r.viDu ?? []), { tu: "", hiragana: "", nghia: "" }] }
        : r
    );
    onChange(next);
  };

  const updateExample = (idx, exIdx, patch) => {
    const next = readings.map((r, i) => {
      if (i !== idx) return r;
      const viDu = (r.viDu ?? []).map((ex, j) => (j === exIdx ? { ...ex, ...patch } : ex));
      return { ...r, viDu };
    });
    onChange(next);
  };

  const removeExample = (idx, exIdx) => {
    const next = readings.map((r, i) => {
      if (i !== idx) return r;
      const viDu = (r.viDu ?? []).filter((_, j) => j !== exIdx);
      return { ...r, viDu };
    });
    onChange(next);
  };

  return (
    <div className="adm-section">
      <div className="adm-section-head">
        <div className="adm-section-title">{title}</div>
        <IconButton title={`Thêm âm ${title}`} onClick={addReading}>
          +
        </IconButton>
      </div>

      {readings.length === 0 ? (
        <div className="adm-muted">Chưa có.</div>
      ) : (
        <div className="adm-reading-list">
          {readings.map((r, idx) => (
            <div key={`${title}-${idx}`} className="adm-reading-card">
              <div className="adm-reading-head">
                <div className="adm-reading-badge">{title}</div>
                <IconButton title="Xóa" className="adm-danger" onClick={() => removeReading(idx)}>
                  ×
                </IconButton>
              </div>

              <div className="adm-grid2">
                <input
                  className="adm-input"
                  value={r.am}
                  onChange={(e) => updateReading(idx, { am: e.target.value })}
                  placeholder="Âm"
                />
                <input
                  className="adm-input"
                  value={r.nghia}
                  onChange={(e) => updateReading(idx, { nghia: e.target.value })}
                  placeholder="Nghĩa (tuỳ chọn)"
                />
              </div>

              <div className="adm-subhead">
                <div className="adm-subtitle">Ví dụ</div>
                <IconButton title="Thêm ví dụ" onClick={() => addExample(idx)}>
                  +
                </IconButton>
              </div>

              {(r.viDu ?? []).length === 0 ? (
                <div className="adm-muted">Chưa có ví dụ.</div>
              ) : (
                <div className="adm-ex-list">
                  {(r.viDu ?? []).map((ex, exIdx) => (
                    <div key={`${title}-${idx}-ex-${exIdx}`} className="adm-ex-row">
                      <input
                        className="adm-input"
                        value={ex.tu}
                        onChange={(e) => updateExample(idx, exIdx, { tu: e.target.value })}
                        placeholder="Từ"
                      />
                      <input
                        className="adm-input"
                        value={ex.hiragana}
                        onChange={(e) => updateExample(idx, exIdx, { hiragana: e.target.value })}
                        placeholder="Hiragana"
                      />
                      <input
                        className="adm-input"
                        value={ex.nghia}
                        onChange={(e) => updateExample(idx, exIdx, { nghia: e.target.value })}
                        placeholder="Nghĩa"
                      />
                      <IconButton title="Xóa" className="adm-danger" onClick={() => removeExample(idx, exIdx)}>
                        ×
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage({
  // Try to auto-load json from these public paths (optional)
  initialUrlCandidates = ["/kanji_db.json", "/kanji.json", "/data/kanji_db.json"],
  onBack,
}) {
  const [items, setItems] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState("");

  const fileHandleRef = useRef(null);
  const fileInputRef = useRef(null);

  const selected = useMemo(() => items[selectedIndex] ?? null, [items, selectedIndex]);

  // ===== auto load =====
  useEffect(() => {
    let cancelled = false;

    async function tryFetch() {
      for (const url of initialUrlCandidates) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          if (cancelled) return;
          if (Array.isArray(data)) {
            const norm = data.map(normalizeKanjiItem);
            setItems(norm);
            setSelectedIndex(0);
            setStatus(`Đã load ${norm.length} chữ từ ${url}`);
            return;
          }
        } catch {
          // ignore
        }
      }
    }

    tryFetch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync draft when select changes
  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(deepClone(selected));
  }, [selected]);

  const sidebarItems = useMemo(
    () =>
      items.map((it, idx) => ({
        idx,
        chu: it.chu,
        hanViet: it.hanViet,
        nghia: it.nghia,
      })),
    [items]
  );

  const openJson = async () => {
    setStatus("");
    try {
      const handle = await tryOpenFileHandle();
      if (handle) {
        fileHandleRef.current = handle;
        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("JSON phải là array");
        const norm = data.map(normalizeKanjiItem);
        setItems(norm);
        setSelectedIndex(0);
        setStatus(`Đã mở file: ${file.name} (${norm.length} chữ)`);
        return;
      }
    } catch (e) {
      console.warn(e);
    }

    // Fallback: regular file input
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("JSON phải là array");
      const norm = data.map(normalizeKanjiItem);
      setItems(norm);
      setSelectedIndex(0);
      setStatus(`Đã load file: ${file.name} (${norm.length} chữ)`);
    } catch (err) {
      setStatus(`Lỗi đọc file: ${String(err)}`);
    } finally {
      e.target.value = "";
    }
  };

  const addNewKanji = () => {
    const chu = window.prompt("Nhập 1 chữ Kanji:");
    if (!chu) return;
    const ch = chu.trim().slice(0, 1);
    const next = [...items, createEmptyKanji(ch)];
    setItems(next);
    setSelectedIndex(next.length - 1);
    setStatus(`Đã thêm: ${ch}`);
  };

  const deleteSelected = () => {
    if (!selected) return;
    const ok = window.confirm(`Xóa chữ ${selected.chu} ?`);
    if (!ok) return;
    const next = items.filter((_, i) => i !== selectedIndex);
    setItems(next);
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, next.length - 1)));
    setStatus(`Đã xóa: ${selected.chu}`);
  };

  const commitDraftToList = () => {
    if (!draft) return;
    const cleaned = normalizeKanjiItem({ ...draft, updatedAt: nowIso() });
    const next = items.map((it, i) => (i === selectedIndex ? cleaned : it));
    setItems(next);
    setStatus(`Đã cập nhật: ${cleaned.chu}`);
    return cleaned;
  };

  const saveJson = async () => {
    setStatus("");
    // Ensure current draft is committed
    const committed = commitDraftToList();
    const snapshot = items.map((it, i) => (i === selectedIndex && committed ? committed : it));

    const text = JSON.stringify(snapshot, null, 2);
    try {
      const handle = fileHandleRef.current;
      if (handle) {
        const ok = await trySaveToHandle(handle, text);
        if (ok) {
          setStatus("Đã ghi lại vào file JSON (File System Access API).");
          return;
        }
      }
    } catch (e) {
      console.warn(e);
    }

    // Fallback: download
    downloadText("kanji_db.json", text);
    setStatus("Không thể ghi trực tiếp vào file. Đã tải xuống kanji_db.json.");
  };

  // ===== Draft field updates =====
  const updateDraft = (patch) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const goPrev = () => setSelectedIndex((i) => Math.max(0, i - 1));
  const goNext = () => setSelectedIndex((i) => Math.min(items.length - 1, i + 1));

  return (
    <div className="adm-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="adm-hidden"
        onChange={onFilePicked}
      />

      <div className="adm-topbar">
        <div className="adm-topbar-left">
          {onBack ? (
            <IconButton title="Quay lại" onClick={onBack}>
              ←
            </IconButton>
          ) : null}
          <div className="adm-title">Quản trị Kanji</div>
        </div>
        <div className="adm-topbar-actions">
          <button className="adm-btn" onClick={openJson}>
            Mở JSON
          </button>
          <button className="adm-btn" onClick={saveJson}>
            Cập nhật
          </button>
        </div>
      </div>

      <div className="adm-body">
        <aside className="adm-sidebar">
          <div className="adm-sidebar-head">
            <div className="adm-sidebar-title">Danh sách</div>
            <IconButton title="Thêm mới" onClick={addNewKanji}>
              +
            </IconButton>
          </div>

          <div className="adm-sidebar-list">
            {sidebarItems.length === 0 ? (
              <div className="adm-muted">Chưa có dữ liệu. Bấm “Mở JSON”.</div>
            ) : (
              sidebarItems.map((it) => (
                <button
                  key={`${it.chu}-${it.idx}`}
                  className={`adm-side-item ${it.idx === selectedIndex ? "is-active" : ""}`}
                  onClick={() => setSelectedIndex(it.idx)}
                >
                  <div className="adm-side-chu">{it.chu || "?"}</div>
                  <div className="adm-side-meta">
                    <div className="adm-side-hv">{it.hanViet || "(chưa có)"}</div>
                    <div className="adm-side-nghia">{it.nghia || ""}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="adm-status">{status || " "}</div>
        </aside>

        <main className="adm-main">
          {!draft ? (
            <div className="adm-empty">Chọn 1 chữ ở sidebar để chỉnh sửa.</div>
          ) : (
            <div className="adm-card">
              <div className="adm-card-head">
                <div className="adm-card-head-left">
                  <div className="adm-big-chu">{draft.chu || "?"}</div>
                  <div className="adm-mini">UpdatedAt: {draft.updatedAt || ""}</div>
                </div>
                <div className="adm-card-head-actions">
                  <IconButton title="Trước" onClick={goPrev}>
                    ◀
                  </IconButton>
                  <IconButton title="Sau" onClick={goNext}>
                    ▶
                  </IconButton>
                  <IconButton title="Xóa chữ" className="adm-danger" onClick={deleteSelected}>
                    🗑
                  </IconButton>
                </div>
              </div>

              <div className="adm-form">
                <FieldRow label="Chữ">
                  <input
                    className="adm-input"
                    value={draft.chu}
                    onChange={(e) => {
                      const ch = e.target.value.trim().slice(0, 1);
                      const hex = ch ? toCodepointHex(ch) : "";
                      updateDraft({
                        chu: ch,
                        svg: {
                          ...(draft.svg ?? {}),
                          codepoint_hex: hex,
                          path: hex ? `resources/kanji_svg/${hex}.svg` : "",
                        },
                      });
                    }}
                    placeholder="Ví dụ: 日"
                  />
                </FieldRow>

                <FieldRow label="Hán-Việt">
                  <input
                    className="adm-input"
                    value={draft.hanViet}
                    onChange={(e) => updateDraft({ hanViet: e.target.value })}
                    placeholder="Ví dụ: NHẬT"
                  />
                </FieldRow>

                <FieldRow label="Nghĩa">
                  <textarea
                    className="adm-textarea"
                    value={draft.nghia}
                    onChange={(e) => updateDraft({ nghia: e.target.value })}
                    placeholder="Ví dụ: mặt trời, ngày..."
                    rows={3}
                  />
                </FieldRow>

                <ReadingEditor title="Kun" value={draft.kun ?? []} onChange={(kun) => updateDraft({ kun })} />
                <ReadingEditor title="On" value={draft.on ?? []} onChange={(on) => updateDraft({ on })} />

                <div className="adm-section">
                  <div className="adm-section-title">Bộ</div>
                  <textarea
                    className="adm-textarea"
                    value={draft.bo ?? ""}
                    onChange={(e) => updateDraft({ bo: e.target.value })}
                    placeholder="Ví dụ: 日（bộ Nhật/ひ）"
                    rows={2}
                  />
                </div>

                <div className="adm-section">
                  <div className="adm-section-title">SVG</div>
                  <div className="adm-grid2">
                    <input
                      className="adm-input"
                      value={draft.svg?.codepoint_hex ?? ""}
                      onChange={(e) => updateDraft({ svg: { ...(draft.svg ?? {}), codepoint_hex: e.target.value } })}
                      placeholder="codepoint_hex"
                    />
                    <label className="adm-check">
                      <input
                        type="checkbox"
                        checked={draft.svg?.exists !== false}
                        onChange={(e) => updateDraft({ svg: { ...(draft.svg ?? {}), exists: e.target.checked } })}
                      />
                      exists
                    </label>
                  </div>
                  <input
                    className="adm-input"
                    value={draft.svg?.path ?? ""}
                    onChange={(e) => updateDraft({ svg: { ...(draft.svg ?? {}), path: e.target.value } })}
                    placeholder="resources/kanji_svg/065e5.svg"
                  />
                </div>

                <div className="adm-actions">
                  <button className="adm-btn" onClick={commitDraftToList}>
                    Lưu vào DB (tạm)
                  </button>
                  <button className="adm-btn adm-primary" onClick={saveJson}>
                    Cập nhật ra file JSON
                  </button>
                </div>

                <div className="adm-note">
                  * Nếu bạn chạy trên Chrome/Edge (localhost), “Cập nhật” có thể ghi thẳng vào file JSON đã mở.
                  Nếu không, app sẽ tải xuống file kanji_db.json để bạn tự thay thế.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
