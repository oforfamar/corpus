import 'dotenv/config';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import profileRouter from './routes/profile.js';
import importRouter from './routes/import.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_BYPASS = process.env.AUTH_BYPASS === 'true';

if (AUTH_BYPASS) {
  console.warn('[corpus] ⚠  AUTH_BYPASS=true — all requests are authenticated as Dev User. Never use this in production.');
}

// ── Parse JSON bodies ──────────────────────────────────────────────────────
app.use(express.json());

// ── better-auth handler (mounts /api/auth/*) ──────────────────────────────
// Skipped entirely in bypass mode (no OIDC needed)
if (!AUTH_BYPASS) {
  app.all('/api/auth/*splat', toNodeHandler(auth));
}

// ── Session middleware ─────────────────────────────────────────────────────
app.use(async (req, _res, next) => {
  if (AUTH_BYPASS) {
    req.session = {
      userId: 'dev-user',
      user: { id: 'dev-user', name: 'Dev User', email: 'dev@localhost' },
    };
    return next();
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    req.session = session ? { userId: session.user.id, user: session.user } : null;
  } catch {
    req.session = null;
  }
  next();
});

// ── Auth login page — POSTs JSON to genericOAuth sign-in endpoint ──────────
app.get('/auth/login', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing in… — Corpus</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2e3148;
    --accent: #6c8ef5; --text: #e2e5f0; --muted: #7b82a0; --danger: #e05c6e;
  }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: radial-gradient(circle at 50% 0%, #1a1d27 0%, var(--bg) 60%);
    color: var(--text); min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.5);
    padding: 2.5rem 2rem; max-width: 380px; width: 100%; text-align: center;
  }
  .logo {
    font-size: 1.1rem; font-weight: 700; letter-spacing: .15em;
    color: var(--accent); margin-bottom: 1.75rem;
  }
  .spinner {
    width: 40px; height: 40px; margin: 0 auto 1.25rem;
    border: 3px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .title { font-size: 1.05rem; font-weight: 600; margin-bottom: .4rem; }
  .subtitle { font-size: .85rem; color: var(--muted); }
  .icon-error {
    width: 48px; height: 48px; margin: 0 auto 1rem;
    border-radius: 50%; background: rgba(224,92,110,.12);
    display: flex; align-items: center; justify-content: center;
    color: var(--danger); font-size: 1.5rem; font-weight: 700;
  }
  .btn {
    margin-top: 1.5rem; background: var(--accent); color: #fff;
    border: none; padding: .6rem 1.4rem; border-radius: 7px;
    font-size: .9rem; font-weight: 500; cursor: pointer;
    transition: filter .15s; font-family: inherit;
  }
  .btn:hover { filter: brightness(1.1); }
  .hidden { display: none; }
  .detail { font-size: .75rem; color: var(--muted); margin-top: .75rem; word-break: break-word; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">CORPUS</div>
    <div id="loading">
      <div class="spinner"></div>
      <div class="title">Signing you in…</div>
      <div class="subtitle">Redirecting to your identity provider</div>
    </div>
    <div id="error" class="hidden">
      <div class="icon-error">!</div>
      <div class="title">Sign-in failed</div>
      <div class="subtitle">We couldn't reach the authentication server.</div>
      <div id="detail" class="detail"></div>
      <button class="btn" onclick="location.reload()">Try again</button>
    </div>
  </div>
<script>
  function showError(msg) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    if (msg) document.getElementById('detail').textContent = msg;
  }
  fetch('/api/auth/sign-in/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'authelia', callbackURL: '/' })
  })
  .then(r => r.json().then(d => ({ ok: r.ok, d })))
  .then(({ ok, d }) => {
    if (d && d.url) { window.location.href = d.url; return; }
    showError(ok ? 'No redirect URL returned.' : (d && d.message) || 'Authentication request failed.');
  })
  .catch(err => showError(err && err.message ? err.message : ''));
</script>
</body>
</html>`);
});

// ── Auth guard — redirect to OIDC login for browser requests ──────────────
app.use((req, res, next) => {
  if (AUTH_BYPASS) return next();
  if (req.path.startsWith('/api/auth')) return next();
  if (req.path.startsWith('/auth/login')) return next();

  if (!req.session) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/auth/login');
  }
  next();
});

// ── Logout ─────────────────────────────────────────────────────────────────
app.post('/api/logout', async (req, res) => {
  if (AUTH_BYPASS) {
    return res.redirect('/');
  }
  try {
    await auth.api.signOut({ headers: req.headers });
  } catch {
    // best-effort — clear the session cookie regardless
  }
  res.redirect('/auth/login');
});

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/profile', profileRouter);
app.use('/api/import', importRouter);

// ── Current user info (used by the SPA) ───────────────────────────────────
app.get('/api/me', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    id: req.session.user?.id,
    name: req.session.user?.name,
    email: req.session.user?.email,
  });
});

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('*splat', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Corpus running at http://localhost:${PORT}`);
});
