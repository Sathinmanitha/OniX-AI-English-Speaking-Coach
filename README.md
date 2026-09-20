# OniX AI – Gemini English Coach v15

OniX AI is a responsive real-time English speaking coach built with React, Node.js, Gemini Live and Gemini Transcribe Live.

## v15 updates

### Animated OniX coach — no video

- The uploaded example speaking video is **not used** in this version.
- The previous OniX coach has been rebuilt as an original animated vector male coach with a more polished, modern look: black hair, blue eyes, dark hoodie and OniX branding.
- The coach is rendered directly in React/SVG, so there is no MP4 dependency and no hidden video audio.
- Eyes blink and subtly move throughout the session.
- The mouth animates only while Gemini/OniX audio is speaking.
- The head has subtle speaking/listening motion.
- Technology rings, scanning lines, HUD marks, glow and orbit animations remain behind the coach.

### Voice selection is persistent and locked per session

The learner-facing male voice names are:

- **James – Upbeat** → Gemini `Puck` (default)
- **Daniel – Informative** → Gemini `Charon`
- **Ryan – Energetic** → Gemini `Fenrir`

The selected voice is saved in browser storage and is reused on every new conversation until the learner changes it in Settings. During an active conversation, voice selection is disabled and the voice is locked when the Live session starts. The system prompt also tells OniX not to imitate or switch vocal identities.

### OniX branding

- `frontend/public/assets/logo.png` is used as the main application logo.
- `frontend/public/assets/logo2.png` is used for the browser tab favicon, mobile brand icon, coach mini-icon, Settings icon and service branding.
- Browser favicon is configured directly in `frontend/index.html`.

## Reliability features retained

- Dark mode is the default; light mode is optional.
- Raw Gemini/API JSON errors are hidden from learners.
- Temporary 429/5xx/503/high-demand failures are retried.
- Gemini text feedback has a fallback model.
- Live speech and the precision English transcription stream use short-lived session tokens.
- Precision transcription reconnects automatically when temporarily unavailable.
- Azure is not required.

## Requirements

- Node.js 20+
- Gemini API key with access to the configured models
- Chrome or Edge recommended for microphone support

## 1. Create `.env` in the project root

Copy `.env.example` to `.env`:

```env
GEMINI_API_KEY=YOUR_REAL_GEMINI_API_KEY

GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe-live
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_TEXT_FALLBACK_MODEL=gemini-3.5-flash

PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:5000
```

Never expose the permanent Gemini API key in frontend source code and never commit `.env` to Git.

## 2. Install

```powershell
npm install
```

## 3. Run

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:5000/api/health
```

## Voice behavior

The visible names are deliberately normal male names. Gemini still requires its internal voice identifiers (`Puck`, `Charon`, `Fenrir`) in API requests. Do not replace those internal values unless Gemini changes its supported voice identifiers.

The selected voice is stored under `onix-settings-v15`. v15 also migrates an existing valid voice from v6 so an upgrade does not unexpectedly change the learner's chosen voice.

## Coach animation

The animated coach is defined in:

```text
frontend/src/App.jsx
```

Animation styling is in:

```text
frontend/src/styles.css
```

There is no coach video file in v15.

## Production API base

For deployment, set:

```env
VITE_API_BASE_URL=https://your-backend-domain.example
```

Only `VITE_` variables are exposed to frontend code. Never rename `GEMINI_API_KEY` with a `VITE_` prefix.


## v15 visual updates
- Light mode is now the default.
- The OniX coach has no rectangular/square background.
- Light-mode text uses black/black-opacity values for stronger readability.
- The coach SVG has a more natural human-like face, darker hair, subtler eyes and facial shading while preserving live blinking and mouth movement.
- Logo container background is transparent in light mode.
- Responsive text sizes were increased across desktop, tablet and mobile layouts.

## GitHub Pages deployment note

GitHub Pages hosts only the React frontend. The Express backend must still be deployed on a server/service because it protects the permanent Gemini API key and provides `/api/session/token` and `/api/analyze`.

This project allows requests from the production GitHub Pages origin `https://sathinmanitha.github.io` by default. If you deploy the frontend on another domain, add that origin to `FRONTEND_ORIGINS` (comma-separated) or `FRONTEND_ORIGIN` in the backend environment.

The Pages workflow currently builds the frontend with:

```text
VITE_API_BASE_URL=https://onix-ai-backend.onrender.com
```

If your backend uses a different URL, update `.github/workflows/deploy.yml` before redeploying the frontend. Do not put `GEMINI_API_KEY` into any `VITE_` variable or frontend file.
