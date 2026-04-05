import 'dotenv/config';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import profileRouter from './routes/profile.js';
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
    req.session = session ?? null;
  } catch {
    req.session = null;
  }
  next();
});

// ── Auth login page — auto-submits POST to genericOAuth sign-in endpoint ──
app.get('/auth/login', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Signing in…</title></head>
<body>
<form id="f" method="POST" action="/api/auth/sign-in/oauth2">
  <input type="hidden" name="providerId" value="authelia">
  <input type="hidden" name="callbackURL" value="/">
</form>
<script>document.getElementById('f').submit();</script>
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
