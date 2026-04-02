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

// NL public holidays 2025–2027 (comprehensive)
const NL_HOLIDAYS = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-04-21", name: "Easter Monday" },
  { date: "2025-04-26", name: "King's Day" },     // April 27 is Sunday → moved to 26
  { date: "2025-05-05", name: "Liberation Day" },
  { date: "2025-05-29", name: "Ascension Day" },
  { date: "2025-06-09", name: "Whit Monday" },
  { date: "2025-12-25", name: "Christmas Day" },
  { date: "2025-12-26", name: "Boxing Day" },
  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-27", name: "King's Day" },
  { date: "2026-05-05", name: "Liberation Day" },
  { date: "2026-05-14", name: "Ascension Day" },
  { date: "2026-05-25", name: "Whit Monday" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  // 2027
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-04-27", name: "King's Day" },
  { date: "2027-05-05", name: "Liberation Day" },
  { date: "2027-05-06", name: "Ascension Day" },
  { date: "2027-05-17", name: "Whit Monday" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "Boxing Day" },
];

const holidaySet = new Set(NL_HOLIDAYS.map((h) => h.date));

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

const todayStr = () => {
  const now = new Date();
  return fmt(now);
};

// ─── Quarter helpers ──────────────────────────────────────────────────────────

function getQuarterBounds(year, q) {
  const startMonth = (q - 1) * 3; // 0-indexed
  const start = new Date(year, startMonth, 1);
  const end   = new Date(year, startMonth + 3, 0); // last day of the 3rd month
  return { start, end };
}

function getQuarterCalDays(year, q) {
  const { start, end } = getQuarterBounds(year, q);
  return Math.round((end - start) / 86400000) + 1;
}

function getQuarterWorkingDays(year, q) {
  const { start, end } = getQuarterBounds(year, q);
  return getWorkingDaysBetween(start, end);
}

function getQuarterMonths(year, q) {
  const startMonth = (q - 1) * 3;
  return [0, 1, 2].map((i) => {
    const d = new Date(year, startMonth + i, 1);
    const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    const days  = new Date(year, startMonth + i + 1, 0).getDate();
    return { label, days };
  });
}

function quarterLabel(year, q) {
  return `Q${q} ${year}`;
}

function getCurrentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), q: Math.floor(now.getMonth() / 3) + 1 };
}

function prevQuarter(year, q) {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}

function nextQuarter(year, q) {
  return q === 4 ? { year: year + 1, q: 1 } : { year, q: q + 1 };
}

function getHolidaysInQuarter(year, q) {
  const { start, end } = getQuarterBounds(year, q);
  return NL_HOLIDAYS.filter((h) => {
    const d = new Date(h.date);
    return d >= start && d <= end;
  });
}

// ─── Initial state ────────────────────────────────────────────────────────────

const ROLES = [
  "Content Design",
  "User Research",
  "Product Design",
  "Team Management",
];

const MEMBER_COLORS = [
  "#00703C", // Dark green
  "#4BAE4F", // Green
  "#F4B942", // Golden yellow
  "#EF6C3B", // Orange
  "#C21858", // Crimson
  "#9C74BB", // Lavender
  "#7B1FA2", // Purple
  "#2176D2", // Blue
  "#162B5C", // Navy
  "#78909C", // Slate
];

const INIT_MEMBERS = [
  { id: "m1", name: "", role: "Product Design", color: "#2176D2" },
];

// EMPTY_FORM is a function so startDate is always today
const makeEmptyForm = () => ({
  title: "", description: "", team: "CareCo", type: "discovery", size: "M",
  priority: false, ownerId: "", ownerPercent: 100,
  supporter1Id: "", supporter1Percent: 0,
  supporter2Id: "", supporter2Percent: 0,
  startDate: todayStr(),
});

// ─── Jira integration ─────────────────────────────────────────────────────────

const JIRA_CLOUD_ID   = "41c6d4d4-71fb-44e1-8074-4ff9d5f73490";
const JIRA_PROJECT    = "PDP";
const JIRA_PROJECT_ID = "11993";
const JIRA_EPIC_TYPE  = "10000";
const JIRA_CONFIG_KEY = "careco-jira-config";

// Pre-discovered field IDs (PDP project, Epic issue type)
const JF = {
  tempoTeam:     "customfield_10911",
  startDate:     "customfield_10929",
  category:      "customfield_11292",
  featureTeam:   "customfield_12237",
  domain:        "customfield_12263",
  collaborators: "customfield_12282",
};

// Static option IDs
const JIRA_OPTS = {
  tempoTeamCareCo:   28,
  categoryCareCo:    "20030",
  domainCareCo:      "17813",
  featureTeam: { PHNX: "19500", NEMO: "57346", KITN: "19499" },
};

