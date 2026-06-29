import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  where,
  Timestamp,
  updateDoc,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { fetchAllMatches } from './footballApi';
import teamFlags from '../config/teamFlags.json';
import scoring from '../config/scoring.json';
import { computeGroupStandings, getBest3rdPlaceTeams } from '../utils/standingsCalculator';
import { BRACKET_R32, BRACKET_R16, BRACKET_QF, BRACKET_SF } from '../utils/bracketUtils';
import { resolveAllUsersBrackets } from './preTournamentService';
import { compareLeaderboard, rankPlayersMap } from '../utils/leaderboard';

// Re-exported so existing importers (`import { compareLeaderboard } from '../services/matchSync'`)
// keep working while the canonical definition lives in utils/leaderboard.
export { compareLeaderboard };

// ─── Stage / status normalization ───────────────────────────────────────────

const STAGE_MAP = {
  GROUP_STAGE: 'group',
  LAST_32: 'roundOf32',
  LAST_16: 'roundOf16',
  QUARTER_FINALS: 'quarterfinals',
  SEMI_FINALS: 'semifinals',
  THIRD_PLACE: 'thirdPlace',
  FINAL: 'final',
};

const STATUS_MAP = {
  SCHEDULED: 'upcoming',
  TIMED: 'upcoming',
  IN_PLAY: 'live',
  PAUSED: 'live',
  FINISHED: 'finished',
  POSTPONED: 'upcoming',
  CANCELLED: 'cancelled',
  SUSPENDED: 'live',
};

// Bracket slot IDs grouped by knockout stage, used for team advancement scoring
const STAGE_BRACKET_SLOTS = {
  roundOf32: BRACKET_R32.map((m) => m.id),
  roundOf16: BRACKET_R16.map((m) => m.id),
  quarterfinals: BRACKET_QF.map((m) => m.id),
  semifinals: BRACKET_SF.map((m) => m.id),
  final: ['final'],
};

// ─── Status tracking ─────────────────────────────────────────────────────────

let syncStatus = { syncing: false, lastSync: null, matchCount: 0, error: null };
let syncTimeout = null;
const statusListeners = new Set();

function notifyListeners() {
  statusListeners.forEach((fn) => fn({ ...syncStatus }));
}

export function onSyncStatusChange(fn) {
  statusListeners.add(fn);
  fn({ ...syncStatus });
  return () => statusListeners.delete(fn);
}

export function getSyncStatus() {
  return { ...syncStatus };
}

// ─── Match normalization ──────────────────────────────────────────────────────

function normalizeMatch(apiMatch) {
  const tlaA = apiMatch.homeTeam?.tla || '';
  const tlaB = apiMatch.awayTeam?.tla || '';
  const stage = STAGE_MAP[apiMatch.stage] || 'group';
  const group = apiMatch.group ? apiMatch.group.replace('GROUP_', '') : null;

  return {
    apiId: apiMatch.id,
    matchday: apiMatch.matchday ?? null,
    stage,
    group,
    teamA: apiMatch.homeTeam?.name || '',
    teamB: apiMatch.awayTeam?.name || '',
    tlaA,
    tlaB,
    flagA: teamFlags[tlaA] || null,
    flagB: teamFlags[tlaB] || null,
    crestA: apiMatch.homeTeam?.crest || null,
    crestB: apiMatch.awayTeam?.crest || null,
    date: Timestamp.fromDate(new Date(apiMatch.utcDate)),
    venue: apiMatch.venue || null,
    scoreA: apiMatch.score?.fullTime?.home ?? null,
    scoreB: apiMatch.score?.fullTime?.away ?? null,
    // 'home' or 'away' — set by API when match goes to penalties; null for normal outcomes
    winner: apiMatch.score?.winner === 'HOME_TEAM' ? 'home' : apiMatch.score?.winner === 'AWAY_TEAM' ? 'away' : null,
    status: deriveStatus(STATUS_MAP[apiMatch.status] || 'upcoming', apiMatch.utcDate),
    lastSyncedAt: Timestamp.now(),
  };
}

// football-data.org delays live-status updates on basic plans — the match stays
// TIMED/SCHEDULED until a goal triggers a webhook, so 0-0 games never flip to
// IN_PLAY. If the API still says 'upcoming' but kickoff is in the past (and the
// match isn't marked finished), infer 'live'. We give a 115-minute window (90
// min + extra time buffer) after which we stop inferring so we don't keep
// stale matches as live if the API never updates them.
function deriveStatus(apiStatus, utcDate) {
  if (apiStatus !== 'upcoming') return apiStatus;
  if (!utcDate) return apiStatus;
  const kickoff = new Date(utcDate);
  const now = new Date();
  const minutesSinceKickoff = (now - kickoff) / 60000;
  if (minutesSinceKickoff > 0 && minutesSinceKickoff < 115) return 'live';
  return apiStatus;
}

// Returns the winning team TLA, handling penalty shootout results where fullTime is a draw
function getMatchWinnerTla(match) {
  if (match.scoreA > match.scoreB) return match.tlaA;
  if (match.scoreB > match.scoreA) return match.tlaB;
  if (match.winner === 'home') return match.tlaA;
  if (match.winner === 'away') return match.tlaB;
  return null;
}

// True when a prediction nailed the exact scoreline (used as the leaderboard tiebreaker)
function isExactScore(predA, predB, realA, realB) {
  if (predA == null || predB == null || realA == null || realB == null) return false;
  return Number(predA) === Number(realA) && Number(predB) === Number(realB);
}

