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

Before anything is rebuilt, `scripts/deploy.sh` checks that `.env` really holds
`BOT_TOKEN`, `TUNNEL_TOKEN` and `APP_HOSTNAME` (a value still equal to
`.env.example`'s counts as unset) and refuses to deploy otherwise — the compose
file itself no longer enforces the token, so that `down`, `logs` and `ps` keep
working on a Pi whose `.env` is empty.

`nginx` publishes no host port — only the `tunnel` container reaches it — so the
internal probes run from inside the compose network via the nginx container's
busybox `wget`. The deploy is healthy only when **all** hold within **120s**:

- no service is crash-looping (`RestartCount == 0` on the freshly created
  containers) — including `tunnel`, which the internal probes below cannot see
  but without which the app is unreachable from Telegram,
- `http://localhost/` answers inside the nginx container — nginx → frontend, so
  the SPA is really being served, and
- `http://backend:8000/` answers — FastAPI's root. Reaching it implies the
  database was up too, since the `lifespan` handler runs `create_all` before the
  app serves anything.

Those three see the stack from the inside, where the tunnel's routing is
invisible: a published application pointed at the wrong service leaves every
probe green and every user on a 502. So one more check runs afterwards, against
the real `https://$APP_HOSTNAME`, and only an answer **from** Cloudflare counts:

- `2xx`/`3xx` — the hostname really serves the app, deploy is healthy;
- any other status — Cloudflare is up but the route is wrong, so the deploy
  **fails and rolls back**;
- no answer at all (DNS still propagating, or Cloudflare having a bad day) —
  logged as a warning and the deploy still counts as healthy, since that is not
  something this deploy broke.

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
- `./.env` must exist with the real `BOT_TOKEN`, `TUNNEL_TOKEN` and
  `APP_HOSTNAME` (see [The tunnel](#the-tunnel)). It is gitignored, so it
  survives `git reset --hard`.
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

## The tunnel

The stack publishes no host ports: `nginx` is reachable only through a
Cloudflare **named tunnel**, so the Pi needs no port forwarding and no inbound
firewall rule. Unlike the quick tunnel this replaced, the hostname is fixed —
which is what makes the Telegram menu button a one-time setting.

Where the tunnel points lives in the Cloudflare dashboard, not in this repo;
the `tunnel` container only carries the connector token that identifies it.

1. **Cloudflare dashboard → Networking → Tunnels → Create a tunnel**, type
   *Cloudflared*. It offers an install command per OS — the connector token is
   the long string after `--token` in it. Copy that and leave the command
   alone; the compose file runs the connector.
2. On the Pi, add both values to `./.env` and bring the stack up:
   ```
   TUNNEL_TOKEN=<connector token>
   APP_HOSTNAME=portfolio.example.com
   ```
   The token reaches `cloudflared` through the container's environment, not its
   command line, so it does not show up in `ps` output. Both `./deploy.sh up`
   and `scripts/deploy.sh` refuse to run without these two values.
   `APP_HOSTNAME` is what tells the scripts the public URL — the container never
   reports one — and it is worth pinning `ALLOWED_ORIGINS` to `https://` + that
   same hostname, now that the app is served from exactly one origin.
3. Wait for the tunnel to show as **Healthy** in the dashboard, then open it →
   **Routes** tab → **Add route** → **Published application**:
   - *Subdomain* + *Domain* — the address the Mini App will open, e.g.
     `portfolio` + `example.com`.
   - *Service URL* — `http://nginx:80`. That is the compose service name; the
     connector runs on the same network and resolves it.

   Routes cannot be added before a connector has come online at least once,
   which is why the token goes in first. Cloudflare creates the proxied DNS
   record itself; the domain has to be in the same Cloudflare account, i.e. its
   nameservers point at Cloudflare. (Older dashboards call this the tunnel's
   *Public Hostname* tab, under Zero Trust → Networks → Tunnels.)
4. `./deploy.sh set-bot-url` **once**. The menu button now points at
   `https://$APP_HOSTNAME` and stays valid across deploys and restarts.

`ALLOWED_USER_IDS` still gates who the backend serves; the tunnel itself is
public, as it must be for Telegram to load the Mini App.

Nothing in the stack talks to Telegram any more — the `bot` container that used
to chase the quick tunnel's hostname is gone, so the bot answers no commands and
`/start` does nothing. The menu button is set only by `./deploy.sh set-bot-url`,
which is a one-time step because the hostname no longer changes.

Moving to another hostname is a dashboard change plus an `.env` edit — no code
change, no redeploy of the images.

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
- **Cloudflare error 1033 / the hostname does not resolve:** the tunnel is down
  or the token is stale — check `./deploy.sh logs tunnel`.
- **502 from the hostname:** the tunnel is up but its public hostname points at
  the wrong service; it must be `HTTP` → `nginx:80`.
- **Health check times out on a cold build:** the first deploy after a long gap
  rebuilds everything; the build happens *before* the 120s health window starts,
  so this usually means the app genuinely failed to start — check the logs the
  script dumps in the failed run.
