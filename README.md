# Sleep Debt

Personal sleep-debt and impairment tracker. Parses your Apple Health export
locally in the browser, computes cumulative sleep debt against the published
literature, and translates current impairment into beer- and hours-awake
equivalents. Logs medications/substances and surfaces correlations between
what you took and how you slept.

## Stack

- **Hosting:** Vercel (static, free tier)
- **Framework:** Next.js 14 (App Router, `output: 'export'`) — pure static
- **Storage:** IndexedDB via Dexie. Single-device, never leaves the browser.
- **Auth:** None. The deployment URL is the secret.
- **Privacy:** the export.xml is parsed in a Web Worker, persisted only in
  IndexedDB on your device. Nothing is sent to any server.

## Deploy

One command, from this directory:

```bash
npx vercel --prod
```

You'll get a URL like `https://sleep-debt-<hash>.vercel.app`. Open it on your
phone in Safari → Share → "Add to Home Screen". It runs as a standalone app.

## Local dev

```bash
npm install
npm run dev
```

## Importing data

On iPhone: **Health → profile picture (top right) → Export All Health Data**.
You'll get an `export.zip` (~10–500 MB). AirDrop it to yourself, then in the
app tap "Import" and pick the zip. Parsing runs in a Web Worker so the main
thread stays responsive.

The "Refresh" button re-parses the *last* export you uploaded — Apple doesn't
expose live HealthKit to web apps, so re-running an export and re-uploading is
the only way to pick up new nights.

## Math

All literature-derived constants live in [`src/lib/sleep-science.ts`](src/lib/sleep-science.ts)
with inline citations. Toggle "Show raw equations" in Settings to audit the
current values.

Sources used:
- Dawson & Reid (1997) — 17h wake ≈ 0.05% BAC, 24h ≈ 0.10%.
- Van Dongen et al. (2003) — chronic restriction PVT equivalence.
- Belenky et al. (2003) — partial adaptation, hence the debt-age decay.
- Roehrs & Roth (2008) — diminishing returns on recovery sleep.

## Sleep-day definition

A sleep session is assigned to the calendar date it ended on. Internally we
roll any session starting at or after **18:00 local** onto the next calendar
day. Configurable in Settings.