// Classify a prediction into the (mutually exclusive) hit tier, independent of how
// many points the stage awards. Used for the per-user leaderboard breakdown:
//   3 = exact scoreline · 2 = right outcome + goal difference · 1 = right outcome · 0 = miss
function resultTier(predA, predB, realA, realB) {
  const pA = Number(predA);
  const pB = Number(predB);
  const rA = Number(realA);
  const rB = Number(realB);
  if ([pA, pB, rA, rB].some((n) => isNaN(n))) return 0;
  if (pA === rA && pB === rB) return 3;
  const sameOutcome = Math.sign(pA - pB) === Math.sign(rA - rB);
  if (!sameOutcome) return 0;
  if (Math.abs(pA - pB) === Math.abs(rA - rB)) return 2;
  return 1;
}


// ─── Core sync ───────────────────────────────────────────────────────────────

export async function syncMatchesFromAPI() {
  syncStatus = { ...syncStatus, syncing: true, error: null };
  notifyListeners();

  try {
    const apiMatches = await fetchAllMatches();

    // Fetch existing Firestore matches to detect status changes
    const existingSnap = await getDocs(collection(db, 'matches'));
    const existing = {};
    existingSnap.forEach((d) => {
      existing[d.id] = d.data();
    });

    const newlyFinished = [];
    const currentlyLive = [];
    const batch = writeBatch(db);

    for (const apiMatch of apiMatches) {
      const normalized = normalizeMatch(apiMatch);
      const docId = String(apiMatch.id);
      const matchRef = doc(db, 'matches', docId);
      const prev = existing[docId];

      if (
        normalized.status === 'finished' &&
        !prev?.pointsCalculated &&
        !prev?.adminOverride
      ) {
        newlyFinished.push({ docId, ...normalized });
      }

      if (
        normalized.status === 'live' &&
        normalized.scoreA !== null &&
        normalized.scoreB !== null &&
        !prev?.adminOverride
      ) {
        currentlyLive.push({ docId, ...normalized });
      }

      const toWrite = { ...normalized };

      // If admin has manually overridden this match, don't clobber their scores/status/winner
      if (prev?.adminOverride) {
        delete toWrite.scoreA;
        delete toWrite.scoreB;
        delete toWrite.status;
        delete toWrite.winner;
      }

      // Don't overwrite confirmed team assignments with empty values — the API
      // sometimes returns blank homeTeam/awayTeam for knockout slots it hasn't
      // populated yet, which would erase teams that were correctly placed on a
      // prior sync.
      if (!toWrite.tlaA && prev?.tlaA) delete toWrite.tlaA;
      if (!toWrite.tlaB && prev?.tlaB) delete toWrite.tlaB;
      if (!toWrite.teamA && prev?.teamA) delete toWrite.teamA;
      if (!toWrite.teamB && prev?.teamB) delete toWrite.teamB;
      if (!toWrite.flagA && prev?.flagA) delete toWrite.flagA;
      if (!toWrite.flagB && prev?.flagB) delete toWrite.flagB;
      if (!toWrite.crestA && prev?.crestA) delete toWrite.crestA;
      if (!toWrite.crestB && prev?.crestB) delete toWrite.crestB;

      batch.set(matchRef, toWrite, { merge: true });
    }

    await batch.commit();

    syncStatus = {
      syncing: false,
      lastSync: new Date().toISOString(),
      matchCount: apiMatches.length,
      error: null,
    };
    notifyListeners();

    // Calculate points for matches that just finished (final, locked)
    for (const match of newlyFinished) {
      await calculatePointsForMatch(match.docId, match.scoreA, match.scoreB, match.stage);
    }

    // Update live points on every sync cycle
    for (const match of currentlyLive) {
      await calculateLivePoints(match.docId, match.scoreA, match.scoreB, match.stage, match.tlaA, match.tlaB, match.winner);
    }

    // Sweep for groups that are fully finished but whose standings weren't scored yet
    // (handles the case where pointsCalculated was set before calculateGroupStandingsPoints ran).
    // Safe to call repeatedly — the function re-writes the same values, which is idempotent.
    const groupsToCheck = new Set();
    for (const m of Object.values(existing)) {
      if (m.stage === 'group' && m.group && m.status === 'finished') groupsToCheck.add(m.group);
    }
    for (const m of newlyFinished) {
      if (m.stage === 'group' && m.group) groupsToCheck.add(m.group);
    }
    for (const group of groupsToCheck) {
      await calculateGroupStandingsPoints(group);
    }

    return apiMatches.length;
  } catch (err) {
    syncStatus = { ...syncStatus, syncing: false, error: err.message };
    notifyListeners();
    throw err;
  }
}

// ─── Auto-polling ────────────────────────────────────────────────────────────

export function startAutoSync(isAdmin) {
  if (!isAdmin) return;
  stopAutoSync();

  async function runCycle() {
    try {
      await syncMatchesFromAPI();
    } catch (e) {
      console.error('[matchSync] Auto-sync error:', e);
    }
    const minutes = scoring.scoreSync.pollIntervalMatchDayMinutes;
    syncTimeout = setTimeout(runCycle, minutes * 60 * 1000);
  }

  runCycle();
}

export function stopAutoSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
}

// ─── Point calculation ────────────────────────────────────────────────────────

