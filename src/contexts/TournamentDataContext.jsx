import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { subscribeToGroupPredictions, subscribeToBracket } from '../services/preTournamentService';
import { compareLeaderboard, rankPlayers } from '../utils/leaderboard';

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
