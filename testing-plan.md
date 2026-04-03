# Polla Mundialista 2026 — Testing Plan

A manual testing guide covering every feature of the app. Run through each section after any significant change.

---

## 0. Setup & Test Accounts

### Create test users
1. Open the app in two different browsers (or one normal + one incognito).
2. Sign in with a different Google account in each — the account picker will always appear thanks to `prompt: 'select_account'`.
3. Designate one account as **Admin** (set `isAdmin: true` in Firestore → `users/{uid}`).
4. Use the second account as a **regular user** to test the player perspective.

### Firestore mock data — Matches
The app reads from the `matches` collection. To test without the real football API, manually create documents in Firestore with this shape:

```json
{
  "stage": "group",
  "group": "A",
  "matchday": 1,
  "teamA": "Mexico",   "tlaA": "MEX",  "flagA": "mx",
  "teamB": "USA",      "tlaB": "USA",  "flagB": "us",
  "date": "<Timestamp — a future date>",
  "status": "scheduled",
  "scoreA": null,
  "scoreB": null,
  "venue": "Estadio Azteca",
  "pointsCalculated": false
}
```

**Minimum viable dataset for full testing:**
- 6 matches per group × 2 groups (A and B) = 12 group matches (enough to test standings + best-3rd logic)
- 2 knockout matches with `stage: "roundOf32"` — set `tlaA`/`tlaB` on one but leave the other with both null to test availability logic

**Status values to test with:** `scheduled`, `live`, `finished`, `cancelled`

---

## 1. Authentication

| What to test | How |
|---|---|
| Login always shows account picker | Sign out → sign in again → Google popup should ask which account |
| First login creates user in Firestore | After first login, check `users/{uid}` was created with `totalPoints: 0` |
| Admin sees Admin tab | Set `isAdmin: true` on the user doc → reload → Admin tab should appear |
| Non-admin does NOT see Admin tab | Regular user should only see 4 tabs |
| Sign out works | Tap avatar → Cerrar sesión → should return to login screen |

---

## 2. Navigation & Default Route

| What to test | How |
|---|---|
| Default tab is Fixture | Open app fresh → should land on `/pronostico` (Fixture tab) |
| 4 tabs visible for regular users | Fixture, Predicciones, Tabla, Reglas |
| 5 tabs for admin | Same + Admin |
| Unknown URL redirects to Fixture | Navigate to `/anything-random` → should redirect to `/pronostico` |

---

## 3. Fixture Page — Group Stage (tab: Grupos)

### 3a. Score input
- [ ] Enter scores for a match → card border turns green (pitch color)
- [ ] Winning side gets gold highlight, losing side is normal
- [ ] Draw → both sides get subtle blue highlight
- [ ] "Guardando..." appears top-right while saving, then disappears
- [ ] Scores persist after page reload (saved to Firestore)
- [ ] Inputs are disabled when tournament is locked (first match date has passed)

### 3b. Group standings
- [ ] Standings update in real time as you enter scores
- [ ] Points calculated correctly: Win=3, Draw=1, Loss=0
- [ ] 🥇 badge on 1st place, 🥈 on 2nd
- [ ] ✦ (blue) badge on best 3rd place teams — requires entering scores for multiple groups
- [ ] Goal difference and goals for used as tiebreakers

### 3c. Best 3rd place logic
- Enter results for all groups to populate 3rd-place standings
- The top 8 third-place teams (by pts → gd → gf) should get the ✦ badge
- These 8 teams should populate `bp1–bp8` slots in the Round of 32

### 3d. Match card layout
- [ ] Each card shows: `Jornada X · día, DD mes HH:MM` on top row
- [ ] Real score shown top-right when match is `finished` or `live`
- [ ] Live matches show `🔴` prefix on score
- [ ] Card size is consistent across all group cards

---

## 4. Fixture Page — Eliminatorias (tab: Eliminatorias)

### 4a. Round of 32 population
- [ ] R32 bracket shows "Por definir" slots until groups are predicted
- [ ] After entering all group scores, bracket auto-populates with predicted 1st/2nd/best-3rd
- [ ] Cards show date/hour from the corresponding Firestore roundOf32 matches (by index order)

### 4b. Knockout score input
- [ ] Enter score for a R32 match → winner auto-highlighted in gold
- [ ] Tiebreaker section ONLY appears when scores are equal (e.g. 2-2)
- [ ] Cannot click a team to pick winner unless scores are tied
- [ ] "Guardando..." appears when saving knockout scores
- [ ] Winner cascades to the next round (R16 slot populates automatically)

### 4c. Round progression
- [ ] R16 tab locked with warning until all R32 picks are complete
- [ ] QF locked until R16 complete, and so on
- [ ] 3rd place match shows the two SF losers
- [ ] Final shows the two SF winners

