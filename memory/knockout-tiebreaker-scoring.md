---
name: knockout-tiebreaker-scoring
description: In knockouts a level prediction's tiebreaker pick IS the predicted winner — scoring must use it, not treat it as a group-style draw
metadata:
  type: project
---

Knockout matches always have a winner, so a level score prediction (e.g. 2-2) is really "this team advances" via the user's `predictedPenaltyWinner`. Scoring must honor that — do NOT apply group-stage 1X2 logic where a draw prediction vs a decisive result is just a wrong outcome.

`computeMatchPoints` in [matchSync.js](src/services/matchSync.js) takes an `advancer { predicted, real }` for live knockout preds and now does two things:
- **Real draw + predicted draw:** wrong pick demotes one tier (exact→GD→outcome).
- **Real decisive + predicted draw:** if the pick == the team that actually won, award the **correct-outcome** tier (right winner, wrong scoreline) instead of 0. (Score/GD tiers can't apply — a level prediction can't match a decisive scoreline.)

A draw with no `predictedPenaltyWinner` is an **incomplete** prediction (the Llaves UI now requires a winner; `isPredictionComplete` counts it as pending) and scores 0.

Known minor gap: the leaderboard breakdown (`correctScores`/`goalDiffScores`/`exactScores`) is recomputed by `recalculateTotalPoints` via the score-only `resultTier()`, which doesn't know the pick — so a full "Recalcular Puntajes" won't re-count these tiebreaker-outcome hits in the breakdown. `totalPoints` stays correct (it sums stored `pointsEarned`). Fix later by making `resultTier`/the breakdown pick-aware if it matters.

Was wrong about this once (2026-06-29): treated a 2-2+BRA pick vs real 2-1 BRA win as 0; correct is 1 (right winner). One-off re-score of finished knockouts via scratchpad `fixswap/rescore-knockout.js` credited Michelle Terán & Pablo Papá (RSA-CAN) and Daniela (BRA-JPN), +1 each.
