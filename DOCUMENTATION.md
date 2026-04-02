# CareCo Design Planner — Product Documentation

**Version:** v1.0-stable
**Date:** April 2026
**Owner:** David Brandau, Senior Design Team Manager

---

## What it is

A self-contained, single-file web application for planning and visualising design work across quarters. No backend, no installation — just open the HTML file in a browser. Data is saved automatically to the browser's local storage and can also be shared via a URL link.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 (hooks) |
| Build tool | esbuild (JSX → minified JS, bundled into the HTML) |
| Styling | Inline React styles + CSS custom properties for theming |
| Fonts | Montserrat (titles), Roboto (body) via Google Fonts |
| Persistence | `localStorage` (key: `careco-planner-v1`) + `?data=` query-param sharing + optional GitHub Gist auto-backup |
| Hosting | GitHub Pages — `main` branch root of `david-vibedesign/careco-design-planner` |

The deliverable is always **one self-contained HTML file** (`index.html` / `carecos-design-planner.html`). The JSX source lives alongside it as `carecos-design-planner.jsx`.

---

## Features

### Topics tab
- Add, edit, and delete design topics (discovery or delivery type)
- Each topic has: title, optional description, team, type, T-shirt size, start date, priority flag, owner, and up to 2 supporters with split percentages
- **T-shirt sizes:** XS (0–4h), S (12h), M (20h / 1 wk), L (40h / 2 wk), XL (80h+ / 4 wk), XXL (160h+ / 8 wk)
- **Filter bar:** filter by All, ⭐ Priority, or team (CareCo, PHNX, NEMO, KITN)
- **Size filter:** click any size badge in the summary row to filter by that size; click again to clear
- **Inline delete confirmation:** clicking ✕ shows a "Delete 'X'? Cancel / Yes, delete" prompt before removing
- Topic titles are clickable anywhere in the app to open the edit modal

### Team tab
- Add and remove team members with **+ Add Designer**
- Each member: name (free text), role (dropdown), vacation days for the selected quarter, colour
- **Roles available:** Content Design, User Research, Product Design, Team Management
- **Colour picker:** 10 colours in 2 rows of 5 — click the colour dot to open the swatch panel
- **Drag to reorder** team members via the ⠿ handle
- New members are added to the top of the list
- Shows NL public holidays for the selected quarter (2025–2027 covered)

### Capacity tab
- Per-member capacity bar showing allocated vs. available days for the selected quarter
- Overallocation shown in red; free capacity in green
- Lists each person's assigned topics with owner/supporter role and day count
- Topic titles are clickable to open the edit modal

### Timeline tab
- Gantt-style horizontal bar chart for all topics with start dates
- **Quarter navigation:** ← / → buttons to move between quarters
- **Sort options:** Date (default), Owner, Team
- **TODAY marker:** single amber vertical line with "TODAY" label in the month header row
- Bars are **draggable** to reschedule a topic's start date
- Bar colour reflects the owner's colour (with supporter stripes)
- Filters automatically to topics overlapping the selected quarter

### Global features
- **Light / dark mode toggle** with animated 🌙 / ☀️ icon and ripple effect — preference saved to localStorage
- **Share plan button:** encodes all data as a URL hash; anyone with the link sees the same state
- **Auto-save:** every change is written to localStorage — no save button needed
- **Multi-quarter navigation:** the selected quarter flows through Team, Capacity, and Timeline simultaneously

---

## Design decisions

### Data stays in the browser
All data lives in the user's browser localStorage under the key `careco-planner-v1`. Deploying a new version to GitHub Pages **never overwrites this data** — the app simply reads it on load. A URL hash takes priority over localStorage (useful for sharing).

### Topic dates are unrestricted
Topics can start and end outside the current quarter. The form shows a soft hint ("Topics ideally end before the quarter closes") but does not enforce it. New topics default to today's date.

### Colour system
CSS custom properties (`--c-*`) on a `data-theme` attribute drive the entire theme. A `--c-title` variable switches between `#00264C` (light mode) and `#E6EDF3` (dark mode) so Montserrat titles are always readable.

---

## File structure (repo root)

```
index.html                    ← built, self-contained app (served by GitHub Pages)
carecos-design-planner.jsx    ← React source (edit this, then rebuild)
DOCUMENTATION.md              ← this file
README.md                     ← brief GitHub readme
```

---

## How to rebuild after editing the source

These commands require Node.js and the esbuild dependency to be installed in a working directory.