// isPreTournament=true uses scaled per-round scoring from preTournamentMatchResult.
//
// advancer (live knockout predictions only): { predicted, real } TLAs — the team each
// side names as the winner (the scoreline's winner, or the tiebreaker pick when level).
// Two knockout-only adjustments:
//   • Real match was a draw and the user also predicted a draw → a wrong advancer demotes
//     the prediction one tier (exact → goal-diff → outcome).
//   • User predicted a draw but the real match was decisive → if their pick is the team
//     that actually won, the prediction earns the correct-outcome tier (right winner,
//     wrong scoreline) instead of zero.
// Omit `advancer` (group stage, the Pronóstico bracket — where advancement is scored
// separately) to skip both entirely; groups can legitimately end level.
export function computeMatchPoints(predicted, real, stage, isPreTournament = false, advancer = null) {
  const pA = Number(predicted.scoreA);
  const pB = Number(predicted.scoreB);
  const rA = Number(real.scoreA);
  const rB = Number(real.scoreB);

  if (isNaN(pA) || isNaN(pB) || isNaN(rA) || isNaN(rB)) return 0;

  let cfg;
  if (stage === 'group') {
    cfg = scoring.groupStage.matchResult;
  } else if (isPreTournament) {
    cfg = scoring.knockout.preTournamentMatchResult[stage] || scoring.knockout.liveMatchResult;
  } else {
    cfg = scoring.knockout.liveMatchResult;
  }

  const pResult = Math.sign(pA - pB);
  const rResult = Math.sign(rA - rB);
  const pDiff = Math.abs(pA - pB);
  const rDiff = Math.abs(rA - rB);

  // Tier: 3 exact · 2 outcome + goal diff · 1 outcome · 0 miss
  let tier;
  if (pA === rA && pB === rB) tier = 3;
  else if (pResult === rResult && pDiff === rDiff) tier = 2;
  else if (pResult === rResult) tier = 1;
  else tier = 0;

  // Penalty-decided match the user also called as a draw: wrong advancer drops a tier.
  // Skipped when the real advancer is unknown so a missing winner can't penalize anyone.
  if (advancer && advancer.real && tier > 0 && rResult === 0 && pResult === 0) {
    if (advancer.predicted !== advancer.real) tier -= 1;
  }

  // Knockouts have no draws: a user who predicts a level score still names a winner via
  // the tiebreaker pick. If the real match was decided (one side won in normal/extra time)
  // and that pick is the team that actually won, the prediction has the right winner with
  // the wrong scoreline → credit the correct outcome. (Score/goal-diff tiers stay 0 here,
  // since a level prediction can't match a decisive scoreline.)
  if (advancer && advancer.real && tier === 0 && pResult === 0 && advancer.predicted === advancer.real) {
    tier = 1;
  }

  if (tier === 3) return cfg.exactScore;
  if (tier === 2) return cfg.correctOutcomeAndGoalDifference;
  if (tier === 1) return cfg.correctOutcome;
  return 0;
}

