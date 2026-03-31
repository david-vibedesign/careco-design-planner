import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "careco-planner-v1";

function loadInitialState() {
  // 1. Shared URL hash takes priority (colleague opened a share link)
  try {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const state = JSON.parse(atob(hash));
      if (state?.topics) return state;
    }
  } catch {}
  // 2. Fall back to localStorage (own saved session)
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZES = {
  XS: { days: 1,  hours: "0–4h",  weeks: 0.2, color: "#059669" },
  S:  { days: 3,  hours: "12h",   weeks: 0.6, color: "#2563EB" },
  M:  { days: 5,  hours: "20h",   weeks: 1,   color: "#D97706" },
  L:  { days: 10, hours: "40h",   weeks: 2,   color: "#EA580C" },
  XL: { days: 20, hours: "80h+",  weeks: 4,   color: "#DC2626" },
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

const Q2_START = new Date(2026, 3, 1);  // April 1
const Q2_END   = new Date(2026, 5, 30); // June 30

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

// Returns the last working day after `workingDays` days starting from startDate
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

const Q2_WORKING_DAYS = getWorkingDaysBetween(Q2_START, Q2_END); // 60 days

// ─── Initial state ────────────────────────────────────────────────────────────

const INIT_MEMBERS = [
  { id: "m1", name: "Designer 1",    role: "Senior Product Designer",   color: "#A855F7" },
  { id: "m2", name: "Designer 2",    role: "Senior Product Designer",   color: "#3B82F6" },
  { id: "m3", name: "Researcher",    role: "User Researcher",           color: "#10B981" },
  { id: "m4", name: "David Brandau", role: "Senior Design Team Manager",color: "#F97316" },
];

const EMPTY_FORM = {
  title: "", team: "CareCo", type: "discovery", size: "M",
  priority: false, ownerId: "m1", ownerPercent: 100,
  supporterId: "", supporterPercent: 0, startDate: "2026-04-01",
};

// ─── Micro styles ─────────────────────────────────────────────────────────────

const C = {
  bg:      "#0D1117",
  surface: "#161B22",
  border:  "#30363D",
  text:    "#E6EDF3",
  muted:   "#8B949E",
  dim:     "#484F58",
};

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 16,
  marginBottom: 10,
};

const inp = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  padding: "6px 10px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const btn = (bg = "#238636", color = "#fff") => ({
  background: bg, color,
  border: "none", borderRadius: 6,
  padding: "7px 16px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
});

const ghost = {
  background: "transparent", color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 6, padding: "6px 12px",
  fontSize: 12, cursor: "pointer",
};

const lbl = { fontSize: 12, color: C.muted, marginBottom: 4, display: "block" };

// ─── Badge ────────────────────────────────────────────────────────────────────