```bash
# 1. Bundle the JSX
./node_modules/.bin/esbuild entry.jsx \
  --bundle --outfile=bundle.js \
  --loader:.jsx=jsx --jsx=automatic --minify

# 2. Wrap in HTML shell
python3 wrap.py   # or use the Cowork session which does this automatically

# 3. Copy output to repo and push
cp carecos-design-planner.html index.html
git add index.html carecos-design-planner.jsx
git commit -m "your message"
git push origin main
```

---

## How to restore this version from git

This stable checkpoint is tagged **`v1.0-stable`** in the repository.

```bash
# View all tags
git tag

# Check out this exact version (read-only)
git checkout v1.0-stable

# Or hard-reset your main branch to this tag (destructive — use carefully)
git checkout main
git reset --hard v1.0-stable
git push origin main --force
```

---

## NL public holidays covered

2025, 2026, and 2027 — including New Year's Day, Good Friday, Easter Monday, King's Day, Liberation Day, Ascension Day, Whit Monday, Christmas Day, and Boxing Day.

---

## Jira Epic creation

The **⚡ Jira** button on each topic card generates a ready-to-paste Claude prompt for creating a Jira Epic in the PDP project. No API token is required — the prompt works in any Claude interface that has Jira connected (Cowork, Claude.ai with Jira integration, Claude Code).

### How it works

1. Click ⚡ Jira on a topic — a modal opens showing the full generated prompt
2. Click **Copy prompt** (or click the text area to select all, then Cmd+C)
3. Paste into Claude — the prompt guides through: finding a parent Initiative on the correct feature team board, confirming all fields, then creating the Epic via the Jira REST API

### What's pre-filled in every prompt

| Field | Value |
|-------|-------|
| Jira site | doctolib.atlassian.net |
| Project | PDP (ID: 11993) |
| Issue type | Epic (ID: 10000) |
| Domain | CARE COOPERATION (customfield_12263, option 17813) |
| Category | CARE COOPERATION (customfield_11292, option 20030) |
| Tempo Team | DESIGN – Cooperative Care (customfield_10911, value: 28 as Long) |
| Feature Team | PHNX / NEMO / KITN based on topic team (customfield_12237) |

Topic-specific fields (summary, description, assignee, collaborators, start date, due date, label) are pulled from the topic automatically.

### Parent Initiative lookup

The parent of a PDP Epic lives on the **feature team board** (KITN, PHNX, or NEMO), not in PDP itself. The prompt instructs Claude to search the correct board based on the topic's team assignment.

### Known field quirks

- `customfield_10911` (Tempo Team) requires a **plain number** (`28`), not a JSON object — this is noted in the prompt
- Story points are not set via the API (not on the Epic creation screen in PDP); set manually in Jira after creation

---

## GitHub Gist auto-backup

The **☁ Connect** button in the header lets you link a private GitHub Gist as a persistent backup — useful if you switch browsers, clear localStorage, or want to access your plan from multiple machines.

### Setup

1. Go to https://github.com/settings/tokens and create a **Classic** Personal Access Token (PAT) with the `gist` scope only.
2. Click **☁ Connect** in the CareCo Design Planner header.
3. Paste your PAT into the token field.
4. Either paste an existing Gist ID, or click **Create new Gist** to auto-create a private one.
5. Click **Test connection** — the status should turn green.
6. Click **Save & connect** — the header pill will show **☁ Gist** and auto-save begins.

### How it works

Every change to topics, members, or vacation days triggers a debounced (4 s) `PATCH` to the GitHub Gist API. Two files are kept:

| File | Purpose |
|---|---|
| `careco-planner-latest.json` | The most recent save |
| `careco-planner-previous.json` | The save before that (one-version rollback) |

On startup, if the Gist contains a version newer than localStorage (by more than 10 seconds), a banner appears offering to load it. The PAT and Gist ID are stored in localStorage under the key `careco-gist-config`; they never leave the browser except in the API call to GitHub.

### Share Plan

**Share Plan** now encodes data as a `?data=` query parameter instead of a URL hash. This works correctly when pasted into Slack, Google Meet chat, email, or any other channel that may strip URL fragments. Old `#`-hash links are still supported for backward compatibility.

---

## Known constraints

- No user authentication — the app is fully public if the GitHub Pages URL is shared
- Data is browser-local without Gist backup; clearing browser data or switching browsers loses unsaved state (use ☁ Connect or Share Plan to back up)
- The GitHub PAT for Gist backup is stored in localStorage — anyone with access to your browser profile can read it; rotate the token if needed
- Fonts (Montserrat, Roboto) require an internet connection to load from Google Fonts; the app still works without them, falling back to system fonts