// Shared: write points to all prediction collections for a match, return affected user IDs
// tlaA/tlaB: real match teams — used to detect bracket matchup hits for pre-tournament scoring
// winner: 'home'/'away'/null — the penalty/tiebreaker winner for a draw, used to resolve
//         who really advanced when scoring live knockout predictions (advancer demotion).
async function _writePredictionPoints(matchId, scoreA, scoreB, stage, tlaA, tlaB, winner = null) {
  const affectedUserIds = new Set();
  const batch = writeBatch(db);

  // Team that really advanced (null on non-knockout or when undecided). On a draw this
  // comes from the stored `winner`; otherwise it's the higher-scoring side.
  const realAdvancer = stage !== 'group' ? getMatchWinnerTla({ scoreA, scoreB, winner, tlaA, tlaB }) : null;

  // For knockout matches: resolve every user's bracket to detect matchup hits and find which
  // bracket slot (if any) corresponds to this real match so we can score the Pronóstico prediction.
  //
  // Matchup hit (Llaves bonus): BOTH real teams predicted to reach this stage → pre-tournament rates.
  //   R32 = qualify from groups; R16 = win R32; QF = win R16; SF = win QF; Final/3rd = exact pair.
  //
  // Bracket slot (Pronóstico scoring): the exact slot in the user's bracket where the real teams
  //   appear as home/away. Used to look up ks_{slotId}_A/B and score the pre-tournament prediction.
  const matchupHitByUser = new Set();
  const bracketSlotByUser = {}; // userId → slotId (e.g. 'r32_04') for Pronóstico scoring

  if (tlaA && tlaB && stage !== 'group') {
    const resolvedUsers = await resolveAllUsersBrackets();
    const stageDefs = { roundOf32: BRACKET_R32, roundOf16: BRACKET_R16, quarterfinals: BRACKET_QF, semifinals: BRACKET_SF }[stage];

    for (const { userId, resolved } of resolvedUsers) {
      // ── Matchup hit (team-set check) ───────────────────────────────────────
      let hit = false;
      if (stageDefs) {
        const teams = new Set();
        const prevDefs = { roundOf16: BRACKET_R32, quarterfinals: BRACKET_R16, semifinals: BRACKET_QF }[stage];
        if (stage === 'roundOf32') {
          for (const def of BRACKET_R32) {
            if (resolved[def.id]?.home?.tla) teams.add(resolved[def.id].home.tla);
            if (resolved[def.id]?.away?.tla) teams.add(resolved[def.id].away.tla);
          }
        } else if (prevDefs) {
          for (const def of prevDefs) if (resolved[def.id]?.winner) teams.add(resolved[def.id].winner);
        }
        hit = teams.has(tlaA) && teams.has(tlaB);
      } else if (stage === 'final') {
        hit = (resolved['sf_1']?.winner === tlaA || resolved['sf_1']?.winner === tlaB) &&
              (resolved['sf_2']?.winner === tlaA || resolved['sf_2']?.winner === tlaB);
      } else if (stage === 'thirdPlace') {
        const h = resolved['3rd']?.home?.tla, a = resolved['3rd']?.away?.tla;
        hit = h && a && ((h === tlaA && a === tlaB) || (h === tlaB && a === tlaA));
      }
      if (hit) matchupHitByUser.add(userId);

      // ── Bracket slot (exact-pair lookup for Pronóstico scoring) ────────────
      if (stageDefs) {
        for (const def of stageDefs) {
          const h = resolved[def.id]?.home?.tla, a = resolved[def.id]?.away?.tla;
          if (h && a && ((h === tlaA && a === tlaB) || (h === tlaB && a === tlaA))) {
            bracketSlotByUser[userId] = def.id;
            break;
          }
        }
      } else if (stage === 'final') {
        const h = resolved['final']?.home?.tla, a = resolved['final']?.away?.tla;
        if (h && a && ((h === tlaA && a === tlaB) || (h === tlaB && a === tlaA))) bracketSlotByUser[userId] = 'final';
      } else if (stage === 'thirdPlace') {
        const h = resolved['3rd']?.home?.tla, a = resolved['3rd']?.away?.tla;
        if (h && a && ((h === tlaA && a === tlaB) || (h === tlaB && a === tlaA))) bracketSlotByUser[userId] = '3rd';
      }
    }
  }

  // 1. Live knockout predictions (PredictionsPage → 'predictions' collection)
  //    Apply pre-tournament scoring rates when the user's bracket has the matchup hit.
  const predsSnap = await getDocs(query(collection(db, 'predictions'), where('matchId', '==', String(matchId))));
  predsSnap.forEach((predDoc) => {
    const pred = predDoc.data();
    const matchupHit = matchupHitByUser.has(pred.userId);
    // Who the user predicted to advance: higher score, or their penalty pick on a draw.
    const pA = Number(pred.predictedScoreA);
    const pB = Number(pred.predictedScoreB);
    const predictedAdvancer = pA > pB ? tlaA : pB > pA ? tlaB : (pred.predictedPenaltyWinner ?? null);
    const points = computeMatchPoints(
      { scoreA: pred.predictedScoreA, scoreB: pred.predictedScoreB },
      { scoreA, scoreB },
      stage,
      matchupHit,
      { predicted: predictedAdvancer, real: realAdvancer },
    );
    const isExact = isExactScore(pred.predictedScoreA, pred.predictedScoreB, scoreA, scoreB);
    const tier = resultTier(pred.predictedScoreA, pred.predictedScoreB, scoreA, scoreB);
    batch.update(predDoc.ref, { pointsEarned: points, bracketMatchupHit: matchupHit, isExact, resultTier: tier, calculatedAt: Timestamp.now() });
    affectedUserIds.add(pred.userId);
  });

  // 2. Group stage predictions (FixturePage → 'preTournamentGroupPredictions' collection)
  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', '==', String(matchId))),
  );
  groupPredsSnap.forEach((predDoc) => {
    const pred = predDoc.data();
    const points = computeMatchPoints(
      { scoreA: pred.predictedScoreA, scoreB: pred.predictedScoreB },
      { scoreA, scoreB },
      stage,
    );
    const isExact = isExactScore(pred.predictedScoreA, pred.predictedScoreB, scoreA, scoreB);
    const tier = resultTier(pred.predictedScoreA, pred.predictedScoreB, scoreA, scoreB);
    batch.update(predDoc.ref, { pointsEarned: points, isExact, resultTier: tier, calculatedAt: Timestamp.now() });
    affectedUserIds.add(pred.userId);
  });

  // 3. Bracket knockout score predictions (FixturePage → 'preTournamentBracket' ks_{slotId}_A/B)
  //    Only scored for users whose bracket slot has the exact matching team pair.
  //    Always uses pre-tournament rates since these were made before the tournament.
  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  bracketSnap.forEach((bracketDoc) => {
    const data = bracketDoc.data();
    const userId = data.userId || bracketDoc.id;
    const slotId = bracketSlotByUser[userId];
    if (!slotId) return;
    const predA = data[`ks_${slotId}_A`];
    const predB = data[`ks_${slotId}_B`];
    if (predA === null || predA === undefined || predB === null || predB === undefined) return;
    const points = computeMatchPoints({ scoreA: predA, scoreB: predB }, { scoreA, scoreB }, stage, true);
    const isExact = isExactScore(predA, predB, scoreA, scoreB);
    const tier = resultTier(predA, predB, scoreA, scoreB);
    batch.update(bracketDoc.ref, { [`ksp_${slotId}`]: points, [`kse_${slotId}`]: isExact, [`kst_${slotId}`]: tier });
    affectedUserIds.add(userId);
  });

  await batch.commit();
  return affectedUserIds;
}

