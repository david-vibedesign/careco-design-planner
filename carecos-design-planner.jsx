import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "careco-planner-v1";

function loadInitialState() {
  const migrate = (state) => {
    if (state?.topics) {
      state.topics = state.topics.map((t) => ({
        ...t,
        devStartDate: t.devStartDate || t.startDate || "2026-04-30",
        status:      t.status       !== undefined ? t.status : "Unassigned",
        description: t.description  !== undefined ? t.description : "",
      }));
    }
    return state;
  };
  try {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const state = migrate(JSON.parse(atob(hash)));
      if (state?.topics) return state;
    }
  } catch {}
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrate(JSON.parse(saved));
  } catch {}
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZES = {
  XS:  { days: 1,  hours: "0–4h",   weeks: 0.2, color: "#059669" },
  S:   { days: 3,  hours: "12h",    weeks: 0.6, color: "#2563EB" },
  M:   { days: 5,  hours: "20h",    weeks: 1,   color: "#D97706" },
  L:   { days: 10, hours: "40h",    weeks: 2,   color: "#EA580C" },
  XL:  { days: 20, hours: "80h+",   weeks: 4,   color: "#DC2626" },
  XXL: { days: 40, hours: "160h+",  weeks: 8,   color: "#7C3AED" },
};

const TEAMS = ["CareCo", "Doctolib", "PHNX", "NEMO", "KITN"];

const TEAM_COLORS = {
  CareCo:   "#F59E0B",
  Doctolib: "#1D6AC5",
  PHNX:     "#A855F7",
  NEMO:     "#3B82F6",
  KITN:     "#10B981",
};

const TYPE_OPTIONS = ["discovery", "delivery", "foundation"];
const TYPE_COLORS  = {
  discovery:  "#0EA5E9",
  delivery:   "#8B5CF6",
  foundation: "#F97316",
};

const STATUS_OPTIONS = ["Unassigned", "Planned", "In Progress", "Done", "Blocked"];
const STATUS_COLORS  = {
  "Unassigned":  "#6B7280",
  "Planned":     "#2563EB",
  "In Progress": "#D97706",
  "Done":        "#059669",
  "Blocked":     "#DC2626",
};

// Oxygen design system primary button style (Doctolib)
const OXYGEN_BTN_STYLE = {
  background:   "#1D6AC5",
  color:        "#FFFFFF",
  borderRadius: "6px",
  padding:      "8px 16px",
  fontSize:     "14px",
  fontWeight:   600,
  lineHeight:   "20px",
  border:       "none",
  cursor:       "pointer",
  display:      "inline-flex",
  alignItems:   "center",
  gap:          "6px",
};

// NL public holidays Q2 2026 (Easter = April 5, 2026)
const NL_HOLIDAYS = [
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-27", name: "King's Day" },
  { date: "2026-05-05", name: "Liberation Day" },
  { date: "2026-05-14", name: "Ascension Day" },
  { date: "2026-05-25", name: "Whit Monday" },
];

const HOLIDAY_SET = new Set(NL_HOLIDAYS.map((h) => h.date));

function isWorkingDay(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const iso = d.toISOString().slice(0, 10);
  return !HOLIDAY_SET.has(iso);
}