const Badge = ({ label, color, small }) => (
  <span style={{
    background: color + "22", color,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: small ? "1px 5px" : "2px 7px",
    fontSize: small ? 10 : 11,
    fontWeight: 600, whiteSpace: "nowrap",
  }}>{label}</span>
);

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
              background: filter === f ? "#21262D" : "transparent",
              color: filter === f ? C.text : C.muted,
              borderColor: filter === f ? C.dim : C.border,
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
        const owner     = members.find((m) => m.id === t.ownerId);
        const supporter = members.find((m) => m.id === t.supporterId);
        const sz        = SIZES[t.size];
        const ownerDays = t.supporterId ? (sz.days * t.ownerPercent / 100) : sz.days;
        const suppDays  = supporter ? sz.days * t.supporterPercent / 100 : 0;
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
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{t.title}</span>
                  <Badge label={t.team} color={TEAM_COLORS[t.team]} />
                  <Badge label={t.type} color={C.dim} />
                </div>
                {/* Meta row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge label={`${t.size} · ${sz.hours} · ${sz.days}d`} color={sz.color} />
                  {owner && (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      <span style={{ color: owner.color }}>●</span>{" "}
                      {owner.name}
                      {t.supporterId ? ` (${t.ownerPercent}% · ${ownerDays.toFixed(1)}d)` : ` (${ownerDays.toFixed(1)}d)`}
                    </span>
                  )}
                  {supporter && (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      +{" "}<span style={{ color: supporter.color }}>●</span>{" "}
                      {supporter.name} ({t.supporterPercent}% · {suppDays.toFixed(1)}d)
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
                <button onClick={() => onDelete(t.id)} style={{ ...ghost, padding: "4px 10px", color: "#F85149", borderColor: "#F8514933" }}>✕</button>
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
      <div style={{ ...card, background: "#0D1117", marginBottom: 16 }}>
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
                <span style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</span>
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
      <div style={{ ...card, background: "#0D1117", marginTop: 6 }}>
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

function CapacityTab({ capacities, topics, members }) {
  return (
    <div>
      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
        {capacities.map((c) => {
          const pct  = c.availableDays > 0 ? Math.min(100, (c.allocatedDays / c.availableDays) * 100) : 0;
          const over = c.allocatedDays > c.availableDays;
          const barColor = over ? "#F85149" : pct > 85 ? "#D29922" : c.color;
          return (
            <div key={c.id} style={{ ...card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{c.role}</div>

              {/* Bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 5 }}>
                  <span>Allocated</span>
                  <span style={{ color: over ? "#F85149" : C.text, fontWeight: 600 }}>
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
                <span style={{ color: over ? "#F85149" : "#3FB950", fontWeight: 600 }}>
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
        const myTopics = topics.filter((t) => t.ownerId === c.id || t.supporterId === c.id);
        if (!myTopics.length) return null;
        return (
          <div key={c.id} style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
              {c.name}'s Topics
            </div>
            {myTopics.map((t) => {
              const isOwner = t.ownerId === c.id;
              const pct     = isOwner ? (t.supporterId ? t.ownerPercent / 100 : 1) : t.supporterPercent / 100;
              const days    = SIZES[t.size].days * pct;
              return (
                <div key={t.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
                }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    {t.priority && <span style={{ color: "#D29922" }}>⭐</span>}
                    <span style={{ color: C.text }}>{t.title}</span>
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

function TimelineTab({ timelineTopics, members, onUpdateTopicDate }) {
  const Q2_CAL_DAYS  = 91; // April 1 – June 30 inclusive
  const trackAreaRef = useRef(null); // ref on the header months container = track width
  const dragRef      = useRef(null); // { topicId, originX, originDate } — set on mousedown
  const latestDrag   = useRef(null); // { topicId, newDate } — updated every mousemove
  const [dragState, setDragState] = useState(null); // drives live preview

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

  // Today line
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = dayOffset(fmt(today));
  const showToday = todayOffset >= 0 && todayOffset <= Q2_CAL_DAYS;

  // ── Drag & drop ──────────────────────────────────────────────────────────────
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
          const supp           = t.supporterId ? members.find((x) => x.id === t.supporterId) : null;
          const ownerFlex      = t.supporterId ? t.ownerPercent     : 100;
          const suppFlex       = t.supporterId ? t.supporterPercent : 0;

          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 5, minHeight: 38 }}>

              {/* Row label */}
              <div style={{ width: 200, flexShrink: 0, paddingRight: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.priority ? "⭐ " : ""}{t.title}
                </div>
                <div style={{ fontSize: 10, color: C.dim, display: "flex", gap: 5, alignItems: "center", marginTop: 1, flexWrap: "wrap" }}>
                  <span>{t.size}</span>
                  <span>·</span>
                  {owner && <><span style={{ color: owner.color }}>●</span><span>{owner.name}</span></>}
                  {supp  && <><span style={{ color: supp.color  }}>●</span><span>{supp.name} ({t.supporterPercent}%)</span></>}
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
                    top: -4, bottom: -4, width: 2, background: "#F85149",
                    borderRadius: 1, zIndex: 3, pointerEvents: "none",
                  }} />
                )}

                {/* ── Draggable bar (split-color for owner + supporter) ── */}
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
                      boxShadow: isDragging ? `0 0 0 2px ${owner?.color || "#fff"}, 0 4px 12px rgba(0,0,0,0.4)` : "none",
                    }}
                  >
                    {/* Owner segment — always present */}
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

                    {/* Supporter segment — only if a supporter is assigned */}
                    {supp && suppFlex > 0 && (
                      <div style={{
                        flex: suppFlex,
                        background: supp.color,
                        minWidth: suppFlex >= 15 ? 4 : 0,
                        opacity: 0.9,
                      }} />
                    )}
                  </div>
                )}

                {/* Drag tooltip — new date label that follows the bar */}
                {isDragging && (
                  <div style={{
                    position: "absolute",
                    left: `${Math.min(left, 82)}%`,
                    bottom: "calc(100% + 4px)",
                    background: "#21262D",
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
              <div style={{ width: 2, height: 12, background: "#F85149", borderRadius: 1 }} />
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
  const hasSupporter = !!form.supporterId;
  const totalPct     = hasSupporter ? form.ownerPercent + form.supporterPercent : 100;

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
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {hasSupporter && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Owner %</label>
              <input
                type="number" min={0} max={100} style={inp}
                value={form.ownerPercent}
                onChange={(e) => {
                  const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                  set("ownerPercent", v);
                  set("supporterPercent", 100 - v);
                }}
              />
            </div>
          )}
        </div>

        {/* Supporter */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Supporter (optional)</label>
            <select
              style={inp} value={form.supporterId}
              onChange={(e) => {
                const val = e.target.value;
                set("supporterId", val);
                if (val) { set("ownerPercent", 50); set("supporterPercent", 50); }
                else      { set("ownerPercent", 100); set("supporterPercent", 0); }
              }}
            >
              <option value="">— None —</option>
              {members.filter((m) => m.id !== form.ownerId).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {hasSupporter && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Supporter %</label>
              <input
                type="number" min={0} max={100} style={inp}
                value={form.supporterPercent}
                onChange={(e) => {
                  const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                  set("supporterPercent", v);
                  set("ownerPercent", 100 - v);
                }}
              />
            </div>
          )}
        </div>

        {/* % warning */}
        {hasSupporter && totalPct !== 100 && (
          <div style={{ fontSize: 12, color: "#D29922", marginBottom: 12 }}>
            ⚠ Owner + Supporter percentages should total 100% (currently {totalPct}%)
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

  // Load from URL hash or localStorage on first render
  const [_init]   = useState(() => loadInitialState());
  const [members, setMembers] = useState(_init?.members || INIT_MEMBERS);
  const [vacation, setVacation] = useState(_init?.vacation || { m1: 0, m2: 0, m3: 0, m4: 0 });
  const [topics,  setTopics]  = useState(_init?.topics   || []);

  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);

  // Auto-save to localStorage whenever data changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, members, vacation }));
    } catch {}
  }, [topics, members, vacation]);

  // Share button — encodes full state into URL hash and copies to clipboard
  const handleShare = useCallback(() => {
    const encoded = btoa(JSON.stringify({ topics, members, vacation }));
    const url = `${window.location.href.split("#")[0]}#${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback: put in address bar so user can copy manually
      window.location.hash = encoded;
    });
  }, [topics, members, vacation]);

  const openAdd  = () => { setForm({ ...EMPTY_FORM, ownerId: members[0]?.id || "m1" }); setEditId(null); setShowForm(true); };
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
        if (t.ownerId === m.id) {
          return sum + sd * (t.supporterId ? t.ownerPercent / 100 : 1);
        }
        if (t.supporterId === m.id) {
          return sum + sd * (t.supporterPercent / 100);
        }
        return sum;
      }, 0);
      return { ...m, availableDays, allocatedDays, remaining: availableDays - allocatedDays };
    });
  }, [members, vacation, topics]);

  // ── Timeline data ──
  const timelineTopics = useMemo(() => {
    return topics
      .filter((t) => t.startDate)
      .map((t) => {
        const endObj = addWorkingDays(t.startDate, SIZES[t.size]?.days || 5);
        return { ...t, endObj };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [topics]);

  const TABS = ["topics", "team", "capacity", "timeline"];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px" }}>CareCo Design Planner</span>
          <span style={{ fontSize: 12, color: C.dim, marginLeft: 2 }}>Q2 2026</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {["PHNX", "NEMO", "KITN"].map((t) => (
              <Badge key={t} label={t} color={TEAM_COLORS[t]} small />
            ))}
            <button
              onClick={handleShare}
              title="Copy a shareable link with your full plan encoded in the URL"
              style={{
                ...btn(copied ? "#238636" : "#21262D", copied ? "#fff" : C.muted),
                border: `1px solid ${copied ? "#238636" : C.border}`,
                padding: "5px 12px", fontSize: 12,
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.2s",
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
              background:   tab === t ? "#21262D" : "transparent",
              color:        tab === t ? C.text    : C.muted,
              borderColor:  tab === t ? C.dim     : "transparent",
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
        {tab === "capacity" && <CapacityTab capacities={capacities} topics={topics} members={members} />}
        {tab === "timeline" && <TimelineTab timelineTopics={timelineTopics} members={members} onUpdateTopicDate={updateTopicDate} />}
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