// Group final standings scoring — called after all 6 matches in a group finish
async function calculateGroupStandingsPoints(group) {
  // Fetch all matches in this group
  const matchesSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'group'), where('group', '==', group)),
  );
  const groupMatches = [];
  matchesSnap.forEach((d) => groupMatches.push({ id: d.id, ...d.data() }));

  // Only proceed if all 6 matches are finished
  if (groupMatches.length < 6 || !groupMatches.every((m) => m.status === 'finished')) return;

  // Build team list for this group
  const teamMap = {};
  for (const m of groupMatches) {
    teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA };
    teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB };
  }
  const teams = Object.values(teamMap);

  // Compute actual standings from real scores
  const actualPreds = {};
  for (const m of groupMatches) {
    actualPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
  }
  const actualStandings = computeGroupStandings(teams, groupMatches, actualPreds);

  // Fetch all users' group predictions for these matches in one query
  const matchIds = groupMatches.map((m) => m.id);
  const allGroupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', 'in', matchIds)),
  );
  const predsByUser = {};
  allGroupPredsSnap.forEach((d) => {
    const pd = d.data();
    if (!predsByUser[pd.userId]) predsByUser[pd.userId] = {};
    predsByUser[pd.userId][pd.matchId] = pd;
  });

  // For each user, compute predicted standings, award standing points + R32 advancement for top 2.
  // Iterate over predsByUser (all users with group predictions) — not just those with bracket docs,
  // since users who only made group picks won't have a preTournamentBracket doc yet.
  const batch = writeBatch(db);
  const affectedUserIds = new Set();

  const advR32Pts = scoring.knockout.teamAdvancement.roundOf32;
  const actualQualifiers = [actualStandings[0]?.tla, actualStandings[1]?.tla].filter(Boolean);
  // The 3rd-place team's R32 advancement is owned by the best-3rd pass (it can only be
  // resolved once all 12 groups finish). This group owns the top-2 advancement credit;
  // anyone else (4th) can never advance, so their key is cleared of any stale credit
  // left over from an earlier standing (e.g. a team that was top 2 before a correction).
  const thirdTla = actualStandings[2]?.tla;
  const fs = scoring.groupStage.finalStandings;

  for (const [userId, userPreds] of Object.entries(predsByUser)) {
    const predictedStandings = computeGroupStandings(teams, groupMatches, userPreds);
    // Top 2 qualify directly; 3rd can qualify via best-3rd — all three count as "predicted to advance"
    const predictedQualifiers = new Set([predictedStandings[0]?.tla, predictedStandings[1]?.tla, predictedStandings[2]?.tla].filter(Boolean));

    let standingPoints = 0;
    if (predictedStandings[0]?.tla === actualStandings[0]?.tla) standingPoints += fs.correct1stPlace;
    if (predictedStandings[1]?.tla === actualStandings[1]?.tla) standingPoints += fs.correct2ndPlace;
    if (predictedStandings[2]?.tla === actualStandings[2]?.tla) standingPoints += fs.correct3rdPlace;
    if (predictedStandings[3]?.tla === actualStandings[3]?.tla) standingPoints += fs.correct4thPlace;

    const updates = { userId, [`gsp_${group}`]: standingPoints };
    for (const team of teams) {
      const tla = team.tla;
      if (actualQualifiers.includes(tla)) {
        updates[`adv_roundOf32_${tla}`] = predictedQualifiers.has(tla) ? advR32Pts : 0;
      } else if (tla !== thirdTla) {
        updates[`adv_roundOf32_${tla}`] = deleteField();
      }
    }

    // setDoc with merge creates the doc if it doesn't exist yet
    batch.set(doc(db, 'preTournamentBracket', userId), updates, { merge: true });
    affectedUserIds.add(userId);
  }

  await batch.commit();
  await recalcUsers(affectedUserIds);

  // Once all 12 groups are done, score best-3rd place R32 advancement
  await calculateBest3rdAdvancementIfReady();
}

