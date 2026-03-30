# World Cup 2026 — Prediction App: Rules & Scoring Instructions

## Architecture: Single Source of Truth

All point values live in **`src/config/scoring.json`**. This file is the only place points are defined. Two things consume it:

1. **The scoring engine** — imports `src/config/scoring.json` at runtime to calculate user scores.
2. **The rules page** — imports `src/config/scoring.json` and renders the current point values dynamically. No hardcoded numbers on the page.

If the family wants to tweak any point value, they edit `src/config/scoring.json` once and everything updates. No hunting through code or HTML.

---

## Platform

This is a **web page** (not a native app). No push notifications. No app store. Just a responsive site that works on desktop and mobile browsers.

---

## Two Prediction Modes

### Mode 1: Pre-Tournament Predictions

Users submit a full bracket **before the first match kicks off**. Once the tournament starts, pre-tournament predictions are locked and cannot be changed.

Pre-tournament predictions cover:

#### A. Group Stage — Match Results

For each of the 48 group-stage matches, the user predicts the final score (e.g. 2-1).

Points are awarded in tiers — **only the highest applicable tier counts** per match (they do not stack):

| Tier | Condition | Points (from config) |
|---|---|---|
| Correct outcome (1X2) | Predicted the winning side or draw correctly, but goal difference and exact score are wrong | `groupStage.matchResult.correctOutcome` |
| Correct outcome + goal difference | Outcome correct AND the margin between the two scores matches (e.g. predicted 3-1, result was 2-0 — both are a win by 2) | `groupStage.matchResult.correctOutcomeAndGoalDifference` |
| Exact score | The predicted scoreline matches exactly | `groupStage.matchResult.exactScore` |

**Scoring logic for "correct outcome":**
- If result is a home win → user predicted home win (home goals > away goals)
- If result is an away win → user predicted away win (away goals > home goals)
- If result is a draw → user predicted a draw (equal goals)

**Scoring logic for "correct goal difference":**
- Outcome must be correct (above), AND
- `abs(predicted_home - predicted_away) == abs(actual_home - actual_away)`
- For draws, goal difference is always 0, so any correct draw prediction automatically qualifies for this tier. This means a correct draw with wrong exact score earns goal-difference points.

**Scoring logic for "exact score":**
- `predicted_home == actual_home AND predicted_away == actual_away`

#### B. Group Stage — Final Standings

For each of the 12 groups (4 teams each), the user predicts the finishing order from 1st to 4th:

| Position | Points (from config) |
|---|---|
| Correct 1st place | `groupStage.finalStandings.correct1stPlace` |
| Correct 2nd place | `groupStage.finalStandings.correct2ndPlace` |
| Correct 3rd place | `groupStage.finalStandings.correct3rdPlace` |
| Correct 4th place | `groupStage.finalStandings.correct4thPlace` |

Each correct position prediction awards its points independently (they stack — you can earn points for getting 1st AND 3rd right but 2nd wrong, for example).

#### C. Knockout Stage — Team Advancement

The user predicts which teams advance to each knockout round. Points escalate by round:

| Round | Points per correct team (from config) |
|---|---|
| Round of 32 | `knockout.teamAdvancement.roundOf32` |
| Round of 16 | `knockout.teamAdvancement.roundOf16` |
| Quarterfinals | `knockout.teamAdvancement.quarterfinals` |
| Semifinals | `knockout.teamAdvancement.semifinals` |
| Final | `knockout.teamAdvancement.final` |

A team earns advancement points for every round they are correctly predicted to be in. For example, if you correctly predict Brazil reaches the Quarterfinals, you earn points for Round of 32 + Round of 16 + Quarterfinals.

#### D. Knockout Stage — Match Results (pre-tournament bracket)

For each knockout match in the user's bracket: if the matchup actually occurs (the two teams the user predicted are indeed playing each other), the score prediction is evaluated.

Points scale by round. Config keys follow the pattern `knockout.preTournamentMatchResult.[round].[tier]`:

| Round | Correct Outcome | Outcome + Goal Diff | Exact Score |
|---|---|---|---|
| Round of 32 | `.roundOf32.correctOutcome` | `.roundOf32.correctOutcomeAndGoalDifference` | `.roundOf32.exactScore` |
| Round of 16 | `.roundOf16.correctOutcome` | `.roundOf16.correctOutcomeAndGoalDifference` | `.roundOf16.exactScore` |
| Quarterfinals | `.quarterfinals.correctOutcome` | `.quarterfinals.correctOutcomeAndGoalDifference` | `.quarterfinals.exactScore` |
| Semifinals | `.semifinals.correctOutcome` | `.semifinals.correctOutcomeAndGoalDifference` | `.semifinals.exactScore` |
| 3rd-Place Match | `.thirdPlace.correctOutcome` | `.thirdPlace.correctOutcomeAndGoalDifference` | `.thirdPlace.exactScore` |
| Final | `.final.correctOutcome` | `.final.correctOutcomeAndGoalDifference` | `.final.exactScore` |

Same three-tier logic as group stage (only highest tier counts per match).

#### E. Tournament Outcome

| Prediction | Points (from config) |
|---|---|
| Correct Champion | `tournamentOutcome.correctChampion` |
| Correct Runner-up | `tournamentOutcome.correctRunnerUp` |
| Correct 3rd place | `tournamentOutcome.correct3rdPlace` |

#### F. Individual Awards

| Prediction | Points (from config) |
|---|---|
| Golden Boot (top scorer) | `individualAwards.goldenBoot` |
| Golden Ball (best player) | `individualAwards.goldenBall` |

**Only the winner matters.** No points for 2nd or 3rd place in individual awards.

---

### Mode 2: Live Match Predictions (Knockout Stage Only)

#### Purpose

This mode exists so that **every user can participate in knockout matches even if their pre-tournament bracket got the teams wrong**. It keeps the game alive for everyone throughout the tournament.

#### How it works

- Live predictions become available **`liveMatchTiming.opensBeforeKickoffHours` hours before** each knockout match.
- Live predictions **lock `liveMatchTiming.locksBeforeKickoffHours` hour(s) before** kickoff. No changes after that.
- Available for **every** knockout match: Round of 32, Round of 16, Quarterfinals, Semifinals, 3rd-Place Match, and the Final.
- The user predicts the final score after 90 minutes, same as pre-tournament.

#### Scoring (flat — same points for every round)

| Tier | Points (from config) |
|---|---|
| Correct outcome (1X2) | `knockout.liveMatchResult.correctOutcome` |
| Correct outcome + goal difference | `knockout.liveMatchResult.correctOutcomeAndGoalDifference` |
| Exact score | `knockout.liveMatchResult.exactScore` |

Flat scoring is intentional: live predictions are made with full information (known matchups, current form, injuries), so they should not award the same escalating points as the pre-tournament bracket which rewards long-range foresight.

#### Stacking

A user **can earn points from both modes** on the same match. If their pre-tournament bracket had the correct matchup AND they also submitted a live prediction, both are scored independently and both count toward their total.

---

## General Rules

### What counts as the result

- **Group stage:** Score at full time (90 minutes + stoppage time).
- **Knockout stage:** Score at the end of 90 minutes only. **Extra time and penalties do NOT change the score** for prediction purposes. If a match is level after 90 minutes, the prediction result is a **draw (X)**.

### Prediction deadlines

- **Pre-tournament:** All predictions must be submitted before the first match of the tournament kicks off.
- **Live knockout predictions:** Lock `liveMatchTiming.locksBeforeKickoffHours` hour(s) before the specific match's kickoff.

### Tiebreakers

Tiebreaker rules will be defined in a separate leaderboard configuration file.

---

## Rules Page Implementation

The rules page must:

1. **Import `src/config/scoring.json`** (or fetch it if not bundled).
2. **Render all point values dynamically** from the config — no hardcoded numbers anywhere in the rules page markup.
3. Present the rules in a clear, readable format with sections for each prediction type.
4. If the config file changes, the rules page reflects the new values on next load without any code changes.

Example pseudo-logic for the rules page:
```
import config from '@/config/scoring.json';

// Then in the template:
// "Exact score in group stage: {config.groupStage.matchResult.exactScore} pts"
// "Correct champion: {config.tournamentOutcome.correctChampion} pts"
```

---

## File Reference

| File | Purpose |
|---|---|
| `src/config/scoring.json` | Single source of truth for all point values and timing settings. Edit here to change scoring. |
| `PREDICTION_APP_RULES.md` | This file. Instructions for building the prediction and scoring system. |
| *(future)* `src/config/leaderboard.json` | Tiebreaker rules, display settings — separate file, addressed later. |
| *(future)* `src/config/tournament.json` | Groups, teams, schedule — separate file if needed. |
