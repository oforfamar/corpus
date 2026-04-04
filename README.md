# corpus

Self-hosted body composition tracker with OIDC authentication, built with Node.js, SQLite, and Chart.js.

## Features

- Log body measurements on any date (weight, BMI, body fat %, body water %, muscle mass, bone mass, visceral fat, metabolic age, BMR)
- Per-limb breakdown: left arm, right arm, left leg, right leg, trunk (muscle kg + fat %)
- Interactive line charts per metric group, with multi-user coloured lines
- Full measurement history table with edit and delete (own entries only)
- Multi-user support — each user's data is labelled and filterable
- OIDC login via [Authelia](https://www.authelia.com/) (or any OIDC-compliant provider) using [better-auth](https://better-auth.com/)
- Data stored in a local SQLite database file

## Requirements

- Node.js 20+
- An Authelia (or other OIDC) instance with a client configured

## Setup

### 1. Clone and install

```bash
git clone https://github.com/oforfamar/corpus.git
cd corpus
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|---|---|
| `AUTHELIA_ISSUER` | OIDC issuer URL (e.g. `https://auth.yourdomain.com`) |
| `OIDC_CLIENT_ID` | Client ID registered in Authelia |
| `OIDC_CLIENT_SECRET` | Client secret |
| `BASE_URL` | Public URL of this app (used for the OIDC redirect URI) |
| `SESSION_SECRET` | Long random string to sign session cookies |
| `PORT` | Port to listen on (default: `3000`) |

### 3. Register the OIDC client in Authelia

Add to your Authelia `configuration.yml`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: corpus
        client_secret: '<your-hashed-secret>'
        redirect_uris:
          - https://corpus.yourdomain.com/api/auth/oauth2/callback/authelia
        scopes:
          - openid
          - profile
          - email
        response_types:
          - code
        grant_types:
          - authorization_code
        pkce_challenge_method: S256
```

### 4. Run

```bash
node server.js
# or for development with auto-restart:
npm run dev
```

Open `http://localhost:3000` — you will be redirected to Authelia to log in.

## Data storage

The SQLite database is created automatically at `data/tracker.db` on first run.  
Back it up by copying that file.

## License

MIT