// R32 advancement for best 3rd-place qualifiers — runs only after all 12 groups are finished
async function calculateBest3rdAdvancementIfReady() {
  const scoreStateRef = doc(db, 'config', 'scoringState');

  // Fetch all group matches to compute actual standings per group
  const allGroupMatchesSnap = await getDocs(query(collection(db, 'matches'), where('stage', '==', 'group')));
  const matchesByGroup = {};
  allGroupMatchesSnap.forEach((d) => {
    const data = d.data();
    if (!matchesByGroup[data.group]) matchesByGroup[data.group] = [];
    matchesByGroup[data.group].push({ id: d.id, ...data });
  });

  // Only proceed when all 12 groups have all 6 matches finished
  const allGroups = 'ABCDEFGHIJKL'.split('');
  const allDone = allGroups.every(
    (g) => matchesByGroup[g]?.length === 6 && matchesByGroup[g].every((m) => m.status === 'finished'),
  );
  if (!allDone) return;

  const allActualStandings = {};
  for (const [g, gMatches] of Object.entries(matchesByGroup)) {
    const teamMap = {};
    for (const m of gMatches) {
      teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA };
      teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB };
    }
    const actualPreds = {};
    for (const m of gMatches) {
      actualPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
    }
    allActualStandings[g] = computeGroupStandings(Object.values(teamMap), gMatches, actualPreds);
  }

  const actualBest3rd = getBest3rdPlaceTeams(allActualStandings);
  const actualBest3rdSet = new Set(actualBest3rd.map((t) => t.tla));
  // Every group's 3rd-place team — the 8 that advance get credit, the rest get any
  // stale advancement credit cleared. (The per-group pass deliberately leaves the
  // 3rd-place team untouched, so this pass is the sole owner of those keys.)
  const allThirdTlas = Object.values(allActualStandings).map((s) => s[2]?.tla).filter(Boolean);

  // Re-run only when the third-place configuration changes (which team is 3rd in each
  // group and whether it qualified). Group predictions are locked pre-tournament, so the
  // credit can only change when real results do. This replaces a sticky boolean flag,
  // which could permanently block scoring if it was ever set before the real results came in.
  const best3rdSignature = allGroups
    .map((g) => `${g}:${allActualStandings[g]?.[2]?.tla ?? ''}:${actualBest3rdSet.has(allActualStandings[g]?.[2]?.tla) ? 1 : 0}`)
    .join('|');
  const scoreStateSnap = await getDoc(scoreStateRef);
  if (scoreStateSnap.data()?.['best3rd_signature'] === best3rdSignature) return;

  // Fetch all group predictions to compute each user's predicted best-3rd
  const allGroupPredsSnap = await getDocs(collection(db, 'preTournamentGroupPredictions'));
  const allPredsByUser = {};
  allGroupPredsSnap.forEach((d) => {
    const pd = d.data();
    if (!allPredsByUser[pd.userId]) allPredsByUser[pd.userId] = {};
    allPredsByUser[pd.userId][pd.matchId] = pd;
  });

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  const batch = writeBatch(db);
  const affectedUserIds = new Set();
  const advR32Pts = scoring.knockout.teamAdvancement.roundOf32;

  bracketSnap.forEach((bracketDoc) => {
    const userId = bracketDoc.data().userId;
    if (!userId) return;

    const userPreds = allPredsByUser[userId] || {};

    // Compute predicted 3rd-place teams from each group, and the predicted top-2 set
    const predictedThirdCandidates = [];
    const predictedTop2Set = new Set();
    for (const [g, gMatches] of Object.entries(matchesByGroup)) {
      const teamMap = {};
      for (const m of gMatches) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA };
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB };
      }
      const standings = computeGroupStandings(Object.values(teamMap), gMatches, userPreds);
      if (standings[0]) predictedTop2Set.add(standings[0].tla);
      if (standings[1]) predictedTop2Set.add(standings[1].tla);
      if (standings[2]) predictedThirdCandidates.push({ ...standings[2], fromGroup: g });
    }

    // Rank predicted 3rd-place teams the same way getBest3rdPlaceTeams does
    const predictedBest3rdSet = new Set(
      predictedThirdCandidates
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.tla.localeCompare(b.tla);
        })
        .slice(0, 8)
        .map((t) => t.tla),
    );

    const updates = {};
    for (const tla of allThirdTlas) {
      if (actualBest3rdSet.has(tla)) {
        // Credit users who predicted the team to advance either as a best-3rd OR in their group's top 2
        updates[`adv_roundOf32_${tla}`] = (predictedBest3rdSet.has(tla) || predictedTop2Set.has(tla)) ? advR32Pts : 0;
      } else {
        // 3rd-place team that did NOT advance — clear any stale advancement credit.
        updates[`adv_roundOf32_${tla}`] = deleteField();
      }
    }
    if (Object.keys(updates).length > 0) {
      batch.update(bracketDoc.ref, updates);
      affectedUserIds.add(userId);
    }
  });

  await setDoc(scoreStateRef, { best3rd_signature: best3rdSignature }, { merge: true });
  await batch.commit();

  await recalcUsers(affectedUserIds);
}

// Team advancement scoring — called when a knockout match finishes
async function calculateAdvancementPoints(winnerTla, stage) {
  const slots = STAGE_BRACKET_SLOTS[stage];
  if (!slots || !winnerTla) return;

  const advPoints = scoring.knockout.teamAdvancement[stage] || 0;
  if (advPoints === 0) return;

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  const batch = writeBatch(db);
  const affectedUserIds = new Set();

  bracketSnap.forEach((bracketDoc) => {
    const data = bracketDoc.data();
    const userId = data.userId;
    if (!userId) return;

    // Award points if user picked this winner in any slot of this stage
    const predicted = slots.some((slot) => data[`pick_${slot}`] === winnerTla);
    batch.update(bracketDoc.ref, { [`adv_${stage}_${winnerTla}`]: predicted ? advPoints : 0 });
    affectedUserIds.add(userId);
  });

  await batch.commit();

  await recalcUsers(affectedUserIds);
}

// Tournament outcome scoring — called after final or 3rd place finishes
// Requires both matches to be finished before awarding points
async function calculateTournamentOutcomePoints() {
  // Fetch actual final match
  const finalSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'final'), where('status', '==', 'finished')),
  );
  if (finalSnap.empty) return;

  const finalMatch = finalSnap.docs[0].data();
  const actualChampion = getMatchWinnerTla(finalMatch);
  if (!actualChampion) return; // winner not yet determinable (e.g. penalties not recorded)
  const actualRunnerUp = actualChampion === finalMatch.tlaA ? finalMatch.tlaB : finalMatch.tlaA;

  // Fetch actual 3rd place match
  const thirdSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'thirdPlace'), where('status', '==', 'finished')),
  );
  if (thirdSnap.empty) return;

  const thirdMatch = thirdSnap.docs[0].data();
  const actual3rd = getMatchWinnerTla(thirdMatch);
  if (!actual3rd) return;

  // Each user's predicted champion / runner-up / 3rd come from their resolved
  // bracket (score-based winners), NOT the pick_* fields — those only hold a
  // tiebreaker when a match ended in a tie, so most users wouldn't be scored.
  const resolvedByUser = {};
  for (const u of await resolveAllUsersBrackets()) resolvedByUser[u.userId] = u.resolved;

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  const batch = writeBatch(db);
  const affectedUserIds = new Set();

  bracketSnap.forEach((bracketDoc) => {
    const data = bracketDoc.data();
    const userId = data.userId;
    if (!userId) return;

    let points = 0;
    const tc = scoring.tournamentOutcome;

    const resolved = resolvedByUser[userId];
    if (resolved) {
      const f = resolved['final'];
      const champion = f?.winner || null;
      // Runner-up = the finalist who isn't the champion
      const runnerUp = champion ? (champion === f.home?.tla ? f.away?.tla : f.home?.tla) : null;
      const third = resolved['3rd']?.winner || null;

      if (champion && champion === actualChampion) points += tc.correctChampion;
      if (runnerUp && runnerUp === actualRunnerUp) points += tc.correctRunnerUp;
      if (third && third === actual3rd) points += tc.correct3rdPlace;
    }

    batch.update(bracketDoc.ref, { tournamentOutcomePoints: points });
    affectedUserIds.add(userId);
  });

  await batch.commit();

  await recalcUsers(affectedUserIds);
}