function loadJiraConfig() {
  try { return JSON.parse(localStorage.getItem(JIRA_CONFIG_KEY)) || null; } catch { return null; }
}
function saveJiraConfig(cfg) {
  try { localStorage.setItem(JIRA_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

async function jiraApi(path, cfg, opts = {}) {
  const auth = btoa(`${cfg.email}:${cfg.apiToken}`);
  const base = `https://${cfg.domain}/rest/api/3`;
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Jira ${res.status}: ${t}`); }
  return res.json();
}

async function lookupJiraAccountId(name, cfg) {
  if (!name) return null;
  try {
    const r = await jiraApi(`/user/search?query=${encodeURIComponent(name)}&maxResults=3`, cfg, { method: "GET" });
    return r?.[0]?.accountId ?? null;
  } catch { return null; }
}

async function searchJiraInitiatives(title, cfg) {
  try {
    const jql = `project = ${JIRA_PROJECT} AND issuetype = Initiative ORDER BY created DESC`;
    const r = await jiraApi(`/search?jql=${encodeURIComponent(jql)}&maxResults=8&fields=summary,key`, cfg, { method: "GET" });
    return r?.issues ?? [];
  } catch { return []; }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

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
  title:      "var(--c-title)",
};

// Font stacks
const FONT_TITLE = "'Montserrat', -apple-system, sans-serif";
const FONT_BODY  = "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Roboto:wght@400;500;700&display=swap');
  :root, [data-theme="dark"] {
    --c-bg:          #0D1117;
    --c-surface:     #161B22;
    --c-surface-alt: #21262D;
    --c-border:      #30363D;
    --c-text:        #E6EDF3;
    --c-muted:       #8B949E;
    --c-dim:         #768390;
    --c-green:       #238636;
    --c-red:         #F85149;
    --c-title:       #E6EDF3;
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
    --c-title:       #00264C;
    color-scheme: light;
  }
  *, *::before, *::after {
    transition-property: background-color, border-color, color, box-shadow;
    transition-duration: 0.28s;
    transition-timing-function: ease;
  }
  .theme-toggle {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 20px;
    border: 1px solid var(--c-border);
    background: var(--c-surface-alt);
    cursor: pointer; font-size: 13px; color: var(--c-muted);
    user-select: none; position: relative; overflow: hidden;
  }
  .theme-toggle:hover {
    border-color: var(--c-muted);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-muted) 15%, transparent);
  }
  .theme-toggle:active { transform: scale(0.95); }
  @keyframes icon-exit  { 0% { transform: rotate(0) scale(1); opacity:1; } 100% { transform: rotate(-90deg) scale(0); opacity:0; } }
  @keyframes icon-enter { 0% { transform: rotate(90deg) scale(0); opacity:0; } 60% { transform: rotate(-8deg) scale(1.2); opacity:1; } 80% { transform: rotate(5deg) scale(.95); } 100% { transform: rotate(0) scale(1); opacity:1; } }
  .icon-exiting  { animation: icon-exit  0.2s ease forwards; }
  .icon-entering { animation: icon-enter 0.35s ease forwards; }
  @keyframes theme-ripple { 0% { transform:scale(0); opacity:.35; } 100% { transform:scale(40); opacity:0; } }
  .theme-ripple { position:absolute; width:20px; height:20px; border-radius:50%; background:var(--c-text); pointer-events:none; animation:theme-ripple 0.55s ease-out forwards; }
  ::-webkit-scrollbar { width:7px; height:7px; }
  ::-webkit-scrollbar-track { background:var(--c-bg); }
  ::-webkit-scrollbar-thumb { background:var(--c-border); border-radius:4px; }
  ::-webkit-scrollbar-thumb:hover { background:var(--c-dim); }
  input, select, textarea { color-scheme: inherit; }
`;

// ─── Style helpers ────────────────────────────────────────────────────────────

const card = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: 16, marginBottom: 10,
};

const inp = {
  background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, padding: "6px 10px",
  fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
};

// Select gets extra right padding so the native chevron doesn't crowd the text
const selInp = { ...inp, paddingRight: 28 };

const btn = (bg = C.green, color = "#fff") => ({
  background: bg, color, border: "none", borderRadius: 6,
  padding: "7px 16px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
});

const ghost = {
  background: "transparent", color: C.muted,
  border: `1px solid ${C.border}`, borderRadius: 6,
  padding: "6px 12px", fontSize: 12, cursor: "pointer",
};

const lbl = { fontSize: 12, color: C.muted, marginBottom: 4, display: "block" };

const clickableTitle = {
  cursor: "pointer", textDecoration: "none",
  borderBottom: "1px dashed transparent",
  transition: "border-color 0.15s, color 0.15s",
};

// ─── Badge ────────────────────────────────────────────────────────────────────

const Badge = ({ label, color, small }) => (
  <span style={{
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    borderRadius: 4, padding: small ? "1px 5px" : "2px 7px",
    fontSize: small ? 10 : 11, fontWeight: 600, whiteSpace: "nowrap",
  }}>{label}</span>
);

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

function ThemeToggle({ isDark, onToggle }) {
  const [phase, setPhase] = useState("idle");
  const [ripple, setRipple] = useState(null);
  const btnRef = useRef(null);

  const handleClick = (e) => {
    const rect = btnRef.current.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    setPhase("exiting");
    setTimeout(() => { onToggle(); setPhase("entering"); }, 200);
    setTimeout(() => setPhase("idle"), 600);
    setTimeout(() => setRipple(null), 600);
  };

  return (
    <button ref={btnRef} className="theme-toggle" onClick={handleClick}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      {ripple && <span key={ripple.key} className="theme-ripple" style={{ left: ripple.x - 10, top: ripple.y - 10 }} />}
      <span className={phase === "exiting" ? "icon-exiting" : phase === "entering" ? "icon-entering" : ""}
        style={{ display: "inline-block", fontSize: 15, lineHeight: 1 }}>
        {isDark ? "☀️" : "🌙"}
      </span>
      <span style={{ fontSize: 12 }}>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

// ─── DeleteConfirm (inline) ───────────────────────────────────────────────────

function DeleteConfirm({ title, onConfirm, onCancel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span style={{ fontSize: 12, color: C.muted }}>
        Delete <strong style={{ color: C.text }}>"{title.length > 22 ? title.slice(0, 22) + "…" : title}"</strong>?
      </span>
      <button onClick={onCancel} style={{ ...ghost, padding: "4px 10px", fontSize: 12 }}>Cancel</button>
      <button onClick={onConfirm}
        style={{ ...ghost, padding: "4px 10px", fontSize: 12, color: C.red, borderColor: `color-mix(in srgb, ${C.red} 40%, transparent)` }}>
        Yes, delete
      </button>
    </div>
  );
}

// ─── JiraSetupModal ───────────────────────────────────────────────────────────

function JiraSetupModal({ onSave, onClose }) {
  const [domain,   setDomain]   = useState("doctolib.atlassian.net");
  const [email,    setEmail]    = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testing,  setTesting]  = useState(false);
  const [err,      setErr]      = useState(null);

  const test = async () => {
    setTesting(true); setErr(null);
    try {
      await jiraApi("/myself", { domain, email, apiToken }, { method: "GET" });
      const cfg = { domain, email, apiToken };
      saveJiraConfig(cfg);
      onSave(cfg);
    } catch (e) {
      setErr(e.message.includes("401") ? "Invalid email or API token." : e.message.includes("Failed to fetch") ? "Could not reach Jira — check your domain and that your browser allows cross-origin requests." : e.message);
    } finally { setTesting(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:28, width:"100%", maxWidth:480 }}>
        <div style={{ fontWeight:700, fontSize:16, color:C.title, fontFamily:FONT_TITLE, marginBottom:6 }}>Connect Jira</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>One-time setup — saved to your browser. Generate an API token at <strong>id.atlassian.net → Security → API tokens</strong>.</div>

        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Jira Domain</label>
          <input style={inp} value={domain} onChange={e=>setDomain(e.target.value)} placeholder="yourcompany.atlassian.net" />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Your Atlassian Email</label>
          <input style={inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={lbl}>API Token</label>
          <input style={inp} type="password" value={apiToken} onChange={e=>setApiToken(e.target.value)} placeholder="ATATTxxxx…" />
        </div>

        {err && <div style={{ fontSize:12, color:C.red, marginBottom:12, padding:"8px 12px", background:`color-mix(in srgb, ${C.red} 10%, transparent)`, borderRadius:6 }}>{err}</div>}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
          <button onClick={onClose} style={{ ...ghost, padding:"7px 16px" }}>Cancel</button>
          <button onClick={test} disabled={!domain||!email||!apiToken||testing}
            style={{ ...btn("#107ACA"), padding:"7px 20px", opacity:(!domain||!email||!apiToken||testing)?0.5:1 }}>
            {testing ? "Testing…" : "Save & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── JiraReviewModal ──────────────────────────────────────────────────────────

function JiraReviewModal({ topic, members, jiraConfig, onClose, onCreated }) {
  const owner      = members.find(m => m.id === topic.ownerId);
  const supporter1 = members.find(m => m.id === topic.supporter1Id);
  const supporter2 = members.find(m => m.id === topic.supporter2Id);
  const sz         = SIZES[topic.size];
  const endDate    = topic.startDate ? fmt(addWorkingDays(topic.startDate, sz.days)) : null;
  const label      = topic.type === "discovery" ? "Discovery" : "Design";
  const featureTeamId = JIRA_OPTS.featureTeam[topic.team] ?? null;

  const [initiatives, setInitiatives] = useState([]);
  const [parentId,    setParentId]    = useState("");
  const [creating,    setCreating]    = useState(false);
  const [err,         setErr]         = useState(null);
  const [loadingParents, setLoadingParents] = useState(true);

  useEffect(() => {
    searchJiraInitiatives(topic.title, jiraConfig).then(list => {
      setInitiatives(list);
      if (list.length > 0) setParentId(list[0].id);
      setLoadingParents(false);
    });
  }, []);

  const Field = ({ label: fl, value, dim }) => (
    <div style={{ display:"flex", gap:0, marginBottom:8, fontSize:13 }}>
      <span style={{ width:160, flexShrink:0, color:C.muted, fontSize:12 }}>{fl}</span>
      <span style={{ color: dim ? C.dim : C.text }}>{value || <span style={{color:C.dim}}>—</span>}</span>
    </div>
  );

  const create = async () => {
    setCreating(true); setErr(null);
    try {
      // Resolve account IDs
      const assigneeId     = await lookupJiraAccountId(owner?.name, jiraConfig);
      const collabIds      = (await Promise.all(
        [supporter1, supporter2].filter(Boolean).map(s => lookupJiraAccountId(s.name, jiraConfig))
      )).filter(Boolean);

      const body = {
        fields: {
          project:    { id: JIRA_PROJECT_ID },
          issuetype:  { id: JIRA_EPIC_TYPE },
          summary:    topic.title,
          labels:     [label],
          [JF.domain]:        { id: JIRA_OPTS.domainCareCo },
          [JF.category]:      { id: JIRA_OPTS.categoryCareCo },
          [JF.tempoTeam]:     { id: JIRA_OPTS.tempoTeamCareCo },
        },
      };

      if (topic.description)  body.fields.description = { type:"doc", version:1, content:[{ type:"paragraph", content:[{ type:"text", text:topic.description }] }] };
      if (assigneeId)         body.fields.assignee     = { id: assigneeId };
      if (collabIds.length)   body.fields[JF.collaborators] = collabIds.map(id => ({ id }));
      if (topic.startDate)    body.fields[JF.startDate]  = topic.startDate;
      if (endDate)            body.fields.duedate         = endDate;
      if (featureTeamId)      body.fields[JF.featureTeam] = { id: featureTeamId };
      if (parentId)           body.fields.parent          = { id: parentId };

      const result = await jiraApi("/issue", jiraConfig, { method:"POST", body: JSON.stringify(body) });
      const url = `https://${jiraConfig.domain}/browse/${result.key}`;
      window.open(url, "_blank");
      onCreated(topic.id, result.key, url);
    } catch(e) {
      setErr(e.message);
    } finally { setCreating(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <div style={{ fontWeight:700, fontSize:16, color:C.title, fontFamily:FONT_TITLE }}>Create Jira Epic</div>
          <div style={{ marginLeft:"auto", fontSize:11, color:C.dim, background:C.surfaceAlt, padding:"2px 8px", borderRadius:4 }}>PDP · Epic · BACKLOG</div>
        </div>

        <div style={{ ...card, marginBottom:16, padding:"14px 16px" }}>
          <Field label="Summary"     value={topic.title} />
          <Field label="Description" value={topic.description} dim={!topic.description} />
          <Field label="Assignee"    value={owner?.name} />
          <Field label="Collaborators" value={[supporter1, supporter2].filter(Boolean).map(s=>s.name).join(", ")} dim={!supporter1&&!supporter2} />
          <Field label="Labels"      value={label} />
          <Field label="Start date"  value={topic.startDate} />
          <Field label="Due date"    value={endDate} />
          <Field label="Feature Team" value={topic.team === "CareCo" ? "— (cross-domain)" : topic.team} dim={topic.team === "CareCo"} />
          <Field label="Domain"      value="CARE COOPERATION" />
          <Field label="Category"    value="CARE COOPERATION" />
          <Field label="Tempo Team"  value="DESIGN - Cooperative Care" />
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={lbl}>Parent Initiative {loadingParents ? "(loading…)" : `(${initiatives.length} found)`}</label>
          <select style={selInp} value={parentId} onChange={e=>setParentId(e.target.value)} disabled={loadingParents}>
            <option value="">— No parent —</option>
            {initiatives.map(i => (
              <option key={i.id} value={i.id}>{i.key} · {i.fields?.summary}</option>
            ))}
          </select>
          <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>You can change this in Jira after creation.</div>
        </div>

        {err && <div style={{ fontSize:12, color:C.red, marginBottom:12, padding:"8px 12px", background:`color-mix(in srgb, ${C.red} 10%, transparent)`, borderRadius:6 }}>{err}</div>}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
          <button onClick={onClose} style={{ ...ghost, padding:"7px 16px" }}>Cancel</button>
          <button onClick={create} disabled={creating}
            style={{ background:"#107ACA", color:"#fff", border:"none", borderRadius:999, padding:"9px 22px", fontSize:14, fontWeight:700, fontFamily:FONT_TITLE, cursor:creating?"wait":"pointer", opacity:creating?0.6:1, display:"flex", alignItems:"center", gap:6 }}>
            {creating ? "Creating…" : "⚡ Create Epic in Jira"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TopicsTab ────────────────────────────────────────────────────────────────

function TopicsTab({ topics, members, onAdd, onEdit, onDelete, onJira }) {
  const [filter, setFilter]               = useState("all");
  const [sizeFilter, setSizeFilter]       = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filters  = ["all", "⭐ priority", ...TEAMS];
  const filtered = topics.filter((t) => {
    const passesSize = !sizeFilter || t.size === sizeFilter;
    if (!passesSize) return false;
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
        <button onClick={onAdd} style={{
          background: "#107ACA", color: "#fff", border: "none",
          borderRadius: 999, padding: "9px 22px",
          fontSize: 14, fontWeight: 700, fontFamily: "'Roboto', sans-serif",
          cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "0.01em",
          display: "flex", alignItems: "center", gap: 6,
        }}>+ Add Topic</button>
      </div>

      {/* Summary / size filter */}
      {topics.length > 0 && (
        <div style={{ ...card, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14, padding: "10px 16px" }}>
          {Object.keys(SIZES).map((sz) => {
            const count = topics.filter((t) => t.size === sz).length;
            if (!count) return null;
            const active = sizeFilter === sz;
            return (
              <button
                key={sz}
                onClick={() => setSizeFilter(active ? null : sz)}
                title={active ? `Remove ${sz} filter` : `Filter by ${sz}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: active ? `color-mix(in srgb, ${SIZES[sz].color} 18%, transparent)` : "transparent",
                  border: active ? `1px solid color-mix(in srgb, ${SIZES[sz].color} 50%, transparent)` : `1px solid transparent`,
                  borderRadius: 6, padding: "3px 8px 3px 3px", cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <Badge label={sz} color={SIZES[sz].color} />
                <span style={{ fontSize: 12, color: active ? C.text : C.muted }}>×{count}</span>
              </button>
            );
          })}
          {sizeFilter && (
            <button onClick={() => setSizeFilter(null)} style={{ ...ghost, padding: "3px 8px", fontSize: 11 }}>
              ✕ clear size filter
            </button>
          )}
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>
            {filtered.length} topic{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: C.dim, padding: "48px 0", fontSize: 13 }}>
          {topics.length === 0 ? "No topics yet — add one to kick off planning." : "No topics match this filter."}
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
        const isConfirming = confirmDeleteId === t.id;

        return (
          <div key={t.id} style={{ ...card, borderLeft: `3px solid ${TEAM_COLORS[t.team] || C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
                  {t.priority && <span title="High priority" style={{ fontSize: 13 }}>⭐</span>}
                  <span
                    onClick={() => onEdit(t)}
                    title="Click to edit"
                    style={{ ...clickableTitle, fontWeight: 600, fontSize: 14, color: C.title, fontFamily: FONT_TITLE }}
                    onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                    onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = C.title; }}
                  >{t.title}</span>
                  <Badge label={t.team} color={TEAM_COLORS[t.team]} />
                  <Badge label={t.type} color={C.dim} />
                </div>
                {t.description && (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 7, fontStyle: "italic" }}>{t.description}</div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge label={`${t.size} · ${sz.hours} · ${sz.days}d`} color={sz.color} />
                  {owner ? (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      <span style={{ color: owner.color }}>●</span>{" "}{owner.name}
                      {hasSupp ? ` (${t.ownerPercent}% · ${ownerDays.toFixed(1)}d)` : ` (${ownerDays.toFixed(1)}d)`}
                    </span>
                  ) : <span style={{ fontSize: 12, color: C.dim }}>— Unassigned —</span>}
                  {supporter1 && <span style={{ fontSize: 12, color: C.muted }}>+{" "}<span style={{ color: supporter1.color }}>●</span>{" "}{supporter1.name} ({t.supporter1Percent}% · {supp1Days.toFixed(1)}d)</span>}
                  {supporter2 && <span style={{ fontSize: 12, color: C.muted }}>+{" "}<span style={{ color: supporter2.color }}>●</span>{" "}{supporter2.name} ({t.supporter2Percent}% · {supp2Days.toFixed(1)}d)</span>}
                  {t.startDate && (
                    <span style={{ fontSize: 12, color: C.dim }}>
                      📅 {t.startDate} → {fmt(addWorkingDays(t.startDate, sz.days))}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions / confirm */}
              {isConfirming ? (
                <DeleteConfirm
                  title={t.title}
                  onConfirm={() => { onDelete(t.id); setConfirmDeleteId(null); }}
                  onCancel={() => setConfirmDeleteId(null)}
                />
              ) : (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onJira(t)}
                    title={t.jiraKey ? `View ${t.jiraKey} in Jira` : "Create Jira Epic"}
                    style={{ ...ghost, padding: "4px 10px", fontSize: 12, display:"flex", alignItems:"center", gap:4,
                      color: t.jiraKey ? "#0369A1" : C.muted,
                      borderColor: t.jiraKey ? "color-mix(in srgb, #0369A1 40%, transparent)" : C.border,
                    }}>
                    {t.jiraKey ? `⚡ ${t.jiraKey}` : "⚡ Jira"}
                  </button>
                  <button onClick={() => onEdit(t)} style={{ ...ghost, padding: "4px 10px" }}>Edit</button>
                  <button
                    onClick={() => setConfirmDeleteId(t.id)}
                    style={{ ...ghost, padding: "4px 10px", color: C.red, borderColor: `color-mix(in srgb, ${C.red} 40%, transparent)` }}
                  >✕</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TeamTab ──────────────────────────────────────────────────────────────────

function TeamTab({ members, setMembers, vacation, setVacation, qWorkingDays, qLabel, qHolidays }) {
  const [dragId,  setDragId]  = useState(null);
  const [dropId,  setDropId]  = useState(null);
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null);

  const updateName  = (id, name)  => setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, name }  : m)));
  const updateRole  = (id, role)  => setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role }  : m)));
  const updateColor = (id, color) => { setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, color } : m))); setColorPickerOpenId(null); };
  const updateVac   = (id, val)   => setVacation((v) => ({ ...v, [id]: Math.max(0, Math.min(qWorkingDays, parseInt(val) || 0)) }));

  const addMember = () => {
    const id    = `m${Date.now()}`;
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    setMembers((ms) => [{ id, name: "", role: "Product Design", color }, ...ms]);
    setVacation((v) => ({ ...v, [id]: 0 }));
  };

  const removeMember = (id) => {
    setMembers((ms) => ms.filter((m) => m.id !== id));
    setVacation((v) => { const n = { ...v }; delete n[id]; return n; });
  };

  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragId) setDropId(id);
  };
  const handleDrop = (e, id) => {
    e.preventDefault();
    if (dragId && id !== dragId) {
      setMembers((ms) => {
        const arr = [...ms];
        const from = arr.findIndex((m) => m.id === dragId);
        const to   = arr.findIndex((m) => m.id === id);
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        return arr;
      });
    }
    setDragId(null); setDropId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDropId(null); };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          {qLabel}: <strong style={{ color: C.text }}>{qWorkingDays} working days</strong>
          <span style={{ marginLeft: 10, color: C.dim }}>· {qHolidays.length} NL holiday{qHolidays.length !== 1 ? "s" : ""}</span>
        </div>
        <button onClick={addMember} style={{
          background: "#107ACA", color: "#fff", border: "none",
          borderRadius: 999, padding: "9px 22px",
          fontSize: 14, fontWeight: 700, fontFamily: "'Roboto', sans-serif",
          cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "0.01em",
          display: "flex", alignItems: "center", gap: 6,
        }}>+ Add Designer</button>
      </div>

      {members.map((m) => {
        const avail     = qWorkingDays - (vacation[m.id] || 0);
        const isDragging = dragId === m.id;
        const isDropTarget = dropId === m.id && dragId !== m.id;
        return (
          <div key={m.id}
            draggable
            onDragStart={(e) => handleDragStart(e, m.id)}
            onDragOver={(e) => handleDragOver(e, m.id)}
            onDrop={(e) => handleDrop(e, m.id)}
            onDragEnd={handleDragEnd}
            style={{
              ...card,
              opacity: isDragging ? 0.35 : 1,
              borderColor: isDropTarget ? C.muted : C.border,
              boxShadow: isDropTarget ? `0 0 0 2px ${C.dim}` : "none",
              cursor: "grab",
              transition: "opacity 0.15s, border-color 0.15s, box-shadow 0.15s",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginBottom: 4, position: "relative" }}>
                {/* Drag handle */}
                <span style={{ fontSize: 14, color: C.dim, cursor: "grab", userSelect: "none", flexShrink: 0 }} title="Drag to reorder">⠿</span>
                {/* Color swatch button */}
                <button
                  onClick={() => setColorPickerOpenId(colorPickerOpenId === m.id ? null : m.id)}
                  title="Pick colour"
                  style={{ width: 18, height: 18, borderRadius: "50%", background: m.color, border: "2px solid transparent", outline: colorPickerOpenId === m.id ? `2px solid ${m.color}` : "none", outlineOffset: 2, cursor: "pointer", flexShrink: 0, padding: 0 }}
                />
                {/* Inline colour picker */}
                {colorPickerOpenId === m.id && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 28, zIndex: 50,
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: 10, display: "flex", flexWrap: "wrap", gap: 7, width: 194,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}>
                    {MEMBER_COLORS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => updateColor(m.id, hex)}
                        title={hex}
                        style={{
                          width: 26, height: 26, borderRadius: "50%", background: hex,
                          border: m.color === hex ? "3px solid #fff" : "2px solid transparent",
                          outline: m.color === hex ? `2px solid ${hex}` : "none",
                          outlineOffset: 1,
                          cursor: "pointer", padding: 0, flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
                <span style={{ fontWeight: 600, fontSize: 14, color: m.name ? C.title : C.dim, fontFamily: FONT_TITLE }}>
                  {m.name || "Unnamed designer"}
                </span>
                <span style={{ fontSize: 12, color: C.muted }}>{m.role}</span>
                <button
                  onClick={() => removeMember(m.id)}
                  title="Remove designer"
                  style={{ ...ghost, marginLeft: "auto", padding: "2px 8px", fontSize: 12, color: C.dim, borderColor: "transparent" }}
                >✕</button>
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={lbl}>Name</label>
                <input style={inp} value={m.name}
                  placeholder="Full name"
                  onChange={(e) => updateName(m.id, e.target.value)} />
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={lbl}>Role</label>
                <select style={selInp} value={m.role} onChange={(e) => updateRole(m.id, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ width: 120 }}>
                <label style={lbl}>Vacation Days ({qLabel})</label>
                <input type="number" min={0} max={qWorkingDays} style={inp}
                  value={vacation[m.id] || 0}
                  onChange={(e) => updateVac(m.id, e.target.value)} />
              </div>
              <div style={{ fontSize: 13, color: C.muted, paddingBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 600, fontSize: 18 }}>{avail}</span>
                <span style={{ marginLeft: 4 }}>available days</span>
              </div>
            </div>
          </div>
        );
      })}

      {members.length === 0 && (
        <div style={{ textAlign: "center", color: C.dim, padding: "48px 0", fontSize: 13 }}>
          No team members yet — add a designer to get started.
        </div>
      )}

      <div style={{ ...card, background: C.bg, marginTop: 6 }}>
        <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 10 }}>
          🇳🇱 Netherlands Public Holidays — {qLabel}
        </div>
        {qHolidays.length === 0 ? (
          <div style={{ fontSize: 12, color: C.dim }}>No public holidays this quarter.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {qHolidays.map((h) => (
              <span key={h.date} style={{
                fontSize: 12, color: C.muted, background: C.surface,
                padding: "4px 10px", borderRadius: 4, border: `1px solid ${C.border}`,
              }}>{h.date} · {h.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CapacityTab ──────────────────────────────────────────────────────────────

function CapacityTab({ capacities, topics, members, onEdit, qWorkingDays, qLabel }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
        {capacities.map((c) => {
          const pct  = c.availableDays > 0 ? Math.min(100, (c.allocatedDays / c.availableDays) * 100) : 0;
          const over = c.allocatedDays > c.availableDays;
          const barColor = over ? C.red : pct > 85 ? "#D29922" : c.color;
          return (
            <div key={c.id} style={{ ...card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: C.title, fontFamily: FONT_TITLE }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{c.role}</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 5 }}>
                  <span>Allocated ({qLabel})</span>
                  <span style={{ color: over ? C.red : C.text, fontWeight: 600 }}>
                    {c.allocatedDays.toFixed(1)} / {c.availableDays}d
                  </span>
                </div>
                <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: barColor, transition: "width 0.4s" }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.dim }}>{c.availableDays}d available</span>
                <span style={{ color: over ? C.red : "#3FB950", fontWeight: 600 }}>
                  {over ? `${(c.allocatedDays - c.availableDays).toFixed(1)}d over` : `${c.remaining.toFixed(1)}d free`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {capacities.map((c) => {
        const myTopics = topics.filter((t) => t.ownerId === c.id || t.supporter1Id === c.id || t.supporter2Id === c.id);
        if (!myTopics.length) return null;
        return (
          <div key={c.id} style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, color: C.title, fontFamily: FONT_TITLE }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
              {c.name}'s Topics
            </div>
            {myTopics.map((t) => {
              const isOwner = t.ownerId === c.id;
              const isSupp1 = t.supporter1Id === c.id;
              const hasSupp = !!(t.supporter1Id || t.supporter2Id);
              const pct     = isOwner ? (hasSupp ? t.ownerPercent / 100 : 1) : isSupp1 ? t.supporter1Percent / 100 : t.supporter2Percent / 100;
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
                      style={{ ...clickableTitle, color: C.title, fontFamily: FONT_TITLE, fontWeight: 600 }}
                      onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                      onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = C.title; }}
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

function TimelineTab({ timelineTopics, members, onUpdateTopicDate, onEdit, quarter, onPrevQuarter, onNextQuarter }) {
  const [sortBy, setSortBy] = useState("date"); // "date" | "owner" | "team"
  const { year, q } = quarter;
  const { start: Q_START, end: Q_END } = getQuarterBounds(year, q);
  const Q_CAL_DAYS = getQuarterCalDays(year, q);
  const months     = getQuarterMonths(year, q);
  const qLabel     = quarterLabel(year, q);
  const prev       = prevQuarter(year, q);
  const next       = nextQuarter(year, q);

  const trackAreaRef = useRef(null);
  const dragRef      = useRef(null);
  const latestDrag   = useRef(null);
  const [dragState, setDragState] = useState(null);

  const dayOffset = useCallback((dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const s = new Date(Q_START);
    s.setHours(0, 0, 0, 0);
    return Math.floor((d - s) / 86400000);
  }, [Q_START]);

  const dateFromOffset = useCallback((rawOffset) => {
    const clamped = Math.max(0, Math.min(Q_CAL_DAYS - 1, Math.round(rawOffset)));
    const d = new Date(Q_START);
    d.setDate(d.getDate() + clamped);
    return fmt(d);
  }, [Q_START, Q_CAL_DAYS]);

  // Today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset  = dayOffset(fmt(today));
  const showToday    = todayOffset >= 0 && todayOffset <= Q_CAL_DAYS;
  const todayDateStr = fmt(today);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragRef.current || !trackAreaRef.current) return;
      const { topicId, originX, originDate } = dragRef.current;
      const trackW    = trackAreaRef.current.getBoundingClientRect().width;
      const pixPerDay = trackW / Q_CAL_DAYS;
      const deltaDays = (e.clientX - originX) / pixPerDay;
      const newDate   = dateFromOffset(dayOffset(originDate) + deltaDays);
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
  }, [onUpdateTopicDate, dayOffset, dateFromOffset, Q_CAL_DAYS]);

  const handleBarMouseDown = (e, topic) => {
    e.preventDefault();
    dragRef.current = { topicId: topic.id, originX: e.clientX, originDate: topic.startDate };
    setDragState({ topicId: topic.id, newDate: topic.startDate });
    document.body.style.cursor = "grabbing";
  };

  // Filter to topics that overlap with this quarter, then sort
  const visibleTopics = useMemo(() => {
    const filtered = timelineTopics.filter((t) => {
      if (!t.startDate) return false;
      const startOff = dayOffset(t.startDate);
      const endOff   = startOff + (SIZES[t.size]?.days || 5) + 7;
      return endOff >= 0 && startOff <= Q_CAL_DAYS;
    });
    if (sortBy === "owner") {
      return [...filtered].sort((a, b) => {
        const nameA = members.find((m) => m.id === a.ownerId)?.name ?? "zzz";
        const nameB = members.find((m) => m.id === b.ownerId)?.name ?? "zzz";
        return nameA.localeCompare(nameB) || a.startDate.localeCompare(b.startDate);
      });
    }
    if (sortBy === "team") {
      return [...filtered].sort((a, b) =>
        a.team.localeCompare(b.team) || a.startDate.localeCompare(b.startDate)
      );
    }
    return filtered; // default: already sorted by startDate from parent
  }, [timelineTopics, sortBy, members, dayOffset, Q_CAL_DAYS]);

  return (
    <div>
      {/* Quarter navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <button onClick={onPrevQuarter} style={{ ...ghost, display: "flex", alignItems: "center", gap: 5, padding: "5px 12px" }}>
          ← {quarterLabel(prev.year, prev.q)}
        </button>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.title, fontFamily: FONT_TITLE }}>{qLabel}</span>
          {showToday && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "#D29922", fontWeight: 600 }}>
              📍 Today: {todayDateStr}
            </span>
          )}
        </div>
        <button onClick={onNextQuarter} style={{ ...ghost, display: "flex", alignItems: "center", gap: 5, padding: "5px 12px" }}>
          {quarterLabel(next.year, next.q)} →
        </button>
      </div>

      {/* Sort controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: C.muted, marginRight: 2 }}>Sort:</span>
        {[["date", "Date"], ["owner", "Owner"], ["team", "Team"]].map(([val, label]) => (
          <button key={val} onClick={() => setSortBy(val)} style={{
            ...ghost, padding: "3px 10px", fontSize: 12,
            background:  sortBy === val ? C.surfaceAlt : "transparent",
            color:       sortBy === val ? C.text       : C.muted,
            borderColor: sortBy === val ? C.dim        : C.border,
          }}>{label}</button>
        ))}
      </div>

      {visibleTopics.length === 0 && (
        <div style={{ textAlign: "center", color: C.dim, padding: "60px 0", fontSize: 13 }}>
          No topics with start dates in {qLabel}. Add topics or navigate to another quarter.
        </div>
      )}

      {visibleTopics.length > 0 && (
        <div style={{ overflowX: "auto", userSelect: "none" }}>
          <div style={{ minWidth: 860 }}>
            {/* Month header */}
            <div style={{ display: "flex" }}>
              <div style={{ width: 200, flexShrink: 0 }} />
              <div ref={trackAreaRef} style={{ flex: 1, display: "flex", position: "relative" }}>
                {months.map((m, i) => (
                  <div key={i} style={{
                    width: `${(m.days / Q_CAL_DAYS) * 100}%`,
                    padding: "5px 8px", fontSize: 11, color: C.muted, fontWeight: 600,
                    borderLeft: `1px solid ${C.border}`, background: C.bg, boxSizing: "border-box",
                  }}>{m.label}</div>
                ))}
                {showToday && (
                  <div style={{ position: "absolute", left: `${todayOffset / Q_CAL_DAYS * 100}%`, top: 0, bottom: -4, width: 2, background: "#D29922", zIndex: 5, pointerEvents: "none" }}>
                    <div style={{
                      position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)",
                      background: "#D29922", color: "#000", fontSize: 9, fontWeight: 700,
                      padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap",
                    }}>TODAY</div>
                  </div>
                )}
              </div>
            </div>

            {/* Topic rows */}
            {visibleTopics.map((t) => {
              const isDragging     = dragState?.topicId === t.id;
              const effectiveStart = isDragging ? dragState.newDate : t.startDate;
              const effectiveEnd   = addWorkingDays(effectiveStart, SIZES[t.size]?.days || 5);
              const startOff       = dayOffset(effectiveStart);
              const dur            = (effectiveEnd - new Date(effectiveStart)) / 86400000 + 1;
              const left           = Math.max(0, startOff) / Q_CAL_DAYS * 100;
              const width          = Math.min(dur, Q_CAL_DAYS - Math.max(0, startOff)) / Q_CAL_DAYS * 100;
              const owner          = members.find((x) => x.id === t.ownerId);
              const supp1          = t.supporter1Id ? members.find((x) => x.id === t.supporter1Id) : null;
              const supp2          = t.supporter2Id ? members.find((x) => x.id === t.supporter2Id) : null;
              const hasSupp        = !!(t.supporter1Id || t.supporter2Id);
              const ownerFlex      = hasSupp ? t.ownerPercent      : 100;
              const supp1Flex      = hasSupp ? t.supporter1Percent : 0;
              const supp2Flex      = hasSupp ? t.supporter2Percent : 0;

              // Month divider calendar offsets
              const monthDividers = [months[0].days, months[0].days + months[1].days];

              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 5, minHeight: 38 }}>
                  <div style={{ width: 200, flexShrink: 0, paddingRight: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.title, fontFamily: FONT_TITLE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.priority ? "⭐ " : ""}
                      <span
                        onClick={() => onEdit(t)}
                        title="Click to edit"
                        style={{ ...clickableTitle, fontWeight: 600, fontSize: 12 }}
                        onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.muted; e.currentTarget.style.color = C.muted; }}
                        onMouseLeave={e => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.color = C.title; }}
                      >{t.title}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, display: "flex", gap: 5, alignItems: "center", marginTop: 1, flexWrap: "wrap" }}>
                      <span>{t.size}</span><span>·</span>
                      {owner
                        ? <><span style={{ color: owner.color }}>●</span><span>{owner.name}</span></>
                        : <span style={{ color: C.dim }}>Unassigned</span>}
                      {supp1 && <><span style={{ color: supp1.color }}>●</span><span>{supp1.name}</span></>}
                      {supp2 && <><span style={{ color: supp2.color }}>●</span><span>{supp2.name}</span></>}
                    </div>
                  </div>

                  <div style={{ flex: 1, position: "relative", height: 30, background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>
                    {/* Month dividers */}
                    {monthDividers.map((d) => (
                      <div key={d} style={{ position: "absolute", left: `${d / Q_CAL_DAYS * 100}%`, top: 0, bottom: 0, width: 1, background: C.border, pointerEvents: "none" }} />
                    ))}

                    {/* Today line */}
                    {showToday && (
                      <div style={{ position: "absolute", left: `${todayOffset / Q_CAL_DAYS * 100}%`, top: -4, bottom: -4, width: 2, background: "#D29922", borderRadius: 1, zIndex: 3, pointerEvents: "none" }} />
                    )}

                    {/* Bar */}
                    {startOff < Q_CAL_DAYS && startOff + dur > 0 && (
                      <div
                        onMouseDown={(e) => handleBarMouseDown(e, t)}
                        title={`${t.title}\n${effectiveStart} → ${fmt(effectiveEnd)}\nDrag to reschedule`}
                        style={{
                          position: "absolute", left: `${left}%`, width: `${Math.max(width, 0.8)}%`,
                          height: "100%", borderRadius: 4, display: "flex", overflow: "hidden",
                          opacity: isDragging ? 0.8 : 0.9,
                          cursor: isDragging ? "grabbing" : "grab",
                          boxSizing: "border-box",
                          boxShadow: isDragging ? `0 0 0 2px ${owner?.color || TEAM_COLORS[t.team] || "#fff"}, 0 4px 12px rgba(0,0,0,0.4)` : "none",
                        }}
                      >
                        <div style={{
                          flex: ownerFlex, background: owner?.color || TEAM_COLORS[t.team],
                          display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden", minWidth: 0,
                        }}>
                          <span style={{ fontSize: 10, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {width > 7 ? `${effectiveStart} → ${fmt(effectiveEnd)}` : ""}
                          </span>
                        </div>
                        {supp1 && supp1Flex > 0 && <div style={{ flex: supp1Flex, background: supp1.color, minWidth: supp1Flex >= 15 ? 4 : 0, opacity: 0.9 }} />}
                        {supp2 && supp2Flex > 0 && <div style={{ flex: supp2Flex, background: supp2.color, minWidth: supp2Flex >= 15 ? 4 : 0, opacity: 0.75 }} />}
                      </div>
                    )}

                    {/* Drag tooltip */}
                    {isDragging && (
                      <div style={{
                        position: "absolute", left: `${Math.min(left, 82)}%`, bottom: "calc(100% + 4px)",
                        background: C.surfaceAlt, border: `1px solid ${owner?.color || C.border}`,
                        borderRadius: 4, padding: "3px 8px", fontSize: 11, color: C.text,
                        whiteSpace: "nowrap", pointerEvents: "none", zIndex: 20,
                      }}>📅 {effectiveStart}</div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#D29922" }}>
                  <div style={{ width: 2, height: 12, background: "#D29922", borderRadius: 1 }} />
                  Today ({todayDateStr})
                </div>
              )}
              <div style={{ marginLeft: "auto", fontSize: 11, color: C.dim, fontStyle: "italic" }}>← drag bars to reschedule</div>
            </div>
          </div>
        </div>
      )}
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

  // Warn if topic would end after quarter end
  const estEnd = form.startDate ? addWorkingDays(form.startDate, SIZES[form.size].days) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 24,
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: C.title, fontFamily: FONT_TITLE }}>
          {isEdit ? "Edit Topic" : "New Topic"}
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Title *</label>
          <input style={inp} value={form.title} autoFocus
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. PHNX appointment flow redesign" />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Description (optional)</label>
          <textarea style={{ ...inp, height: 64, resize: "vertical", lineHeight: 1.5 }}
            value={form.description || ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Goals, context, or notes…" />
        </div>

        {/* Team + Type */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Team</label>
            <select style={selInp} value={form.team} onChange={(e) => set("team", e.target.value)}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Type</label>
            <select style={selInp} value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="discovery">Discovery</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
        </div>

        {/* Size + Start date */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>T-shirt Size</label>
            <select style={selInp} value={form.size} onChange={(e) => set("size", e.target.value)}>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>{k} – {v.hours} · ~{v.days}d · {v.weeks}wk</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Start Date</label>
            <input type="date" style={inp}
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)} />
          </div>
        </div>

        {/* Estimated end + hint */}
        {form.startDate && (
          <div style={{ marginBottom: 14, fontSize: 12, color: C.muted }}>
            Estimated end:{" "}
            <strong style={{ color: C.text }}>{fmt(estEnd)}</strong>
            {" "}({SIZES[form.size].days} working days)
            <span style={{ color: C.dim, marginLeft: 8 }}>· Topics ideally end before the quarter closes.</span>
          </div>
        )}

        {/* Priority */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={form.priority}
              onChange={(e) => set("priority", e.target.checked)}
              style={{ accentColor: "#D29922", width: 14, height: 14 }} />
            <span>⭐ Mark as High Priority</span>
          </label>
        </div>

        {/* Owner */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Owner</label>
            <select style={selInp} value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              <option value="">— Unassigned —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {hasAnySupp && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Owner %</label>
              <input type="number" min={0} max={100} style={inp}
                value={form.ownerPercent}
                onChange={(e) => set("ownerPercent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
            </div>
          )}
        </div>

        {/* Supporter 1 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Supporter 1 (optional)</label>
            <select style={selInp} value={form.supporter1Id}
              onChange={(e) => {
                const val = e.target.value;
                set("supporter1Id", val);
                if (val && !form.supporter2Id) { set("ownerPercent", 50); set("supporter1Percent", 50); set("supporter2Percent", 0); }
                else if (!val) { set("supporter1Percent", 0); }
              }}>
              <option value="">— None —</option>
              {members.filter((m) => m.id !== form.ownerId && m.id !== form.supporter2Id).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {hasSupp1 && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Supporter 1 %</label>
              <input type="number" min={0} max={100} style={inp}
                value={form.supporter1Percent}
                onChange={(e) => set("supporter1Percent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
            </div>
          )}
        </div>

        {/* Supporter 2 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Supporter 2 (optional)</label>
            <select style={selInp} value={form.supporter2Id}
              onChange={(e) => {
                const val = e.target.value;
                set("supporter2Id", val);
                if (val && !form.supporter1Id) { set("ownerPercent", 50); set("supporter2Percent", 50); set("supporter1Percent", 0); }
                else if (val && form.supporter1Id) { set("ownerPercent", 34); set("supporter1Percent", 33); set("supporter2Percent", 33); }
                else if (!val) { set("supporter2Percent", 0); }
              }}>
              <option value="">— None —</option>
              {members.filter((m) => m.id !== form.ownerId && m.id !== form.supporter1Id).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {hasSupp2 && (
            <div style={{ width: 100 }}>
              <label style={lbl}>Supporter 2 %</label>
              <input type="number" min={0} max={100} style={inp}
                value={form.supporter2Percent}
                onChange={(e) => set("supporter2Percent", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
            </div>
          )}
        </div>

        {hasAnySupp && totalPct !== 100 && (
          <div style={{ fontSize: 12, color: "#D29922", marginBottom: 12 }}>
            ⚠ Percentages should total 100% (currently {totalPct}%)
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <button onClick={onClose} style={{ ...ghost, padding: "7px 16px" }}>Cancel</button>
          <button onClick={onSave}
            style={{ ...btn(), opacity: form.title.trim() ? 1 : 0.4, cursor: form.title.trim() ? "pointer" : "default" }}
            disabled={!form.title.trim()}>
            {isEdit ? "Save Changes" : "Add Topic"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,    setTab]    = useState("topics");
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Quarter navigation state — defaults to the current calendar quarter
  const [quarter, setQuarter] = useState(getCurrentQuarter);

  const [_init]    = useState(() => loadInitialState());
  const [members,  setMembers]  = useState(_init?.members  || INIT_MEMBERS);
  const [vacation, setVacation] = useState(_init?.vacation || { m1: 0, m2: 0, m3: 0, m4: 0 });
  const [topics,   setTopics]   = useState(_init?.topics   || []);

  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(makeEmptyForm);

  const [jiraConfig,     setJiraConfig]     = useState(() => loadJiraConfig());
  const [showJiraSetup,  setShowJiraSetup]  = useState(false);
  const [jiraReviewTopic, setJiraReviewTopic] = useState(null);

  // Quarter-derived values
  const { year, q }    = quarter;
  const qWorkingDays   = useMemo(() => getQuarterWorkingDays(year, q), [year, q]);
  const qLabel         = quarterLabel(year, q);
  const qHolidays      = useMemo(() => getHolidaysInQuarter(year, q), [year, q]);

  // Persist to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, members, vacation })); } catch {}
  }, [topics, members, vacation]);

  // Theme persistence
  useEffect(() => {
    try { localStorage.setItem("careco-theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark]);
  useEffect(() => {
    try { const s = localStorage.getItem("careco-theme"); if (s === "light") setIsDark(false); } catch {}
  }, []);

  const handleShare = useCallback(() => {
    const encoded = btoa(JSON.stringify({ topics, members, vacation }));
    const url = `${window.location.href.split("#")[0]}#${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    }).catch(() => { window.location.hash = encoded; });
  }, [topics, members, vacation]);

  const openAdd  = () => { setForm(makeEmptyForm()); setEditId(null); setShowForm(true); };
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

  const deleteTopic     = (id) => setTopics((ts) => ts.filter((t) => t.id !== id));
  const updateTopicDate = useCallback((id, newDate) => {
    setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, startDate: newDate } : t)));
  }, []);

  const handleJiraCreated = useCallback((topicId, jiraKey, jiraUrl) => {
    setTopics(ts => ts.map(t => t.id === topicId ? { ...t, jiraKey, jiraUrl } : t));
    setJiraReviewTopic(null);
  }, []);

  const openJiraCreate = (topic) => {
    if (!jiraConfig) { setShowJiraSetup(true); }
    else { setJiraReviewTopic(topic); }
  };

  // Capacity
  const capacities = useMemo(() => {
    return members.map((m) => {
      const availableDays = qWorkingDays - (vacation[m.id] || 0);
      const allocatedDays = topics.reduce((sum, t) => {
        const sd = SIZES[t.size]?.days || 0;
        const hasSupp = !!(t.supporter1Id || t.supporter2Id);
        if (t.ownerId      === m.id) return sum + sd * (hasSupp ? t.ownerPercent / 100 : 1);
        if (t.supporter1Id === m.id) return sum + sd * (t.supporter1Percent / 100);
        if (t.supporter2Id === m.id) return sum + sd * (t.supporter2Percent / 100);
        return sum;
      }, 0);
      return { ...m, availableDays, allocatedDays, remaining: availableDays - allocatedDays };
    });
  }, [members, vacation, topics, qWorkingDays]);

  // Timeline
  const timelineTopics = useMemo(() => {
    return topics
      .filter((t) => t.startDate)
      .map((t) => ({ ...t, endObj: addWorkingDays(t.startDate, SIZES[t.size]?.days || 5) }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [topics]);

  const TABS = ["topics", "team", "capacity", "timeline"];

  return (
    <div data-theme={isDark ? "dark" : "light"} style={{
      fontFamily: FONT_BODY,
      background: C.bg, minHeight: "100vh", color: C.text,
    }}>
      <style>{THEME_CSS}</style>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px", color: C.title, fontFamily: FONT_TITLE }}>CareCo Design Planner</span>
          <span style={{ fontSize: 12, color: C.dim, marginLeft: 2 }}>{qLabel}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle isDark={isDark} onToggle={() => setIsDark((d) => !d)} />
            <button onClick={handleShare}
              style={{ ...btn(copied ? C.green : C.surfaceAlt, copied ? "#fff" : C.muted), border: `1px solid ${copied ? C.green : C.border}`, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              {copied ? "✓ Link copied!" : "🔗 Share plan"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...ghost,
              background:  tab === t ? C.surfaceAlt : "transparent",
              color:       tab === t ? C.text       : C.muted,
              borderColor: tab === t ? C.dim        : "transparent",
              padding: "5px 14px", fontSize: 13, fontWeight: 500, textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
        {tab === "topics"   && <TopicsTab   topics={topics} members={members} onAdd={openAdd} onEdit={openEdit} onDelete={deleteTopic} onJira={openJiraCreate} />}
        {tab === "team"     && <TeamTab     members={members} setMembers={setMembers} vacation={vacation} setVacation={setVacation} qWorkingDays={qWorkingDays} qLabel={qLabel} qHolidays={qHolidays} />}
        {tab === "capacity" && <CapacityTab capacities={capacities} topics={topics} members={members} onEdit={openEdit} qWorkingDays={qWorkingDays} qLabel={qLabel} />}
        {tab === "timeline" && <TimelineTab timelineTopics={timelineTopics} members={members} onUpdateTopicDate={updateTopicDate} onEdit={openEdit}
          quarter={quarter}
          onPrevQuarter={() => setQuarter((q) => prevQuarter(q.year, q.q))}
          onNextQuarter={() => setQuarter((q) => nextQuarter(q.year, q.q))} />}
      </div>

      {showForm && (
        <TopicFormModal form={form} setForm={setForm} members={members}
          onSave={saveTopic} onClose={() => setShowForm(false)} isEdit={!!editId} />
      )}

      {showJiraSetup && (
        <JiraSetupModal
          onSave={(cfg) => { setJiraConfig(cfg); setShowJiraSetup(false); }}
          onClose={() => setShowJiraSetup(false)}
        />
      )}

      {jiraReviewTopic && (
        <JiraReviewModal
          topic={jiraReviewTopic}
          members={members}
          jiraConfig={jiraConfig}
          onClose={() => setJiraReviewTopic(null)}
          onCreated={handleJiraCreated}
        />
      )}
    </div>
  );
}
