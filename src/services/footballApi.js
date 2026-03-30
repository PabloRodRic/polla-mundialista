// All requests go through /football-api/* which is:
//   Dev  → Vite proxy → https://api.football-data.org/v4/* (API key injected by proxy)
//   Prod → Vercel rewrite → /api/football-proxy (API key injected server-side)
// The API key never appears in the client bundle.

const API_BASE = '/football-api'

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`Football API error: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function fetchAllMatches() {
  const data = await apiFetch('/competitions/WC/matches')
  return data.matches
}

export async function fetchStandings() {
  const data = await apiFetch('/competitions/WC/standings')
  return data.standings
}

export async function fetchTeams() {
  const data = await apiFetch('/competitions/WC/teams')
  return data.teams
}

export function hasApiKey() {
  // In dev, check the env var (Vite exposes VITE_* to the client)
  // In prod, the key lives only on the server — assume it's configured if we're deployed
  return import.meta.env.DEV
    ? Boolean(import.meta.env.VITE_FOOTBALL_DATA_API_KEY)
    : true
}
