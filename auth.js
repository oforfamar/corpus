import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { Kysely, SqliteDialect } from 'kysely';
import { db } from './db.js';

// Share the same better-sqlite3 Database instance for auth tables
const kyselyDb = new Kysely({
  dialect: new SqliteDialect({ database: db }),
});

export const auth = betterAuth({
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  secret: process.env.SESSION_SECRET,
  database: kyselyAdapter(kyselyDb, { type: 'sqlite' }),

  // Disable email/password — OIDC only
  emailAndPassword: { enabled: false },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'authelia',
          discoveryUrl: `${process.env.AUTHELIA_ISSUER}/.well-known/openid-configuration`,
          clientId: process.env.OIDC_CLIENT_ID,
          clientSecret: process.env.OIDC_CLIENT_SECRET,
          scopes: ['openid', 'profile', 'email'],
          pkce: true,
        },
      ],
    }),
  ],

  // Map OIDC claims → better-auth user fields
  user: {
    additionalFields: {},
  },
});
