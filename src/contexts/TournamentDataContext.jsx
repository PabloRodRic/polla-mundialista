import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { subscribeToGroupPredictions, subscribeToBracket } from '../services/preTournamentService';
import { compareLeaderboard, rankPlayers } from '../utils/leaderboard';
import { resolveFullBracket, buildTeamLookup, BRACKET_R32, BRACKET_R16, BRACKET_QF, BRACKET_SF } from '../utils/bracketUtils';
import { computeGroupStandings, getBest3rdPlaceTeams } from '../utils/standingsCalculator';

const TournamentDataContext = createContext(null);

// Owns every subscription that more than one page reads from: the match fixtures,
// the current user's predictions (group + knockout, merged), and the leaderboard.
// Pages consume the derived values from here instead of re-subscribing and
// re-deriving on their own, so results / predictions / points / totals can't drift
// between the Partidos, Pronóstico, Predicciones and Tabla screens.
export function TournamentDataProvider({ children }) {
  const { user } = useAuth();

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  // Current user's predictions. Group-stage fixtures live in
  // preTournamentGroupPredictions; knockout fixtures in the `predictions` collection.
  const [groupPreds, setGroupPreds] = useState({});
  const [livePreds, setLivePreds] = useState({});
  const [myBracket, setMyBracket] = useState(null);

  // Leaderboard (all users) + the precomputed position-movement arrows.
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [rankChange, setRankChange] = useState({});

  // ─── Matches ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setMatches(data);
        setMatchesLoading(false);
      },
      () => setMatchesLoading(false),
    );
  }, []);

  // ─── Current user's predictions ──────────────────────────────────────────────
  // No need to clear on logout: the provider sits above the login gate, so when
  // `user` is null only the LoginPage renders (no consumer reads these), and a new
  // login re-runs the effect and overwrites the previous user's data.
  useEffect(() => {
    if (!user) return undefined;
    return subscribeToGroupPredictions(user.uid, setGroupPreds);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeToBracket(user.uid, setMyBracket);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'predictions'), orderBy('matchId'));
    return onSnapshot(q, (snap) => {
      const preds = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.userId === user.uid) preds[data.matchId] = { id: d.id, ...data };
      });
      setLivePreds(preds);
    });
  }, [user]);

  // ─── Leaderboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        data.sort(compareLeaderboard);
        setPlayers(data);
        setPlayersLoading(false);
      },
      () => setPlayersLoading(false),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'leaderboard', 'rankSnapshot'), (snap) => {
      if (snap.exists()) setRankChange(snap.data().change || {});
    });
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  // Merged predictions keyed by matchId. Group ids and knockout ids never collide,
  // so a single lookup map serves every match-result surface.
  const userPreds = useMemo(() => ({ ...groupPreds, ...livePreds }), [groupPreds, livePreds]);

  // The tournament "starts" (and pre-tournament predictions lock) when the earliest
  // group-stage match kicks off. Computed once here so every page agrees on the lock.
  const firstGroupMatchDate = useMemo(() => {
    return matches.reduce((earliest, m) => {
      if (m.stage !== 'group') return earliest;
      const d = m.date?.toDate?.();
      if (!d) return earliest;
      return !earliest || d < earliest ? d : earliest;
    }, null);
  }, [matches]);
  const tournamentStarted = firstGroupMatchDate ? new Date() >= firstGroupMatchDate : false;

  // Derived from the current user's resolved Pronóstico bracket vs the real fixtures:
  //   bracketMatchupIds    — real matchIds where BOTH real teams appear in the user's
  //                          bracket at that stage (a "matchup hit"). Keyed for the
  //                          real-match surfaces (Partidos / Llaves).
  //   bracketMatchupSlotIds — bracket slot ids (r32_01… / 'final' / '3rd') whose
  //                          resolved pairing equals a real match. Keyed for the
  //                          Pronóstico bracket surface (FixturePage), whose cards are
  //                          slots, not real matches.
  //   bracketPredByMatchId — the user's bracket score prediction for the slot whose
  //                          resolved pairing equals the real match (exact pair).
  // All mirror the scoring logic in matchSync._writePredictionPoints so the UI and
  // the awarded points always agree.
  const { bracketMatchupIds, bracketMatchupSlotIds, bracketPredByMatchId } = useMemo(() => {
    const empty = { bracketMatchupIds: new Set(), bracketMatchupSlotIds: new Set(), bracketPredByMatchId: {} };
    if (!myBracket) return empty;
    const groupMatchesList = matches.filter((m) => m.stage === 'group');
    if (!groupMatchesList.length) return empty;

    const teamsByTla = buildTeamLookup(groupMatchesList);
    const matchesByGroup = {};
    for (const m of groupMatchesList) {
      if (m.group) (matchesByGroup[m.group] ||= []).push(m);
    }
    const standings = {};
    for (const [g, gms] of Object.entries(matchesByGroup)) {
      const teamMap = {};
      for (const m of gms) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA };
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB };
      }
      standings[g] = computeGroupStandings(Object.values(teamMap), gms, groupPreds);
    }
    const best3rd = getBest3rdPlaceTeams(standings);
    const resolved = resolveFullBracket(standings, best3rd, myBracket, teamsByTla);

    // Teams the user predicted to reach each stage: R32 = the round's participants,
    // R16/QF/SF = the previous round's winners, final = the two SF winners, 3rd = the
    // resolved 3rd-place pair.
    const add = (set, tla) => { if (tla) set.add(tla); };
    const stageTeams = {
      roundOf32: new Set(), roundOf16: new Set(), quarterfinals: new Set(),
      semifinals: new Set(), final: new Set(), thirdPlace: new Set(),
    };
    for (const def of BRACKET_R32) {
      add(stageTeams.roundOf32, resolved[def.id]?.home?.tla);
      add(stageTeams.roundOf32, resolved[def.id]?.away?.tla);
      add(stageTeams.roundOf16, resolved[def.id]?.winner);
    }
    for (const def of BRACKET_R16) add(stageTeams.quarterfinals, resolved[def.id]?.winner);
    for (const def of BRACKET_QF) add(stageTeams.semifinals, resolved[def.id]?.winner);
    add(stageTeams.final, resolved['sf_1']?.winner);
    add(stageTeams.final, resolved['sf_2']?.winner);
    add(stageTeams.thirdPlace, resolved['3rd']?.home?.tla);
    add(stageTeams.thirdPlace, resolved['3rd']?.away?.tla);

    // The bracket slot whose resolved pairing equals a given real match (exact pair).
    const SLOT_DEFS = { roundOf32: BRACKET_R32, roundOf16: BRACKET_R16, quarterfinals: BRACKET_QF, semifinals: BRACKET_SF };
    const isPair = (slotId, tlaA, tlaB) => {
      const h = resolved[slotId]?.home?.tla, a = resolved[slotId]?.away?.tla;
      return !!(h && a && ((h === tlaA && a === tlaB) || (h === tlaB && a === tlaA)));
    };
    const slotForMatch = (m) => {
      const defs = SLOT_DEFS[m.stage];
      if (defs) return defs.find((def) => isPair(def.id, m.tlaA, m.tlaB))?.id ?? null;
      if (m.stage === 'final') return isPair('final', m.tlaA, m.tlaB) ? 'final' : null;
      if (m.stage === 'thirdPlace') return isPair('3rd', m.tlaA, m.tlaB) ? '3rd' : null;
      return null;
    };

    const bracketMatchupIds = new Set();
    const bracketMatchupSlotIds = new Set();
    const bracketPredByMatchId = {};
    for (const m of matches) {
      if (!m.tlaA || !m.tlaB) continue;

      const teams = stageTeams[m.stage];
      if (teams?.has(m.tlaA) && teams.has(m.tlaB)) bracketMatchupIds.add(m.id);

      // A slot whose resolved pairing equals this real match: the real teams sit
      // exactly where the user placed them, so it's also a matchup hit on the
      // bracket surface. (Always a subset of bracketMatchupIds.)
      const slotId = slotForMatch(m);
      if (!slotId) continue;
      bracketMatchupSlotIds.add(slotId);

      const scoreA = myBracket[`ks_${slotId}_A`];
      const scoreB = myBracket[`ks_${slotId}_B`];
      if (scoreA == null || scoreB == null) continue;
      bracketPredByMatchId[m.id] = { scoreA, scoreB, points: myBracket[`ksp_${slotId}`] ?? null };
    }

    return { bracketMatchupIds, bracketMatchupSlotIds, bracketPredByMatchId };
  }, [myBracket, matches, groupPreds]);

  // Tie-aware ranks parallel to `players`, plus a quick lookup for the current user.
  const ranks = useMemo(() => rankPlayers(players), [players]);
  const currentUserIndex = user ? players.findIndex((p) => p.id === user.uid) : -1;
  const currentUserRank = currentUserIndex >= 0 ? ranks[currentUserIndex] : 0;
  const me = currentUserIndex >= 0 ? players[currentUserIndex] : null;

  const value = {
    matches,
    matchesLoading,
    groupPreds,
    livePreds,
    userPreds,
    myBracket,
    bracketMatchupIds,
    bracketMatchupSlotIds,
    bracketPredByMatchId,
    firstGroupMatchDate,
    tournamentStarted,
    players,
    playersLoading,
    ranks,
    rankChange,
    currentUserRank,
    me,
  };

  return <TournamentDataContext.Provider value={value}>{children}</TournamentDataContext.Provider>;
}

export function useTournamentData() {
  const ctx = useContext(TournamentDataContext);
  if (!ctx) throw new Error('useTournamentData must be used within a TournamentDataProvider');
  return ctx;
}
