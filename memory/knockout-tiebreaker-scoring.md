---
name: knockout-tiebreaker-scoring
description: In knockouts a level prediction's tiebreaker pick IS the predicted winner — scoring must use it, not treat it as a group-style draw
metadata:
  type: project
---

Knockout matches always have a winner, so a level score prediction (e.g. 2-2) is really "this team advances" via the user's `predictedPenaltyWinner`. Scoring must honor that — do NOT apply group-stage 1X2 logic where a draw prediction vs a decisive result is just a wrong outcome.

`computeMatchPoints` in [matchSync.js](src/services/matchSync.js) takes an `advancer { predicted, real }`. It must be passed for **both** scoring paths in `_writePredictionPoints`: the live `predictions` (advancer = `predictedPenaltyWinner`) AND the bracket/Pronóstico `ks_` scores (advancer = the slot's `pick_`). Both were missing it at different times. It does two things, both keyed on **who advances**:
- **Real draw + predicted draw:** wrong pick demotes one tier (exact→GD→outcome).
- **Scoreline outcome missed (tier 0) but predicted advancer == real advancer → correct-outcome tier.** This is symmetric and MUST cover both mirror cases: predicted-draw/real-decisive AND predicted-decisive/real-draw-on-penalties. (First shipped only the first case — Pablo Papá predicted 1-2 MAR, real 1-1 MAR-pens, got 0 instead of 1. Fixed 2026-07-02 by dropping the `pResult===0` guard.)

The `advancer` must be passed for BOTH scoring paths in `_writePredictionPoints`. Live preds: advancer = higher-scored side or `predictedPenaltyWinner`. Bracket (ksp) preds: the ks_ slot can be **flipped** vs the real match's home/away, so align `ks_A/ks_B` to the real home/away first (via `bracketFlipByUser`, set when the slot is matched), then advancer = higher-scored side or the slot's `pick_`. Not aligning mis-scored both the tiers and the advancer.

A draw with no `predictedPenaltyWinner` is an **incomplete** prediction (the Llaves UI now requires a winner; `isPredictionComplete` counts it as pending) and scores 0.

Known minor gap: the leaderboard breakdown (`correctScores`/`goalDiffScores`/`exactScores`) is recomputed by `recalculateTotalPoints` via the score-only `resultTier()`, which doesn't know the pick — so a full "Recalcular Puntajes" won't re-count these tiebreaker-outcome hits in the breakdown. `totalPoints` stays correct (it sums stored `pointsEarned`). Fix later by making `resultTier`/the breakdown pick-aware if it matters.

Was wrong about this once (2026-06-29): treated a 2-2+BRA pick vs real 2-1 BRA win as 0; correct is 1 (right winner). One-off re-score of finished knockouts via scratchpad `fixswap/rescore-knockout.js` credited Michelle Terán & Pablo Papá (RSA-CAN) and Daniela (BRA-JPN), +1 each.