### 4d. Tournament lock
- Change the first group match date in Firestore to a past timestamp
- [ ] All inputs should become disabled
- [ ] Lock icon (🔒) should appear on knockout cards

---

## 5. Fixture Page — Premios (tab: Premios)

- [ ] Shows predicted Champion, Runner-up, 3rd Place derived from bracket
- [ ] Shows "Por definir" placeholders if bracket is incomplete
- [ ] Golden Boot and Golden Ball text inputs accept any player name
- [ ] Saved values persist after reload
- [ ] Inputs disabled when tournament is locked

---

## 6. Predictions Page — Live Knockout

### 6a. Availability logic
- Create a knockout match in Firestore **with** `tlaA` and `tlaB` set → should appear with enabled inputs
- Create one **without** teams → card shows "Disponible cuando se definan los equipos" with disabled inputs

### 6b. Lock timing
- Set a match date to 30 minutes from now (via Firestore) → inputs should be disabled with 🔒
- Set date to 2 hours from now → inputs should be enabled

### 6c. Filter tabs
- **Próximos**: shows only matches from the current/next knockout stage (e.g. only R32 until all R32 are done, then only R16)
- **Finalizados**: shows only matches with `status: "finished"`
- **Todos**: shows all knockout matches regardless of state

### 6d. Prediction flow
- [ ] Enter a score → "Guardando..." flashes per card
- [ ] Score persists after reload
- [ ] Real score shown on finished matches
- [ ] Points badge shown on finished matches that have scored predictions

### 6e. Pending badge
- [ ] Red badge in header shows count of available matches with no prediction yet
- [ ] Badge disappears when all available matches have predictions

---

## 7. Leaderboard

- [ ] Players ranked by `totalPoints` descending
- [ ] 🥇🥈🥉 medals for top 3
- [ ] Current user row highlighted in gold tint with "(tú)" label
- [ ] "Estás en el puesto #X de Y jugadores" subtitle

### Position change arrows
1. Note everyone's current rank in the leaderboard.
2. As Admin, trigger point calculation for a finished match.
3. Reload leaderboard.
4. Players who moved up show `▲N` in green; down show `▼N` in red; no change shows `—`.
5. Before any calculation has ever run → no arrow shown at all (no snapshot exists yet).

---

## 8. Rules Page

- [ ] No "Regla de los 90 Minutos" section exists anywhere on the page
- [ ] "Eliminatorias — Resultados Pre-torneo" has the knockout rule callout: goles con tiempo extra, penales no cuentan, empate requiere elegir quién avanza
- [ ] Live prediction timing says "Abre cuando los equipos estén definidos" (not 24h)
- [ ] Lock timing says "1 hora antes del partido"
- [ ] All point values match `src/config/scoring.json` — change a value in the JSON file and verify the rules page updates automatically without code changes

---

## 9. Admin Page

- [ ] Only accessible to users with `isAdmin: true`
- [ ] Can trigger a match sync from the football API
- [ ] Can manually mark a match as finished with a score
- [ ] After calculating points: verify `predictions/{uid}_{matchId}.pointsEarned` is set and `users/{uid}.totalPoints` is updated

---

## 10. Edge Cases & Stress Tests

| Scenario | Expected behaviour |
|---|---|
| User has no prediction when match finishes | `pointsEarned: 0`, no crash |
| Match is cancelled | Card appears faded (opacity 0.5), inputs disabled |
| Two users with identical points | Both show same rank number |
| Group with only 1 match entered | Standings still render without crash |
| Entering a score then clearing it | Prediction not saved (both null skipped in debounce) |
| Very fast typing in score inputs | Debounce fires only once after ~800ms pause |
| Admin calculates points twice for same match | `pointsCalculated: true` flag prevents double-scoring |
| No matches in Firestore | All pages show empty states, no crash |
| Deep link to `/predictions` with no knockout matches | Empty state shown, no crash |

---

## 11. Multi-User Flow (Full End-to-End)

1. Log in as **User A** and fill out all group stage predictions.
2. Log in as **User B** (different browser/incognito) and fill out different predictions.
3. As **Admin**, sync matches and mark one group match as finished with a real score.
4. Admin calculates points for that match.
5. Verify:
   - Both users' `predictions` documents have `pointsEarned` set correctly based on their different picks.
   - Both `users/{uid}.totalPoints` reflect the update.
   - Leaderboard shows both users ranked correctly with movement arrows.
   - The finished match shows the real score on the Fixture page (top-right of the card) for both users.

---

## 12. Mobile Responsiveness

Test on a real phone or browser DevTools at 390px width (iPhone 14):

- [ ] Bottom nav does not overlap content (padding-bottom applied)
- [ ] Score input boxes are large enough to tap (44×44px minimum)
- [ ] No number input spinners visible on any score field
- [ ] Group standings table fits without horizontal scroll
- [ ] Leaderboard rows truncate long names cleanly
- [ ] Fixture bracket cards stack vertically and are readable
