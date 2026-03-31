// All requests go through /football-api/* which is:
//   Dev  → Vite proxy → https://api.football-data.org/v4/* (API key injected by proxy)
//   Prod → Vercel rewrite → /api/football-proxy (API key injected server-side)
// The API key never appears in the client bundle.

const isDev = import.meta.env.DEV;

// Dev  → Vite proxy (avoids CORS)
// Prod → direct call (football-data.org allows real domains)
const API_BASE = isDev ? '/football-api' : 'https://api.football-data.org/v4';

const API_KEY = import.meta.env.VITE_FOOTBALL_DATA_API_KEY || '';

async function apiFetch(path) {
  const headers = isDev ? {} : { 'X-Auth-Token': API_KEY };
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchAllMatches() {
  const data = await apiFetch('/competitions/WC/matches');
  return data.matches;
}

export async function fetchStandings() {
  const data = await apiFetch('/competitions/WC/standings');
  return data.standings;
}

export async function fetchTeams() {
  const data = await apiFetch('/competitions/WC/teams');
  return data.teams;
}

export function hasApiKey() {
  return Boolean(API_KEY);
}