// Recompute the leaderboard "position movement" arrows. Called only when a match
// genuinely finishes for the first time — never on live updates, admin re-runs of an
// already-scored match, or full recalculations — so the arrows reflect the movement
// caused by the latest completed match and stay stable in between.
//
// Stored at leaderboard/rankSnapshot as:
//   { ranks:  { userId: rankNow },              ← baseline for the next match
//     change: { userId: prevRank - rankNow } }  ← what the UI renders (positive = up)
async function updateRankMovement() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const newRanks = rankPlayersMap(users);

  const prevDoc = await getDoc(doc(db, 'leaderboard', 'rankSnapshot'));
  const prevRanks = prevDoc.exists() ? prevDoc.data().ranks || {} : {};

  const change = {};
  for (const [uid, rank] of Object.entries(newRanks)) {
    const prev = prevRanks[uid];
    change[uid] = prev != null ? prev - rank : 0; // positive = moved up since last match
  }

  await setDoc(doc(db, 'leaderboard', 'rankSnapshot'), { ranks: newRanks, change, updatedAt: Date.now() });
}

// Final scoring when a match finishes — no guard so admin overrides can be re-run
export async function calculatePointsForMatch(matchId, scoreA, scoreB, stage) {
  const matchRef = doc(db, 'matches', String(matchId));
  const matchSnap = await getDoc(matchRef);
  const matchData = matchSnap.data();
  // A genuine first-time finish (vs. an admin re-save/override of an already-scored
  // match) is the only thing that should move the leaderboard arrows.
  const wasAlreadyScored = matchData?.pointsCalculated === true;

  // Reset points for all predictions on this match before recalculating
  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', '==', String(matchId))),
  );
  const affectedUserIds = new Set();
  const resetBatch = writeBatch(db);
  groupPredsSnap.forEach((predDoc) => {
    resetBatch.update(predDoc.ref, { pointsEarned: 0, isExact: false, resultTier: 0 });
    affectedUserIds.add(predDoc.data().userId);
  });
  await resetBatch.commit();

  const recalcUserIds = await _writePredictionPoints(matchId, scoreA, scoreB, stage, matchData?.tlaA, matchData?.tlaB, matchData?.winner);
  for (const uid of recalcUserIds) affectedUserIds.add(uid);

  await updateDoc(matchRef, { pointsCalculated: true });

  await recalcUsers(affectedUserIds);

  // Group final standings scoring — triggers when all 6 matches in a group finish
  if (stage === 'group' && matchData?.group) {
    await calculateGroupStandingsPoints(matchData.group);
  }

  // Knockout advancement scoring
  if (stage !== 'group' && stage !== 'thirdPlace') {
    const winnerTla = getMatchWinnerTla(matchData);
    if (winnerTla) {
      await calculateAdvancementPoints(winnerTla, stage);
    }
  }

  // Tournament outcome scoring — requires both final and 3rd place to be finished
  if (stage === 'final' || stage === 'thirdPlace') {
    await calculateTournamentOutcomePoints();
  }

  // Refresh the leaderboard movement arrows once all cascading scoring is done, but
  // only for a genuine first-time finish so re-saves/overrides don't reshuffle them.
  if (!wasAlreadyScored) {
    await updateRankMovement();
  }
}

// Live scoring — recalculates every sync, no guard, no rank snapshot, no flag
export async function calculateLivePoints(matchId, scoreA, scoreB, stage, tlaA, tlaB, winner = null) {
  const affectedUserIds = await _writePredictionPoints(matchId, scoreA, scoreB, stage, tlaA, tlaB, winner);
  await recalcUsers(affectedUserIds);
}

export async function resetPointsForMatch(matchId) {
  const matchRef = doc(db, 'matches', String(matchId));
  const affectedUserIds = new Set();

  // 1. Reset match state
  await updateDoc(matchRef, {
    scoreA: null,
    scoreB: null,
    winner: null,
    status: 'upcoming',
    pointsCalculated: false,
  });

  // 2. Zero out predictions — each collection updated independently so one failure doesn't block others
  const predsSnap = await getDocs(query(collection(db, 'predictions'), where('matchId', '==', String(matchId))));
  for (const predDoc of predsSnap.docs) {
    await updateDoc(predDoc.ref, { pointsEarned: 0, isExact: false, resultTier: 0 });
    affectedUserIds.add(predDoc.data().userId);
  }

  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', '==', String(matchId))),
  );
  for (const predDoc of groupPredsSnap.docs) {
    await updateDoc(predDoc.ref, { pointsEarned: 0, isExact: false, resultTier: 0 });
    affectedUserIds.add(predDoc.data().userId);
  }

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  for (const bracketDoc of bracketSnap.docs) {
    const data = bracketDoc.data();
    if (`ksp_${matchId}` in data) {
      await updateDoc(bracketDoc.ref, { [`ksp_${matchId}`]: 0, [`kse_${matchId}`]: false, [`kst_${matchId}`]: 0 });
      if (data.userId) affectedUserIds.add(data.userId);
    }
  }

  // 3. Recalculate totals for every affected user
  await recalcUsers(affectedUserIds);
}