function addWorkingDays(startDateStr, n) {
  const d = new Date(startDateStr);
  d.setHours(0, 0, 0, 0);
  let remaining = n - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

// Subtract N working days backward from endDateStr (devStartDate = last day of design work)
function subtractWorkingDays(endDateStr, n) {
  const d = new Date(endDateStr);
  d.setHours(0, 0, 0, 0);
  let remaining = n - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

function fmtDate(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Q2 2026 boundaries
const Q2_START = new Date("2026-04-01");
const Q2_END   = new Date("2026-06-30");
const Q2_DAYS  = Math.round((Q2_END - Q2_START) / 86400000) + 1; // 91

// Count working days in Q2 2026
let Q2_WORKING_DAYS = 0;
{
  const d = new Date(Q2_START);
  while (d <= Q2_END) {
    if (isWorkingDay(d)) Q2_WORKING_DAYS++;
    d.setDate(d.getDate() + 1);
  }
}

// ─── Default data ─────────────────────────────────────────────────────────────

const INIT_MEMBERS = [
  { id: "m1", name: "Jill Jansen",     role: "Senior Product Designer", team: "CareCo" },
  { id: "m2", name: "Axel Bauer",      role: "Senior Product Designer", team: "CareCo" },
  { id: "m3", name: "Marie Dubois",    role: "User Researcher",         team: "CareCo" },
  { id: "m4", name: "David Brandau",   role: "Senior Design Team Manager", team: "CareCo" },
];

const EMPTY_FORM = {
  title:          "",
  team:           "CareCo",
  type:           "discovery",
  size:           "M",
  priority:       false,
  status:         "Unassigned",
  description:    "",
  ownerId:        "m1",
  ownerPercent:   100,
  supporterId:    "",
  supporterPercent: 0,
  devStartDate:   "2026-04-30",
};

// ─── Topic Form Modal ──────────────────────────────────────────────────────────

function TopicFormModal({ initial, members, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const ownerPercent    = parseInt(form.ownerPercent, 10)    || 100;
  const supporterPercent = 100 - ownerPercent;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#1C2333", borderRadius: "12px", padding: "28px 32px",
        width: "560px", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <h2 style={{ margin: "0 0 20px", color: "#F1F5F9", fontSize: "18px" }}>
          {initial.title ? "Edit Topic" : "Add Topic"}
        </h2>

        {/* Title */}
        <label style={labelStyle}>Topic title</label>
        <input
          style={inputStyle}
          placeholder="e.g. PHNX appointment flow redesign"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />

        {/* Description */}
        <label style={labelStyle}>Description (optional)</label>
        <textarea
          style={{ ...inputStyle, height: "72px", resize: "vertical" }}
          placeholder="Short context, goals, or notes…"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />

        {/* Team + Type */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Team</label>
            <select style={inputStyle} value={form.team} onChange={(e) => set("team", e.target.value)}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Size + Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Size</label>
            <select style={inputStyle} value={form.size} onChange={(e) => set("size", e.target.value)}>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>{k} – {v.hours} (~{v.weeks}w)</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Dev Start Date */}
        <label style={labelStyle}>Development start date (end of design)</label>
        <input
          type="date"
          style={inputStyle}
          value={form.devStartDate}
          onChange={(e) => set("devStartDate", e.target.value)}
        />

        {/* Owner */}
        <label style={labelStyle}>Owner</label>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
          <select style={inputStyle} value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div style={{ position: "relative" }}>
            <input
              type="number" min="10" max="100" step="10"
              style={inputStyle}
              value={ownerPercent}
              onChange={(e) => set("ownerPercent", parseInt(e.target.value, 10))}
            />
            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8", fontSize: "12px" }}>%</span>
          </div>
        </div>

        {/* Supporter */}
        <label style={labelStyle}>Supporter (optional)</label>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
          <select style={inputStyle} value={form.supporterId} onChange={(e) => set("supporterId", e.target.value)}>
            <option value="">— none —</option>
            {members.filter((m) => m.id !== form.ownerId).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <div style={{ position: "relative" }}>
            <input
              type="number" readOnly
              style={{ ...inputStyle, opacity: 0.5 }}
              value={supporterPercent}
            />
            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8", fontSize: "12px" }}>%</span>
          </div>
        </div>

        {/* Priority */}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94A3B8", fontSize: "13px", margin: "12px 0" }}>
          <input
            type="checkbox"
            checked={form.priority}
            onChange={(e) => set("priority", e.target.checked)}
            style={{ accentColor: "#F59E0B", width: "16px", height: "16px" }}
          />
          Mark as priority
        </label>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={() => form.title.trim() && onSave({ ...form, ownerPercent, supporterPercent })}
            style={{ ...OXYGEN_BTN_STYLE, opacity: form.title.trim() ? 1 : 0.5 }}
          >
            Save topic
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: "12px", fontWeight: 600,
  color: "#94A3B8", marginBottom: "4px", marginTop: "12px", textTransform: "uppercase", letterSpacing: "0.05em",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "#0F172A", border: "1px solid #334155",
  borderRadius: "6px", padding: "8px 10px",
  color: "#F1F5F9", fontSize: "14px", outline: "none",
};
const cancelBtnStyle = {
  background: "transparent", border: "1px solid #475569",
  borderRadius: "6px", padding: "8px 16px",
  color: "#94A3B8", fontSize: "14px", cursor: "pointer",
};

// ─── Topics Tab ───────────────────────────────────────────────────────────────

function TopicsTab({ topics, members, onAdd, onEdit, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editTopic, setEditTopic] = useState(null);

  const openAdd  = () => { setEditTopic(null); setShowModal(true); };
  const openEdit = (t) => { setEditTopic(t); setShowModal(true); };
  const handleSave = (form) => {
    if (editTopic) onEdit({ ...editTopic, ...form });
    else onAdd({ id: `t${Date.now()}`, ...form });
    setShowModal(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, color: "#F1F5F9" }}>Topics ({topics.length})</h2>
        <button onClick={openAdd} style={OXYGEN_BTN_STYLE}>
          + Add Topic
        </button>
      </div>

      {topics.length === 0 && (
        <div style={{ textAlign: "center", color: "#475569", padding: "48px 0" }}>
          No topics yet. Click "Add Topic" to start planning.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {topics.map((t) => {
          const owner     = members.find((m) => m.id === t.ownerId);
          const supporter = members.find((m) => m.id === t.supporterId);
          const size      = SIZES[t.size];
          return (
            <div key={t.id} style={{
              background: "#1C2333", borderRadius: "10px", padding: "14px 18px",
              borderLeft: `4px solid ${TEAM_COLORS[t.team] || "#475569"}`,
              display: "grid", gridTemplateColumns: "1fr auto",
              gap: "8px", alignItems: "start",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                  {t.priority && <span style={{ fontSize: "14px" }}>⭐</span>}
                  <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: "15px" }}>{t.title}</span>
                  <span style={{ background: TEAM_COLORS[t.team] + "30", color: TEAM_COLORS[t.team], borderRadius: "4px", padding: "1px 8px", fontSize: "11px", fontWeight: 600 }}>{t.team}</span>
                  <span style={{ background: TYPE_COLORS[t.type] + "30", color: TYPE_COLORS[t.type], borderRadius: "4px", padding: "1px 8px", fontSize: "11px", fontWeight: 600, textTransform: "capitalize" }}>{t.type}</span>
                  <span style={{ background: size.color + "30", color: size.color, borderRadius: "4px", padding: "1px 8px", fontSize: "11px", fontWeight: 700 }}>{t.size}</span>
                  <span style={{ background: STATUS_COLORS[t.status] + "25", color: STATUS_COLORS[t.status], borderRadius: "4px", padding: "1px 8px", fontSize: "11px", fontWeight: 600 }}>{t.status}</span>
                </div>
                {t.description && (
                  <div style={{ color: "#64748B", fontSize: "12px", marginTop: "4px", fontStyle: "italic" }}>{t.description}</div>
                )}
                <div style={{ color: "#64748B", fontSize: "12px", marginTop: "6px" }}>
                  {size.hours} · {size.weeks}w · dev starts {t.devStartDate} · owner: {owner?.name || "?"} ({t.ownerPercent}%){supporter ? ` · support: ${supporter.name} (${t.supporterPercent}%)` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => openEdit(t)} style={{ ...cancelBtnStyle, padding: "4px 12px", fontSize: "12px" }}>Edit</button>
                <button onClick={() => onDelete(t.id)} style={{ ...cancelBtnStyle, padding: "4px 12px", fontSize: "12px", borderColor: "#DC2626", color: "#F87171" }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <TopicFormModal
          initial={editTopic || EMPTY_FORM}
          members={members}
          onSave={handleSave}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ members, vacation, onVacationChange }) {
  return (
    <div>
      <h2 style={{ color: "#F1F5F9", marginBottom: "20px" }}>Team Members</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {members.map((m) => (
          <div key={m.id} style={{
            background: "#1C2333", borderRadius: "10px", padding: "16px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
          }}>
            <div>
              <div style={{ color: "#F1F5F9", fontWeight: 600 }}>{m.name}</div>
              <div style={{ color: "#64748B", fontSize: "13px" }}>{m.role} · {m.team}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ color: "#94A3B8", fontSize: "13px" }}>Vacation days (Q2):</label>
              <input
                type="number" min="0" max="60"
                value={vacation[m.id] ?? 0}
                onChange={(e) => onVacationChange(m.id, parseInt(e.target.value, 10) || 0)}
                style={{ ...inputStyle, width: "64px", textAlign: "center" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Capacity Tab ─────────────────────────────────────────────────────────────

function CapacityTab({ topics, members, vacation }) {
  const rows = members.map((m) => {
    const vacDays    = vacation[m.id] ?? 0;
    const available  = Q2_WORKING_DAYS - vacDays;
    const ownerDays  = topics.filter((t) => t.ownerId === m.id).reduce((s, t) => s + SIZES[t.size].days * ((t.ownerPercent || 100) / 100), 0);
    const suppDays   = topics.filter((t) => t.supporterId === m.id).reduce((s, t) => s + SIZES[t.size].days * ((t.supporterPercent || 0) / 100), 0);
    const totalDays  = ownerDays + suppDays;
    const pct        = available > 0 ? Math.round((totalDays / available) * 100) : 0;
    const overloaded = pct > 100;
    return { ...m, available, ownerDays, suppDays, totalDays, pct, overloaded };
  });

  return (
    <div>
      <h2 style={{ color: "#F1F5F9", marginBottom: "8px" }}>Q2 2026 Capacity</h2>
      <p style={{ color: "#64748B", fontSize: "13px", marginBottom: "20px" }}>
        {Q2_WORKING_DAYS} working days (excl. NL public holidays · Apr–Jun 2026)
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: "#1C2333", borderRadius: "10px", padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "#F1F5F9", fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: r.overloaded ? "#F87171" : "#94A3B8", fontSize: "13px" }}>
                {r.totalDays.toFixed(1)} / {r.available} days ({r.pct}%{r.overloaded ? " ⚠️ over" : ""})
              </span>
            </div>
            <div style={{ background: "#0F172A", borderRadius: "6px", height: "10px", overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(r.pct, 100)}%`,
                height: "100%",
                background: r.overloaded ? "#DC2626" : r.pct > 80 ? "#D97706" : "#2563EB",
                transition: "width 0.3s",
              }} />
            </div>
            <div style={{ color: "#475569", fontSize: "12px", marginTop: "6px" }}>
              Owner: {r.ownerDays.toFixed(1)}d · Support: {r.suppDays.toFixed(1)}d · Vacation: {vacation[r.id] ?? 0}d
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

const STRIPE_CSS = `
  @keyframes stripe-move { from { background-position: 0 0; } to { background-position: 28px 0; } }
  .bar-overlap {
    background-image: repeating-linear-gradient(
      45deg,
      rgba(255,255,255,0.15) 0px,
      rgba(255,255,255,0.15) 6px,
      transparent 6px,
      transparent 14px
    ) !important;
    animation: stripe-move 1s linear infinite;
    box-shadow: 0 0 0 2px #D29922 !important;
  }
`;

function TimelineTab({ topics, members, onUpdateDevStartDate }) {
  const trackRef     = useRef(null);
  const draggingRef  = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  // Build bar positions
  const bars = useMemo(() => {
    return topics.map((t) => {
      const size = SIZES[t.size];
      const devStart = new Date(t.devStartDate);
      devStart.setHours(0, 0, 0, 0);
      const designStart = subtractWorkingDays(t.devStartDate, size.days);

      const startOffset = Math.max(0, (designStart - Q2_START) / 86400000);
      const endOffset   = Math.max(0, (devStart - Q2_START) / 86400000) + 1;
      const left  = (startOffset / Q2_DAYS) * 100;
      const width = Math.max(((endOffset - startOffset) / Q2_DAYS) * 100, 0.5);

      const owner     = members.find((m) => m.id === t.ownerId);
      const supporter = members.find((m) => m.id === t.supporterId);

      return { ...t, left, width, designStart, devStart, owner, supporter, size };
    });
  }, [topics, members]);

  // Overlap detection: same ownerId bars that intersect in calendar time
  const overlapMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i]; const b = bars[j];
        if (a.ownerId !== b.ownerId) continue;
        // Overlap if intervals intersect
        if (a.designStart < b.devStart && b.designStart < a.devStart) {
          if (!map[a.id]) map[a.id] = [];
          if (!map[b.id]) map[b.id] = [];
          map[a.id].push(b);
          map[b.id].push(a);
        }
      }
    }
    return map;
  }, [bars]);

  const hasOverlaps = Object.keys(overlapMap).length > 0;

  // Drag logic
  const onMouseDown = useCallback((e, bar) => {
    e.preventDefault();
    const trackEl = trackRef.current;
    if (!trackEl) return;
    const trackRect = trackEl.getBoundingClientRect();
    const startX    = e.clientX;
    const origLeft  = bar.left;

    draggingRef.current = { id: bar.id, trackRect, startX, origLeft };

    const onMouseMove = (me) => {
      const { id, trackRect: tr, startX: sx, origLeft: ol } = draggingRef.current;
      const dx    = me.clientX - sx;
      const pctDx = (dx / tr.width) * 100;
      const newLeft = Math.max(0, Math.min(ol + pctDx, 95));
      // Convert newLeft% back to a date
      const dayOffset = Math.round((newLeft / 100) * Q2_DAYS);
      const newDesignStart = new Date(Q2_START);
      newDesignStart.setDate(newDesignStart.getDate() + dayOffset);
      // Find newDevStart by adding sizeDays forward
      const barTopic  = topics.find((t) => t.id === id);
      if (!barTopic) return;
      const newDevStart = addWorkingDays(newDesignStart.toISOString().slice(0, 10), SIZES[barTopic.size].days);
      onUpdateDevStartDate(id, newDevStart.toISOString().slice(0, 10));
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [topics, onUpdateDevStartDate]);

  // Month grid lines
  const months = useMemo(() => {
    const result = [];
    const labels = [
      { label: "April", start: new Date("2026-04-01"), end: new Date("2026-04-30") },
      { label: "May",   start: new Date("2026-05-01"), end: new Date("2026-05-31") },
      { label: "June",  start: new Date("2026-06-01"), end: new Date("2026-06-30") },
    ];
    labels.forEach(({ label, start, end }) => {
      const left  = ((start - Q2_START) / 86400000 / Q2_DAYS) * 100;
      const right = (((end - Q2_START) / 86400000 + 1) / Q2_DAYS) * 100;
      result.push({ label, left, width: right - left });
    });
    return result;
  }, []);

  // Unique owners in order
  const ownerIds = useMemo(() => {
    const seen = new Set();
    const list = [];
    topics.forEach((t) => { if (!seen.has(t.ownerId)) { seen.add(t.ownerId); list.push(t.ownerId); }});
    return list;
  }, [topics]);

  return (
    <div>
      <style>{STRIPE_CSS}</style>
      <h2 style={{ color: "#F1F5F9", marginBottom: "4px" }}>Q2 2026 Timeline</h2>
      <p style={{ color: "#64748B", fontSize: "13px", marginBottom: "16px" }}>
        Bars end at the development start date. Drag to reschedule.
      </p>

      {hasOverlaps && (
        <div style={{
          background: "#451A03", border: "1px solid #D29922", borderRadius: "8px",
          padding: "10px 16px", marginBottom: "16px", fontSize: "13px", color: "#FCD34D",
        }}>
          ⚠️ <strong>Scheduling conflicts detected.</strong> Some team members are assigned to overlapping projects simultaneously.
          Concurrent work reduces effective throughput — two overlapping L projects may take ~4 weeks instead of 2.
          Consider staggering start dates to improve flow.
        </div>
      )}

      {/* Month header */}
      <div style={{ position: "relative", height: "24px", marginBottom: "4px" }}>
        {months.map((m) => (
          <div key={m.label} style={{
            position: "absolute", left: `${m.left}%`, width: `${m.width}%`,
            textAlign: "center", fontSize: "11px", color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>{m.label}</div>
        ))}
      </div>

      {/* Track */}
      <div ref={trackRef} style={{ position: "relative", background: "#0F172A", borderRadius: "8px", padding: "8px 0", minHeight: "60px", userSelect: "none" }}>
        {/* Grid lines */}
        {months.map((m) => (
          <div key={m.label} style={{
            position: "absolute", left: `${m.left}%`, top: 0, bottom: 0,
            width: "1px", background: "#1E293B",
          }} />
        ))}

        {/* Today line */}
        {(() => {
          const today = new Date();
          if (today >= Q2_START && today <= Q2_END) {
            const pct = ((today - Q2_START) / 86400000 / Q2_DAYS) * 100;
            return <div style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: "2px", background: "#F59E0B", opacity: 0.7, zIndex: 5 }} />;
          }
        })()}

        {/* Rows by owner */}
        {ownerIds.map((ownerId, rowIdx) => {
          const owner     = members.find((m) => m.id === ownerId);
          const rowBars   = bars.filter((b) => b.ownerId === ownerId);
          const hasConflict = rowBars.some((b) => overlapMap[b.id]);
          return (
            <div key={ownerId} style={{ position: "relative", height: "38px", marginBottom: "6px" }}>
              {/* Row label */}
              <div style={{
                position: "absolute", left: "4px", top: "50%", transform: "translateY(-50%)",
                fontSize: "10px", color: "#475569", fontWeight: 600, zIndex: 10, whiteSpace: "nowrap",
              }}>
                {owner?.name?.split(" ")[0] || "?"}
                {hasConflict && (
                  <span title="This person has overlapping projects" style={{ marginLeft: "3px", cursor: "help" }}>⚠️</span>
                )}
              </div>

              {rowBars.map((bar) => {
                const isOverlap = !!overlapMap[bar.id];
                const baseColor = SIZES[bar.size].color;
                const ownerPct  = bar.ownerPercent || 100;
                const suppPct   = 100 - ownerPct;
                const suppColor = bar.supporter ? TEAM_COLORS[bar.supporter.team] || "#6B7280" : "transparent";

                return (
                  <div
                    key={bar.id}
                    className={isOverlap ? "bar-overlap" : ""}
                    onMouseDown={(e) => onMouseDown(e, bar)}
                    onMouseEnter={(e) => setTooltip({ bar, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                    style={{
                      position: "absolute",
                      left:   `${bar.left}%`,
                      width:  `${bar.width}%`,
                      top:    "4px",
                      height: "28px",
                      borderRadius: "5px",
                      cursor: "grab",
                      overflow: "hidden",
                      display: "flex",
                      zIndex: 3,
                      minWidth: "6px",
                      boxShadow: isOverlap ? "0 0 0 2px #D29922" : "none",
                    }}
                  >
                    {/* Owner segment */}
                    <div style={{
                      flex: ownerPct,
                      background: baseColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "10px", color: "#fff", fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap",
                    }}>
                      {bar.width > 3 ? bar.title.slice(0, 12) : ""}
                    </div>
                    {/* Supporter segment */}
                    {bar.supporterId && suppPct > 0 && (
                      <div style={{ flex: suppPct, background: suppColor, opacity: 0.75 }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
        {Object.entries(SIZES).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#64748B" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: v.color }} />
            {k} ({v.weeks}w)
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#D29922" }}>
          <span>⚠️</span> Overlap / conflict
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top:  tooltip.y - 10,
          background: "#1C2333",
          border: "1px solid #334155",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "12px",
          color: "#F1F5F9",
          zIndex: 9999,
          maxWidth: "260px",
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: "4px" }}>{tooltip.bar.title}</div>
          <div style={{ color: "#94A3B8" }}>
            {tooltip.bar.size} · {SIZES[tooltip.bar.size].hours}<br />
            Design: {fmtDate(tooltip.bar.designStart)} → {fmtDate(tooltip.bar.devStart)}<br />
            📅 dev starts {tooltip.bar.devStartDate}<br />
            Owner: {tooltip.bar.owner?.name} ({tooltip.bar.ownerPercent}%)
            {tooltip.bar.supporter && <><br />Support: {tooltip.bar.supporter.name} ({tooltip.bar.supporterPercent}%)</>}
            {tooltip.bar.status && <><br />Status: {tooltip.bar.status}</>}
          </div>
          {overlapMap[tooltip.bar.id] && (
            <div style={{ marginTop: "6px", color: "#FCD34D", borderTop: "1px solid #334155", paddingTop: "6px" }}>
              ⚠️ Overlaps with: {overlapMap[tooltip.bar.id].map((b) => b.title).join(", ")}<br />
              <span style={{ color: "#94A3B8" }}>Concurrent work reduces effective throughput.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const saved = loadInitialState();

  const [topics,  setTopics]  = useState(saved?.topics  || []);
  const [members, setMembers] = useState(saved?.members || INIT_MEMBERS);
  const [vacation, setVacation] = useState(saved?.vacation || {});
  const [tab, setTab] = useState("topics");
  const [copied, setCopied]   = useState(false);

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, members, vacation }));
    } catch {}
  }, [topics, members, vacation]);

  const addTopic    = (t)  => setTopics((prev) => [...prev, t]);
  const editTopic   = (t)  => setTopics((prev) => prev.map((x) => x.id === t.id ? t : x));
  const deleteTopic = (id) => setTopics((prev) => prev.filter((x) => x.id !== id));
  const updateDevStartDate = (id, date) => setTopics((prev) => prev.map((x) => x.id === id ? { ...x, devStartDate: date } : x));
  const setVac = (memberId, days) => setVacation((prev) => ({ ...prev, [memberId]: days }));

  const shareUrl = () => {
    const state = JSON.stringify({ topics, members, vacation });
    const hash  = btoa(state);
    const url   = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const TABS = [
    { id: "topics",   label: "📋 Topics" },
    { id: "team",     label: "👥 Team" },
    { id: "capacity", label: "📊 Capacity" },
    { id: "timeline", label: "📅 Timeline" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1C2333", borderBottom: "1px solid #1E293B", padding: "0 32px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>🎨</span>
            <span style={{ fontWeight: 700, fontSize: "18px" }}>CareCo Design Planner</span>
            <span style={{ background: "#1D6AC530", color: "#60A5FA", borderRadius: "12px", padding: "2px 10px", fontSize: "11px", fontWeight: 600 }}>Q2 2026</span>
          </div>
          <button onClick={shareUrl} style={{ ...cancelBtnStyle, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
            {copied ? "✅ Copied!" : "🔗 Share"}
          </button>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", gap: "4px" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "10px 16px", fontSize: "14px", fontWeight: 600,
              color: tab === t.id ? "#F1F5F9" : "#64748B",
              borderBottom: tab === t.id ? "2px solid #1D6AC5" : "2px solid transparent",
              transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 32px" }}>
        {tab === "topics"   && <TopicsTab   topics={topics} members={members} onAdd={addTopic} onEdit={editTopic} onDelete={deleteTopic} />}
        {tab === "team"     && <TeamTab     members={members} vacation={vacation} onVacationChange={setVac} />}
        {tab === "capacity" && <CapacityTab topics={topics} members={members} vacation={vacation} />}
        {tab === "timeline" && <TimelineTab topics={topics} members={members} onUpdateDevStartDate={updateDevStartDate} />}
      </div>
    </div>
  );
}
