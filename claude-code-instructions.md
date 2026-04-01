# Polla Mundial 2026 — Development Instructions

## Phase 1: Pre-Tournament Full Prediction Flow

Build the complete prediction flow that every user must fill out before the tournament starts.

### Step-by-step flow:

1. **Group stage match predictions** — User predicts the score for every group stage match (e.g. Mexico 2 - 1 South Africa). This is the entry point and should be the default/home view in the "Predicciones" tab.

2. **Auto-calculated group standings** — From the predicted scores, the app auto-calculates each group's standings table (points, goal difference, goals for, etc.) and displays it to the user. Visually highlight which teams advance: 1st place, 2nd place, and best 3rd-place teams. The best 3rd-place logic is important — make sure it's implemented correctly per FIFA rules.

3. **Round of 32 auto-population** — The advancing teams from step 2 automatically populate the Round of 32 bracket matchups.

4. **Knockout predictions cascade** — User predicts the result for each Round of 32 match → winners fill the Round of 16 → predict those → winners fill Quarterfinals → Semifinals → 3rd place match → Final. Each stage only becomes available once the previous stage is fully predicted.

5. **Tournament outcome** — The bracket predictions automatically determine the user's predicted Champion, Runner-up, and 3rd place.

6. **Individual awards** — At the end of the flow, user picks a player name for Golden Boot (top scorer) and Golden Ball (best player).

7. **Lock mechanism** — All pre-tournament predictions lock automatically when the first match of the tournament kicks off. No edits allowed after that.

### Visual feedback:
- Show the group standings table updating in real-time as the user enters match scores.
- Highlight advancing teams clearly (especially important for best 3rd-place teams).
- Show the bracket filling in progressively as the user makes predictions.
- Make it clear what's completed and what still needs predictions.

---

## Phase 2: Live Knockout Predictions

After the real group stage finishes and actual knockout matchups are determined:

1. **Separate live prediction section** — Add a tab or section specifically for live knockout predictions. This is distinct from the pre-tournament bracket.

2. **Match availability** — Each knockout match gets its own live prediction that opens when the match/matchup is available in the system.

3. **Lock timing** — Each live prediction locks 1 hour before that match's kickoff time. User can change their prediction freely until that lock time