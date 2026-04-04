import 'dotenv/config';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// ── Parse JSON bodies ──────────────────────────────────────────────────────
app.use(express.json());

// ── better-auth handler (mounts /api/auth/*) ──────────────────────────────
app.all('/api/auth/*splat', toNodeHandler(auth));

// ── Session middleware ─────────────────────────────────────────────────────
// Attaches req.session (and req.session.user) from the better-auth cookie
app.use(async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    req.session = session ?? null;
  } catch {
    req.session = null;
  }
  next();
});

// ── Auth guard — redirect to OIDC login for browser requests ──────────────
app.use((req, res, next) => {
  // Allow auth endpoints and static assets through
  if (req.path.startsWith('/api/auth')) return next();

  if (!req.session) {
    // API calls get 401; browser navigation gets redirected to login
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Redirect browser to better-auth OIDC sign-in
    return res.redirect('/api/auth/sign-in/social?providerId=authelia&callbackURL=/');
  }
  next();
});

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);

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
