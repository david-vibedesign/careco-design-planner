import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "careco-planner-v1";

function loadInitialState() {
  try {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const state = JSON.parse(atob(hash));
      if (state?.topics) return state;
    }
  } catch {}
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZES = {
  XS:  { days: 1,  hours: "0–4h",  weeks: 0.2, color: "#059669" },
  S:   { days: 3,  hours: "12h",   weeks: 0.6, color: "#2563EB" },
  M:   { days: 5,  hours: "20h",   weeks: 1,   color: "#D97706" },
  L:   { days: 10, hours: "40h",   weeks: 2,   color: "#EA580C" },
  XL:  { days: 20, hours: "80h+",  weeks: 4,   color: "#DC2626" },
  XXL: { days: 40, hours: "160h+", weeks: 8,   color: "#7C3AED" },
};

const TEAMS = ["CareCo", "PHNX", "NEMO", "KITN"];

const TEAM_COLORS = {
  CareCo: "#F59E0B",
  PHNX:   "#A855F7",
  NEMO:   "#3B82F6",
  KITN:   "#10B981",
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

const holidaySet = new Set(NL_HOLIDAYS.map((h) => h.date));

const Q2_START = new Date(2026, 3, 1);
const Q2_END   = new Date(2026, 5, 30);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const isWorkingDay = (d) => {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !holidaySet.has(d.toISOString().split("T")[0]);
};

const getWorkingDaysBetween = (start, end) => {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (cur <= e) {
    if (isWorkingDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

const addWorkingDays = (startDateStr, workingDays) => {
  const d = new Date(startDateStr);
  d.setHours(0, 0, 0, 0);
  let remaining = workingDays - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
};

const fmt = (d) => d.toISOString().split("T")[0];

const Q2_WORKING_DAYS = getWorkingDaysBetween(Q2_START, Q2_END);

// ─── Initial state ────────────────────────────────────────────────────────────

const INIT_MEMBERS = [
  { id: "m1", name: "Designer 1",    role: "Senior Product Designer",    color: "#A855F7" },
  { id: "m2", name: "Designer 2",    role: "Senior Product Designer",    color: "#3B82F6" },
  { id: "m3", name: "Researcher",    role: "User Researcher",            color: "#10B981" },
  { id: "m4", name: "David Brandau", role: "Senior Design Team Manager", color: "#F97316" },
];

const EMPTY_FORM = {
  title: "", description: "", team: "CareCo", type: "discovery", size: "M",
  priority: false, ownerId: "", ownerPercent: 100,
  supporter1Id: "", supporter1Percent: 0,
  supporter2Id: "", supporter2Percent: 0,
  startDate: "2026-04-01",
};

// ─── Theme ────────────────────────────────────────────────────────────────────

// C references CSS custom properties — values update automatically when
// data-theme attribute changes on the root element.
const C = {
  bg:         "var(--c-bg)",
  surface:    "var(--c-surface)",
  surfaceAlt: "var(--c-surface-alt)",
  border:     "var(--c-border)",
  text:       "var(--c-text)",
  muted:      "var(--c-muted)",
  dim:        "var(--c-dim)",
  green:      "var(--c-green)",
  red:        "var(--c-red)",
};

const THEME_CSS = `
  /* ── CSS custom properties for both themes ── */
  :root, [data-theme="dark"] {
    --c-bg:          #0D1117;
    --c-surface:     #161B22;
    --c-surface-alt: #21262D;
    --c-border:      #30363D;
    --c-text:        #E6EDF3;
    --c-muted:       #8B949E;
    --c-dim:         #484F58;
    --c-green:       #238636;
    --c-red:         #F85149;
    color-scheme: dark;
  }
  [data-theme="light"] {
    --c-bg:          #F6F8FA;
    --c-surface:     #FFFFFF;
    --c-surface-alt: #EFF1F3;
    --c-border:      #D0D7DE;
    --c-text:        #1F2328;
    --c-muted:       #57606A;
    --c-dim:         #9198A1;
    --c-green:       #1A7F37;
    --c-red:         #CF222E;
    color-scheme: light;
  }

  /* ── Smooth theme transition on all elements ── */
  *, *::before, *::after {
    transition:
      background-color 0.28s ease,
      border-color     0.28s ease,
      color            0.28s ease,
      box-shadow       0.28s ease;
  }
  /* Don't animate layout/transform properties */
  *, *::before, *::after {
    transition-property: background-color, border-color, color, box-shadow;
  }

  /* ── Toggle button ── */
  .theme-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid var(--c-border);
    background: var(--c-surface-alt);
    cursor: pointer;
    font-size: 13px;
    color: var(--c-muted);
    transition: border-color 0.2s, box-shadow 0.2s, background-color 0.28s;
    user-select: none;
    position: relative;
    overflow: hidden;
  }
  .theme-toggle:hover {
    border-color: var(--c-muted);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-muted) 15%, transparent);
  }
  .theme-toggle:active {
    transform: scale(0.95);
  }

  /* ── Icon animation ── */
  @keyframes icon-exit {
    0%   { transform: rotate(0deg)   scale(1);   opacity: 1; }
    100% { transform: rotate(-90deg) scale(0);   opacity: 0; }
  }
  @keyframes icon-enter {
    0%   { transform: rotate(90deg)  scale(0);   opacity: 0; }
    60%  { transform: rotate(-8deg)  scale(1.2); opacity: 1; }
    80%  { transform: rotate(5deg)   scale(0.95);}
    100% { transform: rotate(0deg)   scale(1);   opacity: 1; }
  }
  .icon-exiting { animation: icon-exit  0.2s ease forwards; }
  .icon-entering { animation: icon-enter 0.35s ease forwards; }

  /* ── Ripple flash on theme switch ── */
  @keyframes theme-ripple {
    0%   { transform: scale(0);   opacity: 0.35; }
    100% { transform: scale(40);  opacity: 0; }
  }
  .theme-ripple {
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--c-text);
    pointer-events: none;
    animation: theme-ripple 0.55s ease-out forwards;
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 7px; height: 7px; }
  ::-webkit-scrollbar-track { background: var(--c-bg); }
  ::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--c-dim); }

  /* ── Input/Select/Textarea color-scheme ── */
  input, select, textarea { color-scheme: inherit; }
`;

// ─── Style helpers (use CSS vars via C) ───────────────────────────────────────

const card = {
  background:   C.surface,
  border:       `1px solid ${C.border}`,
  borderRadius: 8,
  padding:      16,
  marginBottom: 10,
};

const inp = {
  background:  C.bg,
  border:      `1px solid ${C.border}`,
  borderRadius: 6,
  color:       C.text,
  padding:     "6px 10px",
  fontSize:    13,
  width:       "100%",
  boxSizing:   "border-box",
  outline:     "none",
};

const btn = (bg = C.green, color = "#fff") => ({
  background: bg, color,
  border: "none", borderRadius: 6,
  padding: "7px 16px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
});

const ghost = {
  background:   "transparent",
  color:        C.muted,
  border:       `1px solid ${C.border}`,
  borderRadius: 6,
  padding:      "6px 12px",
  fontSize:     12,
  cursor:       "pointer",
};

const lbl = { fontSize: 12, color: C.muted, marginBottom: 4, display: "block" };

// ─── Badge ────────────────────────────────────────────────────────────────────

const Badge = ({ label, color, small }) => (
  <span style={{
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
    border:     `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    borderRadius: 4,
    padding:    small ? "1px 5px" : "2px 7px",
    fontSize:   small ? 10 : 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
  }}>{label}</span>
);

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

function ThemeToggle({ isDark, onToggle }) {
  const [phase, setPhase] = useState("idle"); // idle | exiting | entering
  const [ripple, setRipple] = useState(null);
  const btnRef = useRef(null);

  const handleClick = (e) => {
    // Create ripple at click position
    const rect = btnRef.current.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });

    // Phase 1: exit current icon
    setPhase("exiting");
    setTimeout(() => {
      onToggle();         // swap theme
      setPhase("entering");
    }, 200);
    setTimeout(() => setPhase("idle"), 600);
    setTimeout(() => setRipple(null), 600);
  };

  const icon = isDark ? "☀️" : "🌙";

  return (
    <button
      ref={btnRef}
      className="theme-toggle"
      onClick={handleClick}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {ripple && (
        <span
          key={ripple.key}
          className="theme-ripple"
          style={{ left: ripple.x - 10, top: ripple.y - 10 }}
        />
      )}
      <span
        className={
          phase === "exiting"  ? "icon-exiting"  :
          phase === "entering" ? "icon-entering" : ""
        }
        style={{ display: "inline-block", fontSize: 15, lineHeight: 1 }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 12 }}>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

// ─── Clickable title style ────────────────────────────────────────────────────

const clickableTitle = {
  cursor: "pointer",
  textDecoration: "none",
  borderBottom: "1px dashed transparent",
  transition: "border-color 0.15s, color 0.15s",
};

// ─── TopicsTab ────────────────────────────────────────────────────────────────

function TopicsTab({ topics, members, onAdd, onEdit, onDelete }) {
  const [filter, setFilter] = useState("all");

  const filters = ["all", "⭐ priority", ...TEAMS];
  const filtered = topics.filter((t) => {
    if (filter === "all") return true;
    if (filter === "⭐ priority") return t.priority;
    return t.team === filter;
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...ghost,
              background:  filter === f ? C.surfaceAlt : "transparent",
              color:       filter === f ? C.text       : C.muted,
              borderColor: filter === f ? C.dim        : C.border,
              padding: "4px 10px",
            }}>{f}</button>
          ))}
        </div>
        <button onClick={onAdd} style={btn()}>+ Add Topic</button>
      </div>

      {/* Summary row */}
      {topics.length > 0 && (
        <div style={{ ...card, display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14, padding: "10px 16px" }}>
          {Object.keys(SIZES).map((sz) => {
            const count = topics.filter((t) => t.size === sz).length;
            if (!count) return null;
            return (
              <div key={sz} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Badge label={sz} color={SIZES[sz].color} />
                <span style={{ fontSize: 12, color: C.muted }}>×{count}</span>
              </div>
            );
          })}
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>
            {filtered.length} topic{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Topics */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: C.dim, padding: "48px 0", fontSize: 13 }}>
          {topics.length === 0 ? "No topics yet — add one to kick off Q2 planning." : "No topics match this filter."}
        </div>
      )}
      {filtered.map((t) => {
        const owner      = members.find((m) => m.id === t.ownerId);
        const supporter1 = members.find((m) => m.id === t.supporter1Id);
        const supporter2 = members.find((m) => m.id === t.supporter2Id);
        const sz         = SIZES[t.size];
        const hasSupp    = !!(t.supporter1Id || t.supporter2Id);
        const ownerDays  = hasSupp ? (sz.days * t.ownerPercent / 100) : sz.days;
        const supp1Days  = supporter1 ? sz.days * t.supporter1Percent / 100 : 0;
        const supp2Days  = supporter2 ? sz.days * t.supporter2Percent / 100 : 0;
        return (
          <div key={t.id} style={{
            ...card,
            borderLeft: `3px solid ${TEAM_COLORS[t.team] || C.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title row */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
                  {t.priority && <span title="High priority" style={{ fontSize: 13 }}>⭐</span>}
                  <span
                    onClick={() => onEdit(t)}
                    title="Click to edit"
                    style={{ ...clickableTitle, fontWeight: 600, fontSize: 14, color: C.text }}
                    onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                    onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = C.text; }}
                  >{t.title}</span>
                  <Badge label={t.team} color={TEAM_COLORS[t.team]} />
                  <Badge label={t.type} color={C.dim} />
                </div>
                {/* Description */}
                {t.description && (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 7, fontStyle: "italic" }}>
                    {t.description}
                  </div>
                )}
                {/* Meta row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge label={`${t.size} · ${sz.hours} · ${sz.days}d`} color={sz.color} />
                  {owner ? (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      <span style={{ color: owner.color }}>●</span>{" "}
                      {owner.name}
                      {hasSupp ? ` (${t.ownerPercent}% · ${ownerDays.toFixed(1)}d)` : ` (${ownerDays.toFixed(1)}d)`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.dim }}>— Unassigned —</span>
                  )}
                  {supporter1 && (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      +{" "}<span style={{ color: supporter1.color }}>●</span>{" "}
                      {supporter1.name} ({t.supporter1Percent}% · {supp1Days.toFixed(1)}d)
                    </span>
                  )}
                  {supporter2 && (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      +{" "}<span style={{ color: supporter2.color }}>●</span>{" "}
                      {supporter2.name} ({t.supporter2Percent}% · {supp2Days.toFixed(1)}d)
                    </span>
                  )}
                  {t.startDate && (
                    <span style={{ fontSize: 12, color: C.dim }}>
                      📅 {t.startDate}
                      {" → "}
                      {fmt(addWorkingDays(t.startDate, sz.days))}
                    </span>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => onEdit(t)} style={{ ...ghost, padding: "4px 10px" }}>Edit</button>
                <button onClick={() => onDelete(t.id)} style={{ ...ghost, padding: "4px 10px", color: C.red, borderColor: `color-mix(in srgb, ${C.red} 40%, transparent)` }}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TeamTab ──────────────────────────────────────────────────────────────────

function TeamTab({ members, setMembers, vacation, setVacation }) {
  const updateName = (id, name) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, name } : m)));
  const updateVac = (id, val) =>
    setVacation((v) => ({ ...v, [id]: Math.max(0, Math.min(Q2_WORKING_DAYS, parseInt(val) || 0)) }));

  return (
    <div>
      {/* Q2 summary */}
      <div style={{ ...card, background: C.bg, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          Q2 2026 total working days (NL 🇳🇱):{" "}
          <strong style={{ color: C.text }}>{Q2_WORKING_DAYS} days</strong>
          <span style={{ marginLeft: 12, color: C.dim }}>
            April 1 – June 30 · excluding {NL_HOLIDAYS.length} public holidays
          </span>
        </div>
      </div>

      {/* Members */}
      {members.map((m) => {
        const avail = Q2_WORKING_DAYS - (vacation[m.id] || 0);
        return (
          <div key={m.id} style={{ ...card }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, width: "100%" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{m.name}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{m.role}</span>
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={lbl}>Display Name</label>
                <input style={inp} value={m.name} onChange={(e) => updateName(m.id, e.target.value)} />
              </div>
              <div style={{ width: 120 }}>
                <label style={lbl}>Vacation Days (Q2)</label>
                <input
                  type="number" min={0} max={Q2_WORKING_DAYS} style={inp}
                  value={vacation[m.id] || 0}
                  onChange={(e) => updateVac(m.id, e.target.value)}
                />
              </div>
              <div style={{ fontSize: 13, color: C.muted, paddingBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 600, fontSize: 18 }}>{avail}</span>
                <span style={{ marginLeft: 4 }}>available days</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Holidays list */}
      <div style={{ ...card, background: C.bg, marginTop: 6 }}>
        <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 10 }}>
          🇳🇱 Netherlands Public Holidays Q2 2026
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {NL_HOLIDAYS.map((h) => (
            <span key={h.date} style={{
              fontSize: 12, color: C.muted,
              background: C.surface, padding: "4px 10px",
              borderRadius: 4, border: `1px solid ${C.border}`,
            }}>
              {h.date} · {h.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CapacityTab ──────────────────────────────────────────────────────────────

function CapacityTab({ capacities, topics, members, onEdit }) {
  return (
    <div>
      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
        {capacities.map((c) => {
          const pct  = c.availableDays > 0 ? Math.min(100, (c.allocatedDays / c.availableDays) * 100) : 0;
          const over = c.allocatedDays > c.availableDays;
          const barColor = over ? C.red : pct > 85 ? "#D29922" : c.color;
          return (
            <div key={c.id} style={{ ...card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{c.role}</div>

              {/* Bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 5 }}>
                  <span>Allocated</span>
                  <span style={{ color: over ? C.red : C.text, fontWeight: 600 }}>
                    {c.allocatedDays.toFixed(1)} / {c.availableDays}d
                  </span>
                </div>
                <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${pct}%`, background: barColor,
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.dim }}>Q2: {c.availableDays}d available</span>
                <span style={{ color: over ? C.red : "#3FB950", fontWeight: 600 }}>
                  {over
                    ? `${(c.allocatedDays - c.availableDays).toFixed(1)}d over`
                    : `${c.remaining.toFixed(1)}d free`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-person topic breakdown */}
      {capacities.map((c) => {
        const myTopics = topics.filter((t) => t.ownerId === c.id || t.supporter1Id === c.id || t.supporter2Id === c.id);
        if (!myTopics.length) return null;
        return (
          <div key={c.id} style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, color: C.text }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
              {c.name}'s Topics
            </div>
            {myTopics.map((t) => {
              const isOwner = t.ownerId === c.id;
              const isSupp1 = t.supporter1Id === c.id;
              const hasSupp = !!(t.supporter1Id || t.supporter2Id);
              const pct     = isOwner
                ? (hasSupp ? t.ownerPercent / 100 : 1)
                : isSupp1
                  ? t.supporter1Percent / 100
                  : t.supporter2Percent / 100;
              const days    = SIZES[t.size].days * pct;
              return (
                <div key={t.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
                }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    {t.priority && <span style={{ color: "#D29922" }}>⭐</span>}
                    <span
                      onClick={() => onEdit(t)}
                      title="Click to edit"
                      style={{ ...clickableTitle, color: C.text }}
                      onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                      onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = C.text; }}
                    >{t.title}</span>
                    <Badge label={t.team} color={TEAM_COLORS[t.team]} small />
                    <Badge label={t.size} color={SIZES[t.size].color} small />
                  </div>
                  <div style={{ color: C.muted, flexShrink: 0, paddingLeft: 12 }}>
                    <span style={{ color: isOwner ? C.text : C.muted }}>
                      {isOwner ? "Owner" : "Supporter"} · {days.toFixed(1)}d
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelineTab ──────────────────────────────────────────────────────────────

function TimelineTab({ timelineTopics, members, onUpdateTopicDate, onEdit }) {
  const Q2_CAL_DAYS  = 91;
  const trackAreaRef = useRef(null);
  const dragRef      = useRef(null);
  const latestDrag   = useRef(null);
  const [dragState, setDragState] = useState(null);

  const months = [
    { label: "April 2026", days: 30 },
    { label: "May 2026",   days: 31 },
    { label: "June 2026",  days: 30 },
  ];

  const dayOffset = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const s = new Date(Q2_START);
    s.setHours(0, 0, 0, 0);
    return Math.floor((d - s) / 86400000);
  };

  const dateFromOffset = (rawOffset) => {
    const clamped = Math.max(0, Math.min(Q2_CAL_DAYS - 1, Math.round(rawOffset)));
    const d = new Date(Q2_START);
    d.setDate(d.getDate() + clamped);
    return fmt(d);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = dayOffset(fmt(today));
  const showToday = todayOffset >= 0 && todayOffset <= Q2_CAL_DAYS;

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragRef.current || !trackAreaRef.current) return;
      const { topicId, originX, originDate } = dragRef.current;
      const trackW     = trackAreaRef.current.getBoundingClientRect().width;
      const pixPerDay  = trackW / Q2_CAL_DAYS;
      const deltaDays  = (e.clientX - originX) / pixPerDay;
      const newDate    = dateFromOffset(dayOffset(originDate) + deltaDays);
      latestDrag.current = { topicId, newDate };
      setDragState({ topicId, newDate });
    };

    const onMouseUp = () => {
      if (latestDrag.current) {
        onUpdateTopicDate(latestDrag.current.topicId, latestDrag.current.newDate);
        latestDrag.current = null;
      }
      dragRef.current = null;
      setDragState(null);
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };
  }, [onUpdateTopicDate]);

  const handleBarMouseDown = (e, topic) => {
    e.preventDefault();
    dragRef.current = { topicId: topic.id, originX: e.clientX, originDate: topic.startDate };
    setDragState({ topicId: topic.id, newDate: topic.startDate });
    document.body.style.cursor = "grabbing";
  };

  if (!timelineTopics.length) {
    return (
      <div style={{ textAlign: "center", color: C.dim, padding: "60px 0", fontSize: 13 }}>
        Add topics with start dates to see them on the timeline.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", userSelect: "none" }}>
      <div style={{ minWidth: 860 }}>

        {/* Month header row */}
        <div style={{ display: "flex" }}>
          <div style={{ width: 200, flexShrink: 0 }} />
          <div ref={trackAreaRef} style={{ flex: 1, display: "flex" }}>
            {months.map((m, i) => (
              <div key={i} style={{
                width: `${(m.days / Q2_CAL_DAYS) * 100}%`,
                padding: "5px 8px",
                fontSize: 11, color: C.muted, fontWeight: 600,
                borderLeft: `1px solid ${C.border}`,
                background: C.bg,
                boxSizing: "border-box",
              }}>{m.label}</div>
            ))}
          </div>
        </div>

        {/* Topic rows */}
        {timelineTopics.map((t) => {
          const isDragging     = dragState?.topicId === t.id;
          const effectiveStart = isDragging ? dragState.newDate : t.startDate;
          const effectiveEnd   = addWorkingDays(effectiveStart, SIZES[t.size]?.days || 5);
          const startOff       = dayOffset(effectiveStart);
          const dur            = (effectiveEnd - new Date(effectiveStart)) / 86400000 + 1;
          const left           = Math.max(0, startOff) / Q2_CAL_DAYS * 100;
          const width          = Math.min(dur, Q2_CAL_DAYS - Math.max(0, startOff)) / Q2_CAL_DAYS * 100;
          const owner          = members.find((x) => x.id === t.ownerId);
          const supp1          = t.supporter1Id ? members.find((x) => x.id === t.supporter1Id) : null;
          const supp2          = t.supporter2Id ? members.find((x) => x.id === t.supporter2Id) : null;
          const hasSupp        = !!(t.supporter1Id || t.supporter2Id);
          const ownerFlex      = hasSupp ? t.ownerPercent      : 100;
          const supp1Flex      = hasSupp ? t.supporter1Percent : 0;
          const supp2Flex      = hasSupp ? t.supporter2Percent : 0;

          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 5, minHeight: 38 }}>

              {/* Row label */}
              <div style={{ width: 200, flexShrink: 0, paddingRight: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.priority ? "⭐ " : ""}
                  <span
                    onClick={() => onEdit(t)}
                    title="Click to edit"
                    style={{ ...clickableTitle, fontWeight: 500, fontSize: 12 }}
                    onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                    onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = ""; }}
                  >{t.title}</span>
                </div>
                <div style={{ fontSize: 10, color: C.dim, display: "flex", gap: 5, alignItems: "center", marginTop: 1, flexWrap: "wrap" }}>
                  <span>{t.size}</span>
                  <span>·</span>
                  {owner
                    ? <><span style={{ color: owner.color }}>●</span><span>{owner.name}</span></>
                    : <span style={{ color: C.dim }}>Unassigned</span>
                  }
                  {supp1 && <><span style={{ color: supp1.color }}>●</span><span>{supp1.name} ({t.supporter1Percent}%)</span></>}
                  {supp2 && <><span style={{ color: supp2.color }}>●</span><span>{supp2.name} ({t.supporter2Percent}%)</span></>}
                </div>
              </div>

              {/* Bar track */}
              <div style={{
                flex: 1, position: "relative", height: 30,
                background: C.bg, borderRadius: 4,
                border: `1px solid ${C.border}`,
              }}>
                {/* Month dividers */}
                {[30, 61].map((d) => (
                  <div key={d} style={{
                    position: "absolute", left: `${d / Q2_CAL_DAYS * 100}%`,
                    top: 0, bottom: 0, width: 1, background: C.border,
                    pointerEvents: "none",
                  }} />
                ))}

                {/* Today line */}
                {showToday && (
                  <div style={{
                    position: "absolute", left: `${todayOffset / Q2_CAL_DAYS * 100}%`,
                    top: -4, bottom: -4, width: 2, background: C.red,
                    borderRadius: 1, zIndex: 3, pointerEvents: "none",
                  }} />
                )}

                {/* Draggable bar */}
                {startOff < Q2_CAL_DAYS && startOff + dur > 0 && (
                  <div
                    onMouseDown={(e) => handleBarMouseDown(e, t)}
                    title={`${t.title}\n${effectiveStart} → ${fmt(effectiveEnd)}\nDrag to reschedule`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${Math.max(width, 0.8)}%`,
                      height: "100%",
                      borderRadius: 4,
                      display: "flex",
                      overflow: "hidden",
                      opacity: isDragging ? 0.8 : 0.9,
                      cursor: isDragging ? "grabbing" : "grab",
                      boxSizing: "border-box",
                      boxShadow: isDragging
                        ? `0 0 0 2px ${owner?.color || TEAM_COLORS[t.team] || "#fff"}, 0 4px 12px rgba(0,0,0,0.4)`
                        : "none",
                    }}
                  >
                    {/* Owner segment */}
                    <div style={{
                      flex: ownerFlex,
                      background: owner?.color || TEAM_COLORS[t.team],
                      display: "flex", alignItems: "center", paddingLeft: 6,
                      overflow: "hidden", minWidth: 0,
                    }}>
                      <span style={{ fontSize: 10, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {width > 7 ? `${effectiveStart} → ${fmt(effectiveEnd)}` : ""}
                      </span>
                    </div>

                    {/* Supporter 1 segment */}
                    {supp1 && supp1Flex > 0 && (
                      <div style={{
                        flex: supp1Flex,
                        background: supp1.color,
                        minWidth: supp1Flex >= 15 ? 4 : 0,
                        opacity: 0.9,
                      }} />
                    )}

                    {/* Supporter 2 segment */}
                    {supp2 && supp2Flex > 0 && (
                      <div style={{
                        flex: supp2Flex,
                        background: supp2.color,
                        minWidth: supp2Flex >= 15 ? 4 : 0,
                        opacity: 0.75,
                      }} />
                    )}
                  </div>
                )}

                {/* Drag tooltip */}
                {isDragging && (
                  <div style={{
                    position: "absolute",
                    left: `${Math.min(left, 82)}%`,
                    bottom: "calc(100% + 4px)",
                    background: C.surfaceAlt,
                    border: `1px solid ${owner?.color || C.border}`,
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 11, color: C.text,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 20,
                  }}>
                    📅 {effectiveStart}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: m.color }} />
              {m.name}
            </div>
          ))}
          {showToday && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
              <div style={{ width: 2, height: 12, background: C.red, borderRadius: 1 }} />
              Today
            </div>
          )}
          <div style={{ marginLeft: "auto", fontSize: 11, color: C.dim, fontStyle: "italic" }}>
            ← drag bars to reschedule
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TopicFormModal ───────────────────────────────────────────────────────────

function TopicFormModal({ form, setForm, members, onSave, onClose, isEdit }) {
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const hasSupp1   = !!form.supporter1Id;
  const hasSupp2   = !!form.supporter2Id;
  const hasAnySupp = hasSupp1 || hasSupp2;
  const totalPct   = form.ownerPercent + (hasSupp1 ? form.supporter1Percent : 0) + (hasSupp2 ? form.supporter2Percent : 0);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 24,
        width: "100%", maxWidth: 520,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: C.text }}>
          {isEdit ? "Edit Topic" : "New Topic"}
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Title *</label>
          <input
            style={inp} value={form.title} autoFocus
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. PHNX appointment flow redesign"
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Description (optional)</label>
          <textarea
            style={{ ...inp, height: 64, resize: "vertical", lineHeight: 1.5 }}
            value={form.description || ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Goals, context, or notes…"
          />
        </div>

        {/* Team + Type */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Team</label>
            <select style={inp} value={form.team} onChange={(e) => set("team", e.target.value)}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Type</label>
            <select style={inp} value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="discovery">Discovery</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
        </div>

        {/* Size + Start date */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>T-shirt Size</label>
            <select style={inp} value={form.size} onChange={(e) => set("size", e.target.value)}>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>{k} – {v.hours} · ~{v.days}d · {v.weeks}wk</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Start Date</label>
            <input
              type="date" style={inp}
              value={form.startDate}
              min="2026-04-01" max="2026-06-30"
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
        </div>

        {/* Est end date preview */}
        {form.startDate && (
          <div style={{ marginBottom: 14, fontSize: 12, color: C.muted }}>
            Estimated end:{" "}
            <strong style={{ color: C.text }}>
              {fmt(addWorkingDays(form.startDate, SIZES[form.size].days))}
            </strong>
            {" "}({SIZES[form.size].days} working days)
          </div>
        )}

        {/* Priority */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox" checked={form.priority}
              onChange={(e) => set("priority", e.target.checked)}
              style={{ accentColor: "#D29922", width: 14, height: 14 }}
            />
            <span>⭐ Mark as High Priority</span>
          </label>
        </div>

        {/* Owner */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Owner</label>
            <select style={inp} value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              <option value="">— Unassigned —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {hasAnySupp && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Owner %</label>
              <input
                type="number" min={0} max={100} style={inp}
                value={form.ownerPercent}
                onChange={(e) => set("ownerPercent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
          )}
        </div>

        {/* Supporter 1 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Supporter 1 (optional)</label>
            <select
              style={inp} value={form.supporter1Id}
              onChange={(e) => {
                const val = e.target.value;
                set("supporter1Id", val);
                if (val && !form.supporter2Id) { set("ownerPercent", 50); set("supporter1Percent", 50); set("supporter2Percent", 0); }
                else if (!val) { set("supporter1Percent", 0); }
              }}
            >
              <option value="">— None —</option>
              {members.filter((m) => m.id !== form.ownerId && m.id !== form.supporter2Id).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {hasSupp1 && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Supporter 1 %</label>
              <input
                type="number" min={0} max={100} style={inp}
                value={form.supporter1Percent}
                onChange={(e) => set("supporter1Percent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
          )}
        </div>

        {/* Supporter 2 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Supporter 2 (optional)</label>
            <select
              style={inp} value={form.supporter2Id}
              onChange={(e) => {
                const val = e.target.value;
                set("supporter2Id", val);
                if (val && !form.supporter1Id) { set("ownerPercent", 50); set("supporter2Percent", 50); set("supporter1Percent", 0); }
                else if (val && form.supporter1Id) { set("ownerPercent", 34); set("supporter1Percent", 33); set("supporter2Percent", 33); }
                else if (!val) { set("supporter2Percent", 0); }
              }}
            >
              <option value="">— None —</option>
              {members.filter((m) => m.id !== form.ownerId && m.id !== form.supporter1Id).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {hasSupp2 && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Supporter 2 %</label>
              <input
                type="number" min={0} max={100} style={inp}
                value={form.supporter2Percent}
                onChange={(e) => set("supporter2Percent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
          )}
        </div>

        {/* % warning */}
        {hasAnySupp && totalPct !== 100 && (
          <div style={{ fontSize: 12, color: "#D29922", marginBottom: 12 }}>
            ⚠ Percentages should total 100% (currently {totalPct}%)
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <button onClick={onClose} style={{ ...ghost, padding: "7px 16px" }}>Cancel</button>
          <button
            onClick={onSave}
            style={{ ...btn(), opacity: form.title.trim() ? 1 : 0.4, cursor: form.title.trim() ? "pointer" : "default" }}
            disabled={!form.title.trim()}
          >
            {isEdit ? "Save Changes" : "Add Topic"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,     setTab]     = useState("topics");
  const [copied,  setCopied]  = useState(false);
  const [isDark,  setIsDark]  = useState(true);

  const [_init]    = useState(() => loadInitialState());
  const [members,  setMembers]  = useState(_init?.members  || INIT_MEMBERS);
  const [vacation, setVacation] = useState(_init?.vacation || { m1: 0, m2: 0, m3: 0, m4: 0 });
  const [topics,   setTopics]   = useState(_init?.topics   || []);

  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, members, vacation }));
    } catch {}
  }, [topics, members, vacation]);

  // Persist theme preference
  useEffect(() => {
    try { localStorage.setItem("careco-theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark]);

  // Load theme preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("careco-theme");
      if (saved === "light") setIsDark(false);
    } catch {}
  }, []);

  const handleShare = useCallback(() => {
    const encoded = btoa(JSON.stringify({ topics, members, vacation }));
    const url = `${window.location.href.split("#")[0]}#${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => { window.location.hash = encoded; });
  }, [topics, members, vacation]);

  const openAdd  = () => { setForm({ ...EMPTY_FORM }); setEditId(null); setShowForm(true); };
  const openEdit = (t) => { setForm({ ...t }); setEditId(t.id); setShowForm(true); };

  const saveTopic = () => {
    if (!form.title.trim()) return;
    if (editId) {
      setTopics((ts) => ts.map((t) => (t.id === editId ? { ...form, id: editId } : t)));
    } else {
      setTopics((ts) => [...ts, { ...form, id: Date.now().toString() }]);
    }
    setShowForm(false);
  };

  const deleteTopic = (id) => setTopics((ts) => ts.filter((t) => t.id !== id));

  const updateTopicDate = useCallback((id, newDate) => {
    setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, startDate: newDate } : t)));
  }, []);

  // ── Capacity calculations ──
  const capacities = useMemo(() => {
    return members.map((m) => {
      const availableDays = Q2_WORKING_DAYS - (vacation[m.id] || 0);
      const allocatedDays = topics.reduce((sum, t) => {
        const sd = SIZES[t.size]?.days || 0;
        const hasSupp = !!(t.supporter1Id || t.supporter2Id);
        if (t.ownerId === m.id)       return sum + sd * (hasSupp ? t.ownerPercent / 100 : 1);
        if (t.supporter1Id === m.id)  return sum + sd * (t.supporter1Percent / 100);
        if (t.supporter2Id === m.id)  return sum + sd * (t.supporter2Percent / 100);
        return sum;
      }, 0);
      return { ...m, availableDays, allocatedDays, remaining: availableDays - allocatedDays };
    });
  }, [members, vacation, topics]);

  // ── Timeline data ──
  const timelineTopics = useMemo(() => {
    return topics
      .filter((t) => t.startDate)
      .map((t) => ({ ...t, endObj: addWorkingDays(t.startDate, SIZES[t.size]?.days || 5) }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [topics]);

  const TABS = ["topics", "team", "capacity", "timeline"];

  return (
    <div data-theme={isDark ? "dark" : "light"} style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: C.bg, minHeight: "100vh", color: C.text,
    }}>
      {/* Inject CSS custom properties + animations */}
      <style>{THEME_CSS}</style>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px", color: C.text }}>CareCo Design Planner</span>
          <span style={{ fontSize: 12, color: C.dim, marginLeft: 2 }}>Q2 2026</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {["PHNX", "NEMO", "KITN"].map((t) => (
              <Badge key={t} label={t} color={TEAM_COLORS[t]} small />
            ))}

            {/* Theme toggle */}
            <ThemeToggle isDark={isDark} onToggle={() => setIsDark((d) => !d)} />

            {/* Share */}
            <button
              onClick={handleShare}
              title="Copy a shareable link with your full plan encoded in the URL"
              style={{
                ...btn(copied ? C.green : C.surfaceAlt, copied ? "#fff" : C.muted),
                border: `1px solid ${copied ? C.green : C.border}`,
                padding: "5px 12px", fontSize: 12,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {copied ? "✓ Link copied!" : "🔗 Share plan"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...ghost,
              background:   tab === t ? C.surfaceAlt : "transparent",
              color:        tab === t ? C.text       : C.muted,
              borderColor:  tab === t ? C.dim        : "transparent",
              padding: "5px 14px", fontSize: 13, fontWeight: 500,
              textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
        {tab === "topics"   && <TopicsTab   topics={topics} members={members} onAdd={openAdd} onEdit={openEdit} onDelete={deleteTopic} />}
        {tab === "team"     && <TeamTab     members={members} setMembers={setMembers} vacation={vacation} setVacation={setVacation} />}
        {tab === "capacity" && <CapacityTab capacities={capacities} topics={topics} members={members} onEdit={openEdit} />}
        {tab === "timeline" && <TimelineTab timelineTopics={timelineTopics} members={members} onUpdateTopicDate={updateTopicDate} onEdit={openEdit} />}
      </div>

      {/* Modal */}
      {showForm && (
        <TopicFormModal
          form={form} setForm={setForm} members={members}
          onSave={saveTopic} onClose={() => setShowForm(false)}
          isEdit={!!editId}
        />
      )}
    </div>
  );
}