// Load every match that has a usable score (live or finished), keyed by string
// matchId → { scoreA, scoreB }. Shared across a recalc batch so we don't refetch
// the matches collection once per user.
async function loadMatchResults() {
  const snap = await getDocs(collection(db, 'matches'));
  const results = {};
  snap.forEach((d) => {
    const m = d.data();
    if (m.scoreA != null && m.scoreB != null) {
      results[d.id] = { scoreA: m.scoreA, scoreB: m.scoreB };
    }
  });
  return results;
}

// Recalculate one or many users in parallel. Loads match results once up front
// (instead of per user) so a single sync doesn't fan out into N serial refetches.
async function recalcUsers(userIds, matchResults) {
  const ids = [...userIds];
  if (ids.length === 0) return;
  const results = matchResults || (await loadMatchResults());
  await Promise.all(ids.map((uid) => recalculateTotalPoints(uid, results)));
}

// Recompute every user's totals and breakdown from scratch. Exposed for the admin
// "Recalcular puntajes" action — also backfills the correctos/DG counts onto users
// whose matches were scored before those fields existed.
export async function recalculateAllUsers() {
  const matchResults = await loadMatchResults();
  const usersSnap = await getDocs(collection(db, 'users'));
  const ids = usersSnap.docs.map((d) => d.id);
  await recalcUsers(ids, matchResults);
  return ids.length;
}

async function recalculateTotalPoints(userId, matchResults) {
  const results = matchResults || (await loadMatchResults());

  let total = 0;
  // Per-user hit breakdown (mutually exclusive tiers), shown on the leaderboard.
  // exactScores doubles as the leaderboard tiebreaker. The breakdown is recomputed
  // directly from the real match results so it can never drift from totalPoints and
  // self-heals for predictions scored before these fields existed.
  let correctScores = 0; // right outcome only
  let goalDiffScores = 0; // right outcome + goal difference
  let exactScores = 0; // exact scoreline

  // Classify one score prediction against its match's real result (if scored yet).
  function tallyPrediction(matchId, predA, predB) {
    const real = results[String(matchId)];
    if (!real) return;
    const t = resultTier(predA, predB, real.scoreA, real.scoreB);
    if (t === 3) exactScores++;
    else if (t === 2) goalDiffScores++;
    else if (t === 1) correctScores++;
  }

  // Live knockout predictions
  const predsSnap = await getDocs(query(collection(db, 'predictions'), where('userId', '==', userId)));
  predsSnap.forEach((d) => {
    const p = d.data();
    total += p.pointsEarned || 0;
    tallyPrediction(p.matchId, p.predictedScoreA, p.predictedScoreB);
  });

  // Group stage predictions
  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('userId', '==', userId)),
  );
  groupPredsSnap.forEach((d) => {
    const p = d.data();
    total += p.pointsEarned || 0;
    tallyPrediction(p.matchId, p.predictedScoreA, p.predictedScoreB);
  });

  // Bracket doc: all scored fields. Bracket knockout-score hits are keyed by slot,
  // not real match id, so they keep using the stored kst_/kse_ tier flags.
  const bracketSnap = await getDoc(doc(db, 'preTournamentBracket', userId));
  if (bracketSnap.exists()) {
    const data = bracketSnap.data();
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('ksp_')) {
        total += val || 0; // bracket knockout scores (scaled)
        const matchId = key.slice(4);
        const tier = data[`kst_${matchId}`] ?? (data[`kse_${matchId}`] ? 3 : 0);
        if (tier === 3) exactScores++;
        else if (tier === 2) goalDiffScores++;
        else if (tier === 1) correctScores++;
      }
      if (key.startsWith('gsp_')) total += val || 0; // group final standings
      if (key.startsWith('adv_')) total += val || 0; // team advancement
    }
    total += data.tournamentOutcomePoints || 0; // champion / runner-up / 3rd place
    total += data.awardPoints || 0; // golden boot / golden ball
  }

  await updateDoc(doc(db, 'users', userId), {
    totalPoints: total,
    exactScores,
    goalDiffScores,
    correctScores,
  });
}

// Normalizes player names for comparison: lowercase, trimmed, accents stripped
function normalizePlayerName(name) {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Award points for correctly predicting Golden Boot / Golden Ball winners.
// Called by admin after FIFA announces the awards.
// Saves actual winners to config/tournamentResults and scores all users.
// Comparison is accent-insensitive and case-insensitive.
export async function calculateAwardPoints(goldenBoot, goldenBall, babyGender = '') {
  await setDoc(
    doc(db, 'config', 'tournamentResults'),
    { goldenBoot, goldenBall, babyGender, updatedAt: Timestamp.now() },
    { merge: true },
  );

  const normBoot = normalizePlayerName(goldenBoot);
  const normBall = normalizePlayerName(goldenBall);

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'));
  const batch = writeBatch(db);
  const affectedUserIds = new Set();

  bracketSnap.forEach((bracketDoc) => {
    const data = bracketDoc.data();
    const userId = data.userId;
    if (!userId) return;

    let points = 0;
    if (normBoot && normalizePlayerName(data.goldenBoot) === normBoot) {
      points += scoring.individualAwards.goldenBoot;
    }
    if (normBall && normalizePlayerName(data.goldenBall) === normBall) {
      points += scoring.individualAwards.goldenBall;
    }
    if (babyGender && data.babyGender === babyGender) {
      points += scoring.individualAwards.babyGender;
    }

    batch.update(bracketDoc.ref, { awardPoints: points });
    affectedUserIds.add(userId);
  });

  await batch.commit();

  await recalcUsers(affectedUserIds);
}
