---
name: aplicar-team-swap-gotcha
description: Wrong/"live" knockout match or stale times usually means teams got pinned onto the wrong fixture via Aplicar, not bad dates
metadata:
  type: project
---

The "Aplicar" button in AdminPage → *Equipos en Llaves (R32)* (BracketTeamsCard) maps bracket slots to R32 match docs by computed-home-TLA anchor with a date-order fallback. That mapping can be wrong, stamping a slot's teams onto a different fixture's doc. It sets `adminTeamOverride: true`, and `syncMatchesFromAPI` deliberately never overwrites manually-set teams — so **no amount of syncing fixes it**.

Symptom seen 2026-06-29: NED-MAR and BRA-JPN had their team labels swapped onto each other's fixtures (NED-MAR card showed BRA-JPN's 17:00Z kickoff → appeared "live"; bets leaked in Llaves; admin list out of chronological order). The API (football-data) was correct the whole time; only the stored team→doc assignment was wrong.

**Diagnosis trick:** compare the card's displayed time (account for the user's timezone, ~UTC-4) against the API's `utcDate` per fixture id. If a card's time matches a *different* match's API time, the teams are swapped.

**Resolution (2026-06-29):** the buggy *Equipos en Llaves (R32)* override feature (BracketTeamsCard / `adminTeamOverride` / `apiSnapshot*`) was **removed entirely** — teams now come solely from the API. A one-off admin-SDK migration (scratchpad `fixswap/`) swapped the affected `predictions` docs' matchId to follow the teams (orientation-checked), corrected the 6 match docs, and cleared all leftover override flags. `matchSync` no longer preserves teams/date on override. If a future round (R16+) again needs a manual matchup override because the API is late, rebuild it generically **with a correct slot→doc mapping** (the old date-order fallback is what caused the swap).

The bets-visibility lock ([[#]] isLiveLocked) and live-status inference both key off the fixture's stored date, so a mislabeled live fixture leaks bets — the lock logic itself is fine.
