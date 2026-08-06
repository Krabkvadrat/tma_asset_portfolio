# Deployment

The app auto-deploys to the Raspberry Pi on every push/merge to `main`.

## How it works

1. You merge a PR into `main` (or push directly).
2. GitHub Actions (`.github/workflows/deploy.yml`) connects to the Pi over SSH.
3. On the Pi it remembers the current commit, then updates to latest `main`:
   ```bash
   cd $DEPLOY_PATH
   PREV_SHA=$(git rev-parse HEAD)
   git fetch --prune origin
   git reset --hard origin/main
   bash scripts/deploy.sh        # build + health-check + rollback
   ```
4. `scripts/deploy.sh` rebuilds the `backend` and `frontend` images on the Pi,
   recreates the stack, then **health-checks** it. If the check fails it
   **rolls back**.

Images are built **on the Pi** from source — no container registry is involved.
A cold build of both images on ARM takes several minutes, which is why the
workflow uses SSH keepalives.

You can also re-deploy without a new commit:
**GitHub → Actions → "Deploy to Raspberry Pi" → Run workflow**.

### Health check

`nginx` publishes no host port — only the `tunnel` container reaches it — so the
probes run from inside the compose network via the nginx container's busybox
`wget`. The deploy is healthy only when **all** hold within **120s**:

- neither `backend` nor `frontend` is crash-looping (`RestartCount == 0` on the
  freshly created containers),
- `http://localhost/` answers inside the nginx container — nginx → frontend, so
  the SPA is really being served, and
- `http://backend:8000/` answers — FastAPI's root. Reaching it implies the
  database was up too, since the `lifespan` handler runs `create_all` before the
  app serves anything.

Probing here rather than through the public hostname keeps a Cloudflare outage
from being reported as a bad deploy.

### Rollback

Before rebuilding, the current `tma-portfolio-backend:prod` and
`tma-portfolio-frontend:prod` images are tagged `:prev`. If the health check
fails, `scripts/deploy.sh`:

1. retags `:prev → :prod` for both and recreates the stack from the **previous
   images** (`docker compose up -d --force-recreate`, no rebuild), and
2. exits non-zero — at which point the workflow restores the Pi's git checkout
   to `PREV_SHA`, so source and running images stay in sync.

The Actions run is marked **failed** so you get notified. The previous version
keeps running. (On the very first deploy there is no `:prev` image yet, so a
failure leaves the new containers in place and only reports the error.)

This Pi is shared with other projects, so the script never prunes broadly: on a
successful deploy it removes only this project's own superseded image.

## One-time setup

### 1. On the Pi

- Clone the repo at a fixed path (this becomes `DEPLOY_PATH`) and make sure the
  stack already runs by hand:
  ```bash
  ./deploy.sh up
  ```
- `./.env` must exist with the real `BOT_TOKEN` (and `TUNNEL_TOKEN` /
  `APP_HOSTNAME` if you use a named tunnel). It is gitignored, so it survives
  `git reset --hard`.
- The checkout must have **no local edits** to tracked files — `git reset --hard`
  discards them. Keep Pi-specific config in `.env` only.

### 2. Create a deploy SSH key

Give this repo its own key rather than sharing another project's, so revoking one
does not lock the other out. On your laptop:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/<KEY> -N "" -C "github-actions-tma-portfolio"
ssh-copy-id -i ~/.ssh/<KEY>.pub -p <PORT> <DEPLOY_USER>@<HOST>
```
The **private** key goes into the `DEPLOY_SSH_KEY` secret below; delete the local
copy once the first deploy has succeeded.

`DEPLOY_USER` must be the user that **owns the clone** at `DEPLOY_PATH` and is in
the `docker` group — the workflow runs `git reset --hard` and `docker compose`
as that user, without `sudo`.

The clone does not have to live in that user's home: it can sit in another
account's home as long as the project directory itself is chown'd to the deploy
user and every parent directory grants it the `x` (traverse) bit.
```bash
sudo chown -R <DEPLOY_USER>:<DEPLOY_USER> <DEPLOY_PATH>
```

### 3. Add GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret           | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| `DEPLOY_SSH_KEY` | full contents of the private key                          |
| `DEPLOY_HOST`    | the Pi's IP or hostname                                   |
| `DEPLOY_USER`    | SSH user (the one with the deploy key authorized)         |
| `DEPLOY_PATH`    | absolute path to **this** repo's clone on the Pi          |
| `DEPLOY_PORT`    | SSH port (optional — defaults to `22`)                    |

Host, user and port are deployment details, not repo content — they live only in
these secrets, never in tracked files.

> Add these **before** merging the workflow to `main`, otherwise the first
> auto-deploy run will fail with missing-secret errors.

### 4. Use a named tunnel

With the quick tunnel (`cloudflared tunnel --url http://nginx:80`) the public
`*.trycloudflare.com` hostname changes every time the stack restarts — so every
auto-deploy would silently break the Telegram menu button until you re-ran
`./deploy.sh set-bot-url` by hand. Point the stack at a **named** tunnel with a
fixed `APP_HOSTNAME` before relying on auto-deploy; then `set-bot-url` is a
one-time step.

## Manual deploy (fallback)

If Actions is unavailable, deploy by hand on the Pi:
```bash
cd $DEPLOY_PATH
git fetch --prune origin && git reset --hard origin/main
bash scripts/deploy.sh
```

`./deploy.sh` in the repo root stays the tool for everyday operations —
`up`, `down`, `rebuild`, `logs`, `status`, `url`, `set-bot-url`.

## Troubleshooting

- **Logs:** `./deploy.sh logs` (or `docker compose -f docker-compose.prod.yml logs -f`)
- **Permission denied (publickey):** the public key isn't in the Pi user's
  `authorized_keys`, or `DEPLOY_USER` is wrong.
- **Host key verification failed:** the workflow runs `ssh-keyscan` each time; if
  the Pi's host key changed, the run picks up the new one automatically.
- **Health check times out on a cold build:** the first deploy after a long gap
  rebuilds everything; the build happens *before* the 120s health window starts,
  so this usually means the app genuinely failed to start — check the logs the
  script dumps in the failed run.
