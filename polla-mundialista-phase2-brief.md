# Polla Mundialista 2026 — Phase 2: Core Features

## Context
Phase 1 is complete: Vite + React + Tailwind v4 + Firebase Auth (Google sign-in) + Firestore are all working. The user can log in and sees a placeholder Dashboard. Now build the actual app.

## Overview of what to build
1. Football API integration service (fetch groups, matches, scores, knockout brackets — all from API)
2. Firestore sync (API → Firestore, with auto-polling)
3. Main Dashboard with navigation
4. Matches list page (grouped by matchday/group)
5. Prediction system (pick scores before kickoff) — uses `src/config/scoring.json` for all point values
6. Rules page — dynamically renders point values from `src/config/scoring.json`
7. Leaderboard page
8. Admin panel (sync controls, manual override, trigger point calculations)
9. Proper routing between all pages

## Design system (already in place)
- Dark theme, football aesthetic
- Fonts: Unbounded (headings), DM Sans (body) — loaded via Google Fonts
- Colors defined as CSS vars in @theme block in index.css:
  - `pitch` (#0a4d2e), `gold` (#d4a843), `surface` (#111318), `surface-card` (#1a1d24)
  - `text-primary` (#f0f2f5), `text-secondary` (#8b919a), `text-muted` (#5a6170)
  - `accent-red` (#e74c3c), `accent-blue` (#3498db), `border` (#2a2e37)
- Use these with Tailwind v4: `bg-[var(--color-surface-card)]`, `text-[var(--color-gold)]`, etc.
- Mobile-first, rounded cards, subtle borders, backdrop-blur
- Flags from flagcdn.com: `https://flagcdn.com/w80/{iso2}.png` (e.g. `ar`, `br`, `ec`, `us`)

---

## Step 1: Football API integration

**No static `matches.json` file.** All match data — groups, fixtures, schedules, scores, and knockout brackets — comes from a free football API. This means knockout matches appear automatically as FIFA schedules them. No manual updates needed.

### Primary API: football-data.org (FREE tier)

- **Registration:** https://www.football-data.org/client/register (free, get API key instantly)
- **Free tier:** 10 requests/minute, covers World Cup (`WC` competition code)
- **Base URL:** `https://api.football-data.org/v4`
- **Auth header:** `X-Auth-Token: YOUR_API_KEY`

**Key endpoints:**

| Endpoint | What it gives you |
|---|---|
| `GET /v4/competitions/WC/matches` | ALL matches (group + knockout), dates, times, venues, scores, status |
| `GET /v4/competitions/WC/standings` | Group standings (tables) |
| `GET /v4/competitions/WC/teams` | All 48 teams with crests, codes, etc. |
| `GET /v4/competitions/WC` | Competition info, current matchday, season dates |

**Example match object from the API:**
```json
{
  "id": 391882,
  "utcDate": "2026-06-11T21:00:00Z",
  "status": "SCHEDULED",
  "matchday": 1,
  "stage": "GROUP_STAGE",
  "group": "GROUP_A",
  "homeTeam": { "id": 769, "name": "Mexico", "tla": "MEX", "crest": "https://..." },
  "awayTeam": { "id": 1048, "name": "South Africa", "tla": "RSA", "crest": "https://..." },
  "score": { "fullTime": { "home": null, "away": null } },
  "venue": "Estadio Azteca, Mexico City"
}
```

Status values from API: `SCHEDULED`, `TIMED`, `IN_PLAY`, `PAUSED`, `FINISHED`, `POSTPONED`, `CANCELLED`, `SUSPENDED`

### Create `src/services/footballApi.js`

```js
const API_BASE = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_DATA_API_KEY;

const headers = { 'X-Auth-Token': API_KEY };

export async function fetchAllMatches() {
  const res = await fetch(`${API_BASE}/competitions/WC/matches`, { headers });
  const data = await res.json();
  return data.matches; // Array of all group + knockout matches
}

export async function fetchStandings() {
  const res = await fetch(`${API_BASE}/competitions/WC/standings`, { headers });
  const data = await res.json();
  return data.standings; // Group tables
}

export async function fetchTeams() {
  const res = await fetch(`${API_BASE}/competitions/WC/teams`, { headers });
  const data = await res.json();
  return data.teams; // All 48 teams
}
```

### Flag code mapping

The API gives team `tla` codes (3-letter: MEX, BRA, ARG) but flagcdn.com uses ISO 2-letter codes. Create a mapping file `src/config/teamFlags.json`:

```json
{
  "MEX": "mx", "BRA": "br", "ARG": "ar", "FRA": "fr", "ESP": "es",
  "ENG": "gb-eng", "GER": "de", "POR": "pt", "NED": "nl", "BEL": "be",
  "CRO": "hr", "USA": "us", "CAN": "ca", "ECU": "ec", "COL": "co",
  "URU": "uy", "JPN": "jp", "KOR": "kr", "AUS": "au", "MAR": "ma",
  "SEN": "sn", "GHA": "gh", "CIV": "ci", "CPV": "cv", "KSA": "sa",
  "QAT": "qa", "IRN": "ir", "JOR": "jo", "SUI": "ch", "DEN": "dk",
  "SWE": "se", "NOR": "no", "SCO": "gb-sct", "POL": "pl", "CZE": "cz",
  "TUR": "tr", "AUT": "at", "ALG": "dz", "TUN": "tn", "RSA": "za",
  "EGY": "eg", "NZL": "nz", "PAR": "py", "HAI": "ht", "PAN": "pa",
  "CUW": "cw", "UZB": "uz", "BIH": "ba", "KVX": "xk",
  "BOL": "bo", "IRQ": "iq", "JAM": "jm", "COD": "cd",
  "ITA": "it", "WAL": "gb-wls", "NIR": "gb-nir"
}
```

Flag URL helper: `https://flagcdn.com/w80/${teamFlags[tla]}.png`

If the API returns a team not in the map (e.g., playoff winner not yet added), fall back to the team `crest` URL from the API itself, or show a placeholder.

### Fallback: openfootball/worldcup.json (no API key needed)

If football-data.org is down or the user doesn't register for an API key, the app can fall back to:
- **URL:** `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`
- Completely free, no API key, public domain
- Less structured but has match fixtures and scores
- Community-maintained — updates may lag by hours

Store API choice in `.env`:
```
VITE_FOOTBALL_DATA_API_KEY=your_key_here
```

## Step 2: Firestore sync service

Instead of a static seed script, create `src/services/matchSync.js` that keeps Firestore in sync with the API.

### How it works

1. **Initial sync (admin triggers via button OR first app load):**
   - Fetch all matches from football-data.org
   - Write each match to Firestore `matches/{apiMatchId}` with normalized fields:
     ```js
     {
       apiId: 391882,              // from API
       matchday: 1,
       stage: "group",             // normalized: "group" | "round_of_32" | "round_of_16" | "quarterfinals" | "semifinals" | "third_place" | "final"
       group: "A",                 // null for knockout matches
       teamA: "Mexico",
       teamB: "South Africa",
       tlaA: "MEX",
       tlaB: "RSA",
       flagA: "mx",                // mapped from tla
       flagB: "za",
       date: Timestamp,            // Firestore Timestamp from utcDate
       venue: "Estadio Azteca, Mexico City",
       scoreA: null,               // real score (full time only)
       scoreB: null,
       status: "upcoming",         // normalized: "upcoming" | "live" | "finished"
       lastSyncedAt: Timestamp
     }
     ```
   - Use batch writes for efficiency

2. **Auto-polling (runs automatically, no admin action needed):**
   - Uses `setInterval` based on `scoring.json` config:
     - Match day: every `scoreSync.pollIntervalMatchDayMinutes` minutes
     - Off day: every `scoreSync.pollIntervalOffDayMinutes` minutes
   - Fetches matches from API, compares with Firestore
   - Updates any match where score or status has changed
   - **Only admin clients write** to Firestore (non-admin clients read via `onSnapshot`)
   - When a match transitions to `"finished"`, auto-triggers point calculation

3. **Knockout matches appear automatically:**
   - As the tournament progresses, FIFA populates knockout fixtures in the API
   - The next auto-poll picks them up and writes them to Firestore
   - No manual intervention needed — Round of 32, Round of 16, QF, SF, Final all appear on their own
   - Live match predictions become available automatically per the timing rules in `scoring.json`

### Stage normalization mapping
```js
const STAGE_MAP = {
  'GROUP_STAGE': 'group',
  'LAST_32': 'roundOf32',
  'LAST_16': 'roundOf16',
  'QUARTER_FINALS': 'quarterfinals',
  'SEMI_FINALS': 'semifinals',
  'THIRD_PLACE': 'thirdPlace',
  'FINAL': 'final'
};

const STATUS_MAP = {
  'SCHEDULED': 'upcoming',
  'TIMED': 'upcoming',
  'IN_PLAY': 'live',
  'PAUSED': 'live',       // halftime
  'FINISHED': 'finished',
  'POSTPONED': 'upcoming',
  'CANCELLED': 'cancelled',
  'SUSPENDED': 'live'
};
```

### Important: 90-minute scores only
For knockout matches, the API returns `score.fullTime`, `score.extraTime`, and `score.penalties`. **Only use `score.fullTime`** for prediction scoring purposes. The app stores the 90-min score for point calculation. You can optionally display extra time / penalty info as additional context, but it doesn't affect prediction points.

## Step 3: App layout and navigation

Create `src/components/Layout.jsx` — a shell with:
- **Bottom tab bar** (mobile) with 4-5 tabs:
  - ⚽ Partidos (matches)
  - 📝 Predicciones (my predictions)
  - 🏆 Tabla (leaderboard)
  - 📜 Reglas (rules)
  - ⚙️ Admin (only visible if user.isAdmin === true)
- Show user avatar (photoURL) and name in a top bar
- Logout option in top bar (dropdown or slide-out)
- Active tab highlighted with gold accent

Use react-router-dom for navigation between tabs. Routes:
- `/` → redirects to `/matches`
- `/matches` → MatchesPage
- `/predictions` → PredictionsPage
- `/leaderboard` → LeaderboardPage
- `/rules` → RulesPage
- `/admin` → AdminPage (protected, admin only)

## Step 4: Matches page

`src/pages/MatchesPage.jsx`

- Fetch all matches from Firestore, ordered by date
- Group by matchday or date
- Each match card shows:
  - Date & time (formatted nicely, e.g. "Mié 11 Jun · 21:00")
  - Team A flag + name vs Team B flag + name
  - If finished: show real score with a "finished" badge
  - If upcoming: show a "Predict" button or the user's existing prediction
  - If live: show "EN VIVO" badge with pulsing red dot
  - Venue name in small text
- Filter/tabs by group (A, B, C... L) or "All"
- Status badge colors: upcoming = blue, live = red pulse, finished = muted

**Match card design:**
```
┌─────────────────────────────────┐
│ Grupo A · Mié 11 Jun · 21:00   │
│                                 │
│  🇲🇽 Mexico    [ 2 ] - [ 1 ]  🇿🇦 South Africa │
│                                 │
│  Estadio Azteca, Mexico City    │
│  ✅ Finalizado                  │
└─────────────────────────────────┘
```

## Step 5: Prediction system

`src/pages/PredictionsPage.jsx`

- Show all upcoming matches with score input fields
- For each match, two number inputs (0-99) for teamA and teamB predicted scores
- **Lock rule**: predictions lock when `match.date <= now`. After that, show the prediction as read-only
- Save prediction to Firestore: `predictions/{docId}` where docId = `{userId}_{matchId}`
- Show existing predictions if they exist
- Auto-save on change (debounced) or explicit "Guardar" button
- Visual states:
  - Upcoming + no prediction: empty inputs, prompt to predict
  - Upcoming + has prediction: filled inputs, editable
  - Locked (match started): show prediction read-only, maybe with lock icon
  - Finished: show prediction + real result + points earned

### Scoring system — IMPORTANT

**All point values MUST be read from `src/config/scoring.json`.** Never hardcode point values anywhere. Import the config and reference the values at runtime.

The scoring uses a **three-tier system** — only the highest applicable tier counts per match:

```js
import scoring from '@/config/scoring.json';

function calculateMatchPoints(predicted, real, stage, round) {
  // Determine which config section to use
  let pointsConfig;
  if (stage === 'group') {
    pointsConfig = scoring.groupStage.matchResult;
  } else if (round) {
    // For pre-tournament bracket predictions (knockout)
    pointsConfig = scoring.knockout.preTournamentMatchResult[round];
  }
  // For live match predictions (knockout), always use:
  // pointsConfig = scoring.knockout.liveMatchResult;

  // Tier 3: Exact score (highest)
  if (predicted.scoreA === real.scoreA && predicted.scoreB === real.scoreB) {
    return pointsConfig.exactScore;
  }

  // Tier 2: Correct outcome + correct goal difference
  const predictedResult = Math.sign(predicted.scoreA - predicted.scoreB);
  const realResult = Math.sign(real.scoreA - real.scoreB);
  const predictedDiff = Math.abs(predicted.scoreA - predicted.scoreB);
  const realDiff = Math.abs(real.scoreA - real.scoreB);

  if (predictedResult === realResult && predictedDiff === realDiff) {
    return pointsConfig.correctOutcomeAndGoalDifference;
  }

  // Tier 1: Correct outcome only (1X2)
  if (predictedResult === realResult) {
    return pointsConfig.correctOutcome;
  }

  // No points
  return 0;
}
```

### Two prediction modes

**Mode 1: Pre-Tournament Predictions** — Full bracket submitted before June 11. Includes:
- All 72 group stage match scores
- Group final standings (1st–4th per group)
- Knockout bracket (which teams advance each round + match scores)
- Champion, Runner-up, 3rd place
- Golden Boot (top scorer name) and Golden Ball (best player name)

Pre-tournament predictions **lock when the first match kicks off**.

**Mode 2: Live Match Predictions** (knockout stage only) — Available for every knockout match.
- Opens 24 hours before kickoff (configurable: `scoring.liveMatchTiming.opensBeforeKickoffHours`)
- Locks 1 hour before kickoff (configurable: `scoring.liveMatchTiming.locksBeforeKickoffHours`)
- Uses **flat scoring** — same points for every round: `scoring.knockout.liveMatchResult`
- Purpose: everyone can play knockout matches even if their pre-tournament bracket was wrong
- A user can earn points from **both modes** on the same match (they stack independently)

### 90-minute rule for knockout matches
Only the score after 90 minutes counts. Extra time and penalties do NOT affect the prediction score. If a match is level after 90 min, the prediction result is a draw.

**Prediction card (finished match):**
```
┌─────────────────────────────────────┐
│ 🇲🇽 Mexico vs South Africa 🇿🇦      │
│                                     │
│ Tu predicción:  2 - 1               │
│ Resultado real: 2 - 1   ✨ +3 pts  │
│                                     │
│ ● Resultado exacto                  │
└─────────────────────────────────────┘
```

## Step 6: Rules page

`src/pages/RulesPage.jsx`

This page **dynamically renders all point values from `src/config/scoring.json`**. No hardcoded numbers anywhere. If the family edits `scoring.json`, the rules page reflects new values on next load.

The page should clearly explain:
1. The three-tier match scoring system (outcome → goal difference → exact score)
2. Group stage standings points
3. Knockout team advancement points (escalating by round)
4. Knockout match result points (escalating by round for pre-tournament, flat for live)
5. Tournament outcome predictions (champion, runner-up, 3rd)
6. Individual awards (Golden Boot, Golden Ball — winner only, no 2nd/3rd)
7. Live match prediction rules (when they open, when they lock, flat scoring)
8. The 90-minute rule for knockout matches
9. That both modes stack on the same match

Use the app's design system. Tables and cards work well. Make it mobile-friendly. Language: Spanish (this is a family app for Spanish speakers, but keep code in English).

See `PREDICTION_APP_RULES.md` for the full detailed rules specification.

## Step 7: Leaderboard page

`src/pages/LeaderboardPage.jsx`

- Fetch all users from `users/` collection, ordered by totalPoints descending
- Show rank, avatar, name, total points
- Highlight the current user's row
- Top 3 get special styling (gold/silver/bronze)
- Show position change indicators if possible (▲▼)

**Leaderboard design:**
```
┌──────────────────────────────────┐
│  🏆  Tabla de Posiciones         │
├──────────────────────────────────┤
│  1. 🥇  Pablo R.        42 pts  │
│  2. 🥈  María L.        38 pts  │
│  3. 🥉  Carlos R.       35 pts  │
│  4.     Ana M.           31 pts  │ ← highlighted if current user
│  5.     Luis R.          28 pts  │
└──────────────────────────────────┘
```

## Step 8: Admin panel

`src/pages/AdminPage.jsx`

**Only accessible if the logged-in user has `isAdmin: true` in Firestore.**

Features:
1. **Sync matches from API** button — fetches all matches from football-data.org and writes/updates to Firestore. Run this on first setup and whenever you want to force-refresh.
2. **Auto-sync status** — Shows: last sync time, next poll in X minutes, number of matches synced. Toggle to pause/resume auto-polling.
3. **Manual score override** — list of matches with status filter (upcoming/live/finished). For each match:
   - Input fields for real scoreA and scoreB
   - Dropdown to change status (upcoming → live → finished)
   - "Save result" button
   - Use this only if the API is wrong or slow — overrides API data
4. **Calculate points** — when a match result is saved (either via auto-sync or manual):
   - Query all predictions for that matchId
   - Calculate points for each prediction using the three-tier system from `scoring.json`
   - Update each prediction doc with pointsEarned
   - Recalculate totalPoints for each affected user
   - This should happen automatically when admin saves a result

**Making yourself admin:** After first login, go to Firebase Console → Firestore → users collection → find your document → edit `isAdmin` to `true`.

## Step 9: (Merged into Steps 1 & 2)

The API integration and auto-polling are fully covered in Steps 1 and 2 above. Summary:
- **Step 1** defines the API service (`src/services/footballApi.js`) and endpoints
- **Step 2** defines the sync service (`src/services/matchSync.js`) with auto-polling, smart intervals, admin-only writes, and automatic point calculation on match finish
- The Admin panel (Step 8) provides manual override and sync controls as fallback

## Step 10: Update App.jsx routing

```jsx
<Routes>
  <Route element={<Layout />}>
    <Route path="/" element={<Navigate to="/matches" />} />
    <Route path="/matches" element={<MatchesPage />} />
    <Route path="/predictions" element={<PredictionsPage />} />
    <Route path="/leaderboard" element={<LeaderboardPage />} />
    <Route path="/rules" element={<RulesPage />} />
    <Route path="/admin" element={<AdminPage />} />
  </Route>
</Routes>
```

Layout uses `<Outlet />` for the content area.

---

## Important implementation notes

1. **Single source of truth for scoring:** All point values come from `src/config/scoring.json`. The scoring engine and the rules page both import this file. Never hardcode point values.

2. **Single source of truth for match data:** All match data comes from football-data.org API. No static JSON files for fixtures. Firestore is the cache layer — synced from the API automatically.

3. **Firestore reads**: Use `onSnapshot` for real-time updates on matches and leaderboard. Use `getDocs` for one-time reads where real-time isn't needed.

4. **Timestamps**: The API returns UTC dates. Convert to Firestore Timestamps when syncing. Compare with `new Date()` for lock logic.

5. **Batch writes**: When syncing matches or calculating points, use Firestore batch writes to update everything atomically.

6. **Mobile-first**: Bottom tab bar should be fixed at bottom, ~60px height. Content should scroll above it. On tablet/desktop, can optionally move nav to a sidebar.

7. **Loading states**: Show skeleton cards while data loads. Never show a blank screen.

8. **Error handling**: Wrap Firestore and API calls in try/catch. Show toast-style error messages. If the API is unreachable, show cached Firestore data with a "last updated X min ago" note.

9. **Flag images**: Use `https://flagcdn.com/w80/{code}.png` with the TLA→ISO mapping from `src/config/teamFlags.json`. If a team isn't in the map, fall back to the `crest` URL from the API. Add `loading="lazy"` to flag images.

10. **Responsive card grid**: Single column on mobile, 2 columns on tablet, 3 on desktop.

11. **No push notifications**: This is a web page only, not a native app.

12. **API key security**: The football-data.org free tier API key is low-risk (read-only, free), but still store it in `.env` and don't commit it to git. Add `VITE_FOOTBALL_DATA_API_KEY` to `.env.example`.

---

## File reference

| File | Purpose |
|---|---|
| `src/config/scoring.json` | Single source of truth for all point values and polling intervals. Family edits this to change scoring. |
| `src/config/teamFlags.json` | Maps API team codes (TLA) to flagcdn.com ISO codes. Add new teams here if needed. |
| `src/services/footballApi.js` | Fetches data from football-data.org (matches, standings, teams). |
| `src/services/matchSync.js` | Auto-polls the API, syncs to Firestore, triggers point calculations. |
| `.env` | Stores `VITE_FOOTBALL_DATA_API_KEY`. Not committed to git. |
| `PREDICTION_APP_RULES.md` | Detailed rules spec for the scoring system. Reference for developers. |
| `polla-mundialista-phase2-brief.md` | This file. The build plan. |
