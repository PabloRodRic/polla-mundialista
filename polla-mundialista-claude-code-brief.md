# Polla Mundialista 2026 — Claude Code Project Brief

## What this is
A World Cup 2026 family prediction pool web app. Family members log in, predict match scores before kickoff, and compete on a leaderboard.

## Current project state
- React + Vite project already scaffolded (`npm create vite@latest`)
- Tailwind CSS v4 installed with `@import "tailwindcss"` in index.css
- **Firebase is NOT yet installed**
- Deployment target: Vercel (free tier)

## Step 1: Install dependencies and configure

Run:
```bash
npm install firebase react-router-dom
```

## Step 2: Configure Vite for Tailwind v4

`vite.config.js` needs the Tailwind v4 Vite plugin:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Check if `@tailwindcss/vite` is installed. If not: `npm install @tailwindcss/vite`

## Step 3: Update `index.html`

- Add Google Fonts: **Unbounded** (display) + **DM Sans** (body)
- Set lang="es", theme-color="#111318"
- Soccer ball emoji as favicon
- Title: "Polla Mundialista 2026"

## Step 4: Set up `src/index.css` with Tailwind v4 theme

Use `@import "tailwindcss"` and `@theme {}` block with these CSS variables:

```
--color-pitch: #0a4d2e
--color-pitch-light: #0d6b3f
--color-pitch-dark: #062e1b
--color-gold: #d4a843
--color-gold-light: #f0d078
--color-gold-dark: #a67c1a
--color-surface: #111318
--color-surface-card: #1a1d24
--color-surface-hover: #22262e
--color-text-primary: #f0f2f5
--color-text-secondary: #8b919a
--color-text-muted: #5a6170
--color-accent-red: #e74c3c
--color-accent-blue: #3498db
--color-border: #2a2e37
--font-display: "Unbounded", system-ui, sans-serif
--font-body: "DM Sans", system-ui, sans-serif
```

Body should use font-body, bg surface color, text primary color, min-h-dvh.

## Step 5: Create `.env.example` and `.env`

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_FOOTBALL_KEY=
```

Make sure `.env` is in `.gitignore`.

## Step 6: Create `src/config/firebase.js`

Initialize Firebase app using env vars. Export:
- `auth` (getAuth)
- `googleProvider` (new GoogleAuthProvider)
- `db` (getFirestore)

## Step 7: Create `src/contexts/AuthContext.jsx`

AuthProvider should:
- Listen to `onAuthStateChanged`
- On first login, create a user doc in Firestore `users/{uid}` with: name, email, photoURL, totalPoints: 0, isAdmin: false, createdAt
- Expose: `user`, `loading`, `loginWithGoogle` (signInWithPopup), `logout`
- useAuth() hook

## Step 8: Create `src/pages/LoginPage.jsx`

Design requirements (mobile-first, dark theme, football aesthetic):
- Full-screen dark gradient background (pitch-dark → surface)
- Radial gradient accents (green top-left, gold bottom-right)
- Subtle concentric circle "pitch lines" as decoration
- Floating country flag images using flagcdn.com (e.g. `https://flagcdn.com/w80/ar.png`) at low opacity
- Slowly spinning soccer ball SVG icon at top
- Title: "Mundial 2026" label above, then "Polla" + "Mundialista" in bold display font (gold accent)
- Subtitle: "Predice los resultados del Mundial 2026 y compite con tu familia."
- White "Continuar con Google" button with Google logo SVG, hover/active scale transitions
- Loading spinner state while authenticating
- Error message display
- Scoring rules preview card at bottom: 3pts = exact score, 1pt = correct result
- Footer: "USA · México · Canadá 2026"
- Smooth float animations on flags, fadeIn on errors

## Step 9: Wire up `src/App.jsx`

Use react-router-dom:
- If not authenticated → show LoginPage
- If authenticated → show Dashboard (placeholder for now)
- Show a loading spinner while auth state is resolving

## Step 10: Update `src/main.jsx`

Wrap App in BrowserRouter and AuthProvider.

---

## Data model (for later steps)

**Firestore collections:**

`users/{uid}`:
- name, email, photoURL, totalPoints, isAdmin, createdAt

`matches/{matchId}`:
- teamA, teamB, flagA, flagB, group, date (Timestamp), scoreA, scoreB
- status: "upcoming" | "live" | "finished"
- matchday, stage (group/round16/quarter/semi/third/final)
- apiFootballId (for auto-sync)

`predictions/{odcId}`:
- odcId, matchId, predictedScoreA, predictedScoreB, pointsEarned

## Auto-score updates (for later)

We'll use API-Football (free tier: 100 requests/day). 
- Sign up at https://www.api-football.com/
- Free tier covers all endpoints including World Cup
- We'll create a Firebase Cloud Function (or a Vercel cron) that:
  1. Polls for live/finished match scores
  2. Updates Firestore match documents
  3. Recalculates points for all predictions

## Flag images

Use flagcdn.com: `https://flagcdn.com/w80/{iso2}.png`
Example: Argentina = `ar`, Brazil = `br`, Ecuador = `ec`

## Design notes

- Mobile-first, works great on phone and iPad
- Dark theme with green (pitch) and gold accents
- Font: Unbounded for headings, DM Sans for body
- Rounded cards, subtle borders, backdrop blur effects
- All Tailwind v4 utility classes, no component libraries
