# Polla Mundial 2026 — Manual Testing Plan

## 1. Pre-Tournament Predictions (Phase 1)

### 1A. Group Stage Predictions
- [ ] Enter scores for all matches in one group (e.g. Group A)
- [ ] Verify the standings table calculates correctly: points (3 win, 1 draw, 0 loss), goal difference, goals for
- [ ] Verify tiebreakers work (head-to-head, goal difference, goals scored)
- [ ] Change one score and confirm the standings table updates immediately
- [ ] Enter a set of scores where 3rd place is important — verify best 3rd-place logic works across groups
- [ ] Leave a group incomplete — verify the bracket does NOT populate from incomplete groups
- [ ] Complete all groups — verify all 48 teams' positions are resolved and advancing teams are highlighted

### 1B. Best 3rd-Place Logic
This is the trickiest part. Test with known scenarios:
- [ ] Create a scenario where multiple 3rd-place teams have the same points — verify tiebreakers apply
- [ ] Verify the correct number of 3rd-place teams advance (8 out of 12 in the 2026 format)
- [ ] Verify the 3rd-place teams are slotted into the correct Round of 32 matchups per FIFA seeding rules

### 1C. Knockout Bracket Cascade
- [ ] Complete all group predictions — verify Round of 32 populates with correct matchups
- [ ] Predict all Round of 32 results — verify Round of 16 populates with winners
- [ ] Predict Round of 16 — verify Quarterfinals populate
- [ ] Continue through Semis, 3rd place match, Final
- [ ] Verify Champion, Runner-up, 3rd place are automatically set from bracket results
- [ ] Go BACK and change a group stage score that changes who advances — verify the entire bracket downstream resets or updates accordingly (this is critical)

### 1D. Individual Awards
- [ ] Verify Golden Boot and Golden Ball player name inputs appear after bracket is complete
- [ ] Enter player names and confirm they save correctly

### 1E. Lock Mechanism
- [ ] Before lock time: verify all predictions are editable
- [ ] Simulate lock time (set tournament start to a time in the past, or use a test override): verify no edits are possible
- [ ] Verify a clear message is shown when predictions are locked

---

## 2. Scoring Verification

Create 2 test users with different predictions. Use known match results to verify points.

### Test Scenario Setup
Pick a small set of matches (e.g. 3 group matches) and define:
- The ACTUAL results (what really happened)
- User A's predictions
- User B's predictions

### 2A. Group Stage Scoring

| Match | Actual | User A | User B |
|-------|--------|--------|--------|
| MEX vs RSA | 2-1 | 2-1 | 1-0 |
| KOR vs CZE | 0-0 | 1-1 | 0-0 |
| MEX vs CZE | 3-0 | 2-0 | 3-0 |

Expected points for User A on match 1:
- Correct outcome (Mexico win)? ✓ → +X pts
- Correct goal difference (1)? ✓ → +X pts
- Exact score? ✓ → +X pts

Do this math by hand for each match, then compare with what the app awards.

- [ ] Verify correct outcome (1X2) points
- [ ] Verify correct outcome + goal difference points
- [ ] Verify exact score points
- [ ] Verify group final standings points (1st, 2nd, 3rd, 4th place)

### 2B. Knockout Scoring — Pre-Tournament Bracket

| Match | Actual | User A | User B |
|-------|--------|--------|--------|
| R32: BRA vs JPN | 2-1 | 2-1 | 3-0 |
| R16: BRA vs GER | 1-1 (BRA advances) | 2-0 | 1-1 (BRA) |

- [ ] Verify team advancement points (did user predict BRA would reach R16? → points)
- [ ] Verify match result points scale by round (R32 < R16 < QF < SF < Final)
- [ ] Verify exact score in knockout awards correct points
- [ ] Test a draw prediction: user predicts 1-1 and picks advancing team — verify this works and scores correctly

### 2C. Knockout Scoring — New Draw Rule
- [ ] User predicts 2-2 draw in knockout match → verify app asks which team advances
- [ ] Actual result is 2-2 and same team advances → verify full points awarded
- [ ] Actual result is 2-2 but different team advances → verify partial points (outcome correct, advancement wrong)
- [ ] Actual result is NOT a draw but user predicted a draw → verify only outcome points if applicable

### 2D. Tournament Outcome Scoring
- [ ] Verify Champion prediction points
- [ ] Verify Runner-up prediction points
- [ ] Verify 3rd place prediction points

### 2E. Individual Awards Scoring
- [ ] Verify Golden Boot points when correct
- [ ] Verify Golden Ball points when correct
- [ ] Verify zero points when incorrect

### 2F. Leaderboard
- [ ] Verify total points add up correctly for each user
- [ ] Verify ranking order is correct
- [ ] With 3+ test users, verify position change arrows after results update

---

## 3. Live Knockout Predictions (Phase 2)

### 3A. Testing Approach — Time Simulation
Since you can't wait for real matches, you need a way to simulate match timing. Options:

**Option A: Admin time override (recommended)**
Add a dev/admin setting to manually set "current time" for the app. This lets you:
- Set time to 24h before a match → verify prediction opens
- Set time to 30min before kickoff → verify prediction is locked
- Set time to after the match → verify results display

**Option B: Create test matches with near-future kickoff times**
- In admin panel, create a test knockout match with kickoff 2 hours from now
- Verify the live prediction opens immediately
- Wait until 1 hour before → verify it locks
- Manually enter a result → verify scoring

### 3B. Live Prediction Flow
- [ ] Match available, more than 1h to kickoff → prediction form is open and editable
- [ ] User enters a prediction → saves correctly
- [ ] User changes prediction → updates correctly
- [ ] Less than 1h to kickoff → prediction is locked, shows what user predicted
- [ ] No prediction was made before lock → shows "no prediction" state
- [ ] Match result is entered → points calculated and added to leaderboard
- [ ] Verify live prediction points STACK with pre-tournament bracket points (both count)

### 3C. Edge Cases
- [ ] User tries to submit prediction exactly at lock time — what happens?
- [ ] Match kickoff time changes (delayed) — does lock time update?
- [ ] User has no pre-tournament prediction for this match but makes a live prediction — only live points count

---

## 4. Quick Reference: Point Values

Fill in the actual values from your scoring.json so you can cross-reference during testing:

| Category | Points |
|----------|--------|
| Group: Correct outcome (1X2) | ___ |
| Group: Outcome + goal difference | ___ |
| Group: Exact score | ___ |
| Group standings: 1st place | ___ |
| Group standings: 2nd place | ___ |
| Group standings: 3rd place | ___ |
| Group standings: 4th place | ___ |
| Team advancement: R32 | ___ |
| Team advancement: R16 | ___ |
| Team advancement: QF | ___ |
| Team advancement: SF | ___ |
| Team advancement: Final | ___ |
| Champion correct | ___ |
| Runner-up correct | ___ |
| 3rd place correct | ___ |
| Golden Boot | ___ |
| Golden Ball | ___ |

Fill this in from scoring.json, then use it as your answer key when testing.
