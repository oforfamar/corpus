# corpus

Self-hosted body composition tracker with OIDC authentication, built with Node.js, SQLite, and Chart.js.

## Features

- Log body measurements on any date (weight, BMI, body fat %, body water %, muscle mass, bone mass, visceral fat, metabolic age, BMR)
- Per-limb breakdown: left arm, right arm, left leg, right leg, trunk (muscle kg + fat %)
- Interactive line charts per metric group, with multi-user coloured lines
- Derived metrics dashboard: auto-BMI, ideal weight band, ACE body fat reference bands, metabolic age delta, Mifflin-St Jeor BMR comparison
- Full measurement history table with edit and delete (own entries only)
- Multi-user support — each user's data is labelled and filterable
- User profiles (date of birth, height, sex) stored once and used for all derivations
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
| `AUTH_BYPASS` | Set to `true` to skip OIDC entirely (development only, never in production) |

### 3. Register the OIDC client in Authelia

Add to your Authelia `configuration.yml`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: corpus
        client_secret: '<hashed-secret>'  # hash with: authelia crypto hash generate pbkdf2 --variant sha512
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
        token_endpoint_auth_method: client_secret_post
```

> **`token_endpoint_auth_method: client_secret_post` is required.** better-auth sends the client secret in the POST body, but Authelia defaults to `client_secret_basic` (Authorization header). Without this, the token exchange will fail with `oauth_code_verification_failed`.

> **`AUTHELIA_ISSUER` must not have a trailing slash** in `.env`, e.g. `https://auth.yourdomain.com` not `https://auth.yourdomain.com/`.

### 4. Run

```bash
node server.js
# or for development with auto-restart:
npm run dev
```

Open `http://localhost:3000` — you will be redirected to Authelia to log in.

---

## Running as a service

### Debian / Ubuntu (systemd)

**1. Create a dedicated user and install the app**

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin corpus
sudo mkdir -p /opt/corpus
sudo git clone https://github.com/oforfamar/corpus.git /opt/corpus
cd /opt/corpus && sudo -u corpus npm install --omit=dev
sudo cp /opt/corpus/.env.example /opt/corpus/.env
# edit /opt/corpus/.env with your values
sudo chown corpus:corpus /opt/corpus/.env
sudo chmod 640 /opt/corpus/.env
```

**2. Install and enable the systemd unit**

```bash
sudo cp /opt/corpus/systemd/corpus.service /etc/systemd/system/corpus.service
sudo systemctl daemon-reload
sudo systemctl enable corpus
sudo systemctl start corpus
```

**3. Check status and logs**

```bash
sudo systemctl status corpus
sudo journalctl -u corpus -f
```

**4. Update the app**

```bash
cd /opt/corpus
sudo -u corpus git pull
sudo -u corpus npm install --omit=dev
sudo systemctl restart corpus
```

The service file is at [`systemd/corpus.service`](systemd/corpus.service). It runs under a dedicated `corpus` user, writes logs to the systemd journal, and restricts write access to `data/` only.

---

### Alpine Linux (OpenRC)

**1. Install Node.js and create a dedicated user**

```bash
apk add nodejs npm git
adduser -S -D -H -s /sbin/nologin corpus
addgroup corpus corpus
```

**2. Install the app**

```bash
mkdir -p /opt/corpus
git clone https://github.com/oforfamar/corpus.git /opt/corpus
cd /opt/corpus && npm install --omit=dev
cp /opt/corpus/.env.example /opt/corpus/.env
# edit /opt/corpus/.env with your values
chown corpus:corpus /opt/corpus/.env
chmod 640 /opt/corpus/.env
```

**3. Install and enable the OpenRC init script**

```bash
cp /opt/corpus/systemd/corpus.openrc /etc/init.d/corpus
chmod +x /etc/init.d/corpus
rc-update add corpus default
rc-service corpus start
```

**4. Check status and logs**

```bash
rc-service corpus status
tail -f /var/log/corpus/corpus.log
tail -f /var/log/corpus/corpus.err
```

**5. Update the app**

```bash
cd /opt/corpus
git pull
npm install --omit=dev
rc-service corpus restart
```

The init script is at [`systemd/corpus.openrc`](systemd/corpus.openrc). It sources `.env` on startup, creates log and data directories with correct ownership, and runs under the `corpus` user.

---

## Data storage

The SQLite database is created automatically at `data/tracker.db` on first run.
Back it up by copying that file.

## License

MIT
