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
  "teamA": "Mexico",
  "tlaA": "MEX",
  "flagA": "mx",
  "teamB": "USA",
  "tlaB": "USA",
  "flagB": "us",
  "date": "<Timestamp — a future date>",
  "status": "upcoming",
  "scoreA": null,
  "scoreB": null,
  "venue": "Estadio Azteca",
  "pointsCalculated": false
}
```

**Minimum viable dataset for full testing:**

- 6 matches per group × 2 groups (A and B) = 12 group matches (enough to test standings + best-3rd logic)
- 2 knockout matches with `stage: "roundOf32"` — set `tlaA`/`tlaB` on one but leave the other with both null to test availability logic

**Status values to test with:** `upcoming`, `live`, `finished`, `cancelled`

---

## 1. Authentication

| What to test                          | How                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Login always shows account picker     | Sign out → sign in again → Google popup should ask which account         |
| First login creates user in Firestore | After first login, check `users/{uid}` was created with `totalPoints: 0` |
| Admin sees Admin tab                  | Set `isAdmin: true` on the user doc → reload → Admin tab should appear   |
| Non-admin does NOT see Admin tab      | Regular user should only see 4 tabs                                      |
| Sign out works                        | Tap avatar → Cerrar sesión → should return to login screen               |

---

## 2. Navigation & Default Route

| What to test                     | How                                                               |
| -------------------------------- | ----------------------------------------------------------------- |
| Default tab is Fixture           | Open app fresh → should land on `/pronostico` (Fixture tab)       |
| 4 tabs visible for regular users | Fixture, Predicciones, Tabla, Reglas                              |
| 5 tabs for admin                 | Same + Admin                                                      |
| Unknown URL redirects to Fixture | Navigate to `/anything-random` → should redirect to `/pronostico` |

---

## 3. Fixture Page — Group Stage (tab: Grupos)

### 3a. Score input

- [x] Enter scores for a match → card border turns green (pitch color)
- [x] Winning side gets gold highlight, losing side is normal
- [x] Draw → both sides get subtle blue highlight
- [x] Enter score of **0** (zero) on one side → it is saved and shown correctly, not treated as null/empty
- [x] "Guardando..." appears top-right while saving, then disappears
- [x] Scores persist after page reload (saved to Firestore)
- [x] Inputs are disabled when tournament is locked (first match date has passed)

### 3b. Group standings

- [x] Standings update in real time as you enter scores
- [x] Points calculated correctly: Win=3, Draw=1, Loss=0
- [x] 🥇 badge on 1st place, 🥈 on 2nd
- [x] ✦ (blue) badge on best 3rd place teams — requires entering scores for multiple groups
- [x] Goal difference and goals for used as tiebreakers
- [x] **Draw GD tiebreaker**: two teams both predicted with draws (same pts) — team with better GF ranks higher

### 3c. Best 3rd place logic

- Enter results for all groups to populate 3rd-place standings
- The top 8 third-place teams (by pts → gd → gf) should get the ✦ badge
- These 8 teams should populate `bp1–bp8` slots in the Round of 32
- **Edge**: enter results for fewer than 8 groups → only those 3rd-place teams rank, no crash

### 3d. Match card layout

- [x] Each card shows: `Jornada X · día, DD mes HH:MM` on top row
- [x] Real score shown top-right when match is `finished` or `live`
- [x] Live matches show `🔴 En vivo:` prefix on score
- [x] Card size is consistent across all group cards
- [x] Cancelled matches appear faded (opacity 0.5), inputs disabled

---

## 4. Fixture Page — Eliminatorias (tab: Eliminatorias)

### 4a. Round of 32 population

- [x] R32 bracket shows "Por definir" slots until groups are predicted
- [x] After entering all group scores, bracket auto-populates with predicted 1st/2nd/best-3rd
- [x] Cards show date/hour from the corresponding Firestore roundOf32 matches (by index order)

### 4b. Knockout score input

- [x] Enter score for a R32 match → winner auto-highlighted in gold
- [x] Tiebreaker section ONLY appears when scores are equal (e.g. 2-2)
- [x] Cannot click a team to pick winner unless scores are tied
- [x] "Guardando..." appears when saving knockout scores
- [x] Winner cascades to the next round (R16 slot populates automatically)
- [x] **Tiebreaker cascade**: when scores are tied, the tiebreaker pick (penalties winner) — not the score — determines which team advances to the next round

### 4c. Round progression

- [x] R16 tab locked with warning until all R32 picks are complete
- [x] QF locked until R16 complete, and so on
- [x] 3rd place match shows the two SF losers
- [x] Final shows the two SF winners

### 4d. Tournament lock

- Change the first group match date in Firestore to a past timestamp
- [x] All inputs should become disabled
- [x] Lock icon (🔒) should appear on knockout cards
- [x] Awards section inputs also disabled

---

## 5. Fixture Page — Premios (tab: Premios)

- [x] Shows predicted Champion, Runner-up, 3rd Place derived from bracket
- [x] Shows "Por definir" placeholders if bracket is incomplete
- [x] Golden Boot and Golden Ball text inputs accept any player name
- [x] Saved values persist after reload
- [x] Inputs disabled when tournament is locked

---

## 6. Predictions Page — Live Knockout

### 6a. Availability logic

- Create a knockout match in Firestore **with** `tlaA` and `tlaB` set → should appear with enabled inputs
- Create one **without** teams → card shows "Disponible cuando se definan los equipos" with disabled inputs
- The available gate is **team confirmation**, not a time window — adding teams to a Firestore doc should immediately enable the card without changing the date

### 6b. Lock timing

- Set a match date to **30 minutes from now** (via Firestore) → inputs should be disabled with 🔒
- Set date to **2 hours from now** → inputs should be enabled
- **Note (dev):** `isLiveLocked` in `PredictionsPage.jsx` hardcodes `1 * 60 * 60 * 1000`. If `liveMatchTiming.locksBeforeKickoffHours` is changed in `scoring.json`, the lock timing in code will NOT update automatically — it requires a code change too.

### 6c. Filter tabs

- **Próximos**: shows only matches from the current/next knockout stage (e.g. only R32 until all R32 are done, then only R16)
- **Stage transition**: mark all R32 matches as `finished` → Próximos should automatically switch to showing R16 matches
- **Finalizados**: shows only matches with `status: "finished"`
- **Todos**: shows all knockout matches regardless of state

### 6d. Prediction flow

- [ ] Enter a score → "Guardando..." flashes per card
- [ ] Score persists after reload
- [ ] Real score shown on finished matches
- [ ] Points badge shown on finished matches that have scored predictions
- [ ] Enter score **0–0** → saved correctly, not treated as empty
- [ ] Clear one input (leave it blank) → both sides written as null to Firestore (prediction cleared, not partial)

### 6e. Pending badge

- [ ] Red badge in header shows count of available matches with no prediction yet
- [ ] Badge disappears when all available matches have predictions
- [ ] Locked matches are not counted in pending (lock happens 1h before kickoff)

### 6f. Stacking — pre-tournament + live on same match

1. In the Fixture page, enter a bracket pick for a knockout match (team A vs team B, score X-Y).
2. In the Predictions page, also enter a live prediction for the same match.
3. Admin marks the match finished and calculates points.
4. Verify: the user earns points from **both** predictions independently (pre-tournament bracket result + live match result both contribute to `totalPoints`).

---

## 7. Leaderboard

- [ ] Players ranked by `totalPoints` descending
- [ ] 🥇🥈🥉 medals for top 3
- [ ] Current user row highlighted in gold tint with "(tú)" label
- [ ] "Estás en el puesto #X de Y jugadores" subtitle

### Two users with identical points

- Give two users the exact same `totalPoints` in Firestore → both should display with the same rank number, no crash

### Position change arrows

1. Note everyone's current rank in the leaderboard.
2. As Admin, trigger point calculation for a finished match.
3. Reload leaderboard.
4. Players who moved up show `▲N` in green; down show `▼N` in red; no change shows `—`.
5. Before any calculation has ever run → no arrow shown at all (no snapshot exists yet).

---

## 8. Rules Page

- [ ] No standalone "Regla de los 90 Minutos" section exists on the page
- [ ] "Eliminatorias — Resultados Pre-torneo" has the knockout rule callout:
  - **"Los goles cuentan incluyendo el tiempo extra. Los penales no cuentan."**
  - **"Si predices un empate (ej. 2-2), deberás indicar qué equipo avanza en penales."**
- [ ] Live prediction timing box says:
  - ⏰ "Abre: cuando los equipos del partido estén definidos" (not a fixed hour window)
  - 🔒 "Cierra: **1h** antes del partido" (value pulled from `liveMatchTiming.locksBeforeKickoffHours`)
- [ ] All point values match `src/config/scoring.json` — change a value in the JSON file and verify the rules page reflects the new number on next load (rebuild required since it's bundled at build time, not fetched at runtime)
- [ ] "Cierre de Predicciones" section correctly states pre-tournament predictions lock at first kickoff, live predictions lock 1h before each match

---

## 9. Admin Page

- [ ] Only accessible to users with `isAdmin: true`
- [ ] Can trigger a match sync from the football API
- [ ] Can manually mark a match as finished with a score
- [ ] After calculating points: verify `predictions/{uid}_{matchId}.pointsEarned` is set and `users/{uid}.totalPoints` is updated
- [ ] `pointsCalculated: true` flag on the match document prevents double-scoring — run the calculation a second time for the same match and verify `totalPoints` does not change

---

## 10. Edge Cases & Stress Tests

| Scenario                                                           | Expected behaviour                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| User has no prediction when match finishes                         | `pointsEarned: 0`, no crash                                                                          |
| Match is cancelled                                                 | Card appears faded (opacity 0.5), inputs disabled, not counted in pending badge                      |
| Cancelled match with existing prediction                           | Prediction doc remains in Firestore but no points calculated                                         |
| Two users with identical points                                    | Both show same rank number                                                                           |
| Group with only 1 match entered                                    | Standings still render without crash                                                                 |
| Score entered as 0 (zero)                                          | Saved and displayed correctly, not skipped as "empty"                                                |
| Entering a score then clearing both inputs                         | Prediction written as null, null (cleared from Firestore)                                            |
| Clearing only one input (other still filled)                       | Both written as null (incomplete prediction not saved partially)                                     |
| Very fast typing in score inputs                                   | Debounce fires only once after ~800ms pause                                                          |
| Admin calculates points twice for same match                       | `pointsCalculated: true` flag prevents double-scoring                                                |
| No matches in Firestore                                            | All pages show empty states, no crash                                                                |
| Deep link to `/predictions` with no knockout matches               | Empty state shown, no crash                                                                          |
| Draw prediction with wrong exact score                             | Earns goal-difference points (not exact score), since GD=0 matches for any correct draw              |
| Predict 1-1, actual is 2-2 (both draws)                            | Correct outcome + correct goal difference (both GD=0) → goal-difference tier points, not exact score |
| Predict 3-1, actual is 2-0 (both home win by 2)                    | Correct outcome + correct goal difference → goal-difference tier points                              |
| Knockout match ends 1-1 after 90 min, extra time ends 2-1          | Actual result for scoring is 2-1 (extra time counts); penalties winner is irrelevant to score tiers  |
| Knockout match ends 2-2 after extra time                           | Score is a draw for prediction purposes; tiebreaker pick determines bracket advancement              |
| Pre-tournament bracket correct matchup + live prediction submitted | Both scored independently; points from both add to total                                             |
| `opensBeforeKickoffHours` changed in scoring.json                  | Live availability is NOT affected (code uses teams-defined gate, not this value)                     |
| `locksBeforeKickoffHours` changed in scoring.json                  | Rules page updates; `isLiveLocked` in code does NOT update (hardcoded 1h)                            |

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
6. Run point calculation again for the same match → `totalPoints` must **not** change (double-scoring guard).

---

## 12. Mobile Responsiveness

Test on a real phone or browser DevTools at 390px width (iPhone 14):

- [ ] Bottom nav does not overlap content (padding-bottom applied)
- [ ] Score input boxes are large enough to tap (44×44px minimum)
- [ ] No number input spinners visible on any score field
- [ ] Group standings table fits without horizontal scroll
- [ ] Leaderboard rows truncate long names cleanly
- [ ] Fixture bracket cards stack vertically and are readable
- [ ] Tiebreaker penalty buttons large enough to tap on mobile
- [ ] Rules page point tables readable at 390px

---

## 13. Scoring Logic Verification (Unit-level manual checks)

These require a finished match and known predictions. Use the Admin page to set the exact result, then verify points.

| Prediction | Actual result | Expected tier                                     | Expected pts (group stage) |
| ---------- | ------------- | ------------------------------------------------- | -------------------------- |
| 2-1        | 2-1           | Exact score                                       | 3                          |
| 3-1        | 2-0           | Outcome + GD (both home win by 1... wait, 2 vs 1) | —                          |
| 3-1        | 4-2           | Outcome + GD (home wins by 2 both)                | 2                          |
| 1-0        | 2-0           | Outcome only (home wins, but GD differs: 1 vs 2)  | 1                          |
| 1-1        | 2-2           | Outcome + GD (draw, GD=0 always matches)          | 2                          |
| 1-1        | 3-3           | Outcome + GD (draw, GD=0)                         | 2                          |
| 2-1        | 1-2           | No points (wrong outcome)                         | 0                          |

For **knockout pre-tournament**, same logic applies but points scale by round per `scoring.json`.

For **live knockout predictions**, flat `knockout.liveMatchResult` values apply regardless of round.
