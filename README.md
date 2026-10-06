# maestro

Deployment glue for the Maestro ecosystem: `maestro-cli`, `maestro-orq`, and
`maestro-view` each live in their own repo (as git submodules here) and are
developed/versioned independently. This repo only holds what ties them
together at runtime.

## Layout

- `maestro-cli/` — Cobra CLI (submodule)
- `maestro-orq/` — Gin + SQLite backend (submodule)
- `maestro-view/` — Vue frontend (submodule)
- `maestro-template/` — a repo for users to fork: Dockerfile, `maestro.toml`
  and a stand-in program (submodule)
- `docker-compose.yml` — production stack
- `docker-compose-dev.yml` — local dev stack, with its own throwaway identity
  provider (Dex, configured by `dev/dex.yaml`)
- `.env.example` — the identity provider settings the production stack reads

`orq` stays up as a server. `view` just builds `maestro-view` into
`maestro-view/dist` and exits — Caddy is expected to serve that directory
directly, not proxy to a container.

## Getting started

```sh
git clone --recurse-submodules <this-repo>
# or, if already cloned:
git submodule update --init

podman compose -f docker-compose-dev.yml up --build
```

Then open the view (`cd maestro-view && npm run dev`, with
`VIEW_URL=http://localhost:5173` exported before starting the stack, or serve
`maestro-view/dist` on port 8080) and sign in with the dev user:

- login: `dev@example.com`
- password: `password`

`dex` and `orq` use host networking in dev so that `localhost:5556` is the
same Dex for your browser and for orq.

## Signing in: one identity provider

Maestro trusts exactly one identity provider per deployment, over standard
[OpenID Connect](https://openid.net/developers/how-connect-works/). orq sends
the browser to the provider, checks the ID token it gets back, and then keeps
its own session (`maestro_session` cookie). Nothing in Maestro is specific to
any one provider.

Register Maestro with your provider as a confidential client using the
authorization code flow, with redirect URI `<orq>/api/auth/callback`, then
configure orq:

| Variable | Default | |
| --- | --- | --- |
| `OIDC_ISSUER` | required | Issuer URL; must serve `/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` | required | |
| `OIDC_CLIENT_SECRET` | required | |
| `OIDC_REDIRECT_URL` | required | `<orq>/api/auth/callback`, as registered with the provider |
| `OIDC_SCOPES` | `openid email profile` | Space-separated |
| `OIDC_ROLES_CLAIM` | `roles` | ID token claim holding the user's roles (a string or a list); e.g. `groups` |
| `OIDC_ALLOWED_ROLES` | empty | Comma-separated. Empty lets in anyone the provider authenticates |
| `VIEW_URL` | first of `ALLOWED_ORIGINS` | Where maestro-view is served; logins return there |
| `REDIS_URL` | required | `redis://[:password@]host:port/db` of a Redis, Valkey or KeyDB, where sessions are kept |
| `SESSION_TTL` | `12h` | How long a Maestro session lasts |
| `COOKIE_SECURE` | `true` (`false` with `MODE=dev`) | Set `false` only when serving over plain http |

The view only needs `VITE_ORQ_URL`, plus optionally `VITE_IDP_NAME` for the
sign-in button label.

Providers:

- **SaciAuthService** (auth.logsad.com) — what logsad.com runs; tested end to end.
- **Dex** — what the dev stack runs.
- **Keycloak, Authentik, Zitadel, …** — any provider with OIDC discovery,
  the authorization code flow, PKCE (S256) and RS256/ES256-signed ID tokens
  should work, but these have not been tried yet. Point `OIDC_ROLES_CLAIM`
  at whichever claim your provider puts roles or groups in.

Signing out of Maestro ends the Maestro session only; it does not sign you
out of the provider, and signing out of the provider does not end a Maestro
session that is already open.

### The CLI

Install `maestro` from the
[maestro-cli releases](https://github.com/gustaleitcor/maestro-cli/releases).

`maestro login` prints a short code and a link to the view; approving the
code there hands the CLI its own Maestro key. The link is not opened for
you, so it can be followed in any browser, on that machine or another.

## Git forges

Forges are separate from signing in: they never log anyone in. A forge is
only its API plus a read-only token, which the CLI stores (`maestro forge
add`) and passes to orq per build so it can clone. Supported kinds:

- `github` — github.com
- `forgejo` — Codeberg by default, or any Forgejo or Gitea instance with `--url`
- `gitlab` — gitlab.com, including nested groups

orq only clones from hosts listed in `ALLOWED_FORGE_HOSTS` (default
`github.com,codeberg.org,gitlab.com`), so it can't be pointed at hosts on its
own network. Add your self-hosted forge's host there.

## Machines

A machine is a host whose Podman runs users' containers. orq reaches it over
SSH and talks to the Podman socket through that connection, so the machine
needs nothing but sshd and Podman's API socket
(`systemctl --user enable --now podman.socket` for the SSH user).

Administrators add machines under "Manage machines" on the Maestro page:
host, SSH port and user, the socket path (e.g.
`/run/user/1000/podman/podman.sock`), and a private key without a
passphrase, and how many containers it runs at once (slots). Saving
connects and asks Podman for its version, so only a
working machine is saved. Leave the host key empty to pin the one the
machine presents then, and compare the fingerprint shown with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the machine; or paste
the line from `ssh-keyscan -t ed25519 <host>`. Private keys are stored
encrypted with `MACHINE_SECRET` and never sent back.

Users see the machines, and whether orq can reach them, with
`maestro machine list`. Checking opens an SSH connection, so orq keeps the
answer in Redis for 30 seconds (10 for a machine it couldn't reach), and
editing a machine checks it again at once.

| Variable | Default | |
| --- | --- | --- |
| `MACHINE_SECRET` | empty | Encrypts the stored SSH keys; at least 32 characters. Empty disables machines |
| `OIDC_ADMIN_ROLES` | `ADMIN` | Comma-separated roles (from `OIDC_ROLES_CLAIM`) that make a user an administrator |
| `ADMIN_EMAILS` | empty | Comma-separated emails that are administrators regardless of roles |

## Running images

A repo can say how its image is run with a `maestro.toml` next to its
Dockerfile. [`maestro-template`](maestro-template) is a repo to fork with
both, and a stand-in program:

```toml
machines   = ["Q1", "Q2", "Q3"]              # leave out for any machine
parameters = ["-t 10 out.txt", "-t 20 out.txt"] # one container per line
outputs    = ["out.txt"]                     # copied out when each finishes
```

orq reads it when it builds the repo (an invalid one fails the build) and
keeps it with the build. `maestro run <build>` then queues one container per
line, spread over the machines: each line runs once, on whichever allowed
machine has a free slot first. orq copies the image to a machine the first
time it needs it there, streaming `podman save` into `podman load` over SSH.
Without a `maestro.toml` a run takes the default, which is also what any key
left out of one falls back to: a single container with the image's own
`CMD`, on any machine, keeping only what it prints. The build log says which
one a build got.

When a container finishes, orq keeps what it printed and the outputs it
wrote, then removes it:

```
/maestro/data/<user>/<run>/<line>.log
/maestro/data/<user>/<run>/<line>/<file>
```

Users browse their runs and download those files on the Maestro page ("My
runs and their files"), or with `maestro runs list|show|logs|get|cancel|rm`.
Administrators see everyone's. orq keeps everything about runs in its
database, so it can restart mid-run: containers it started are picked up
where they are.

| Variable | Default | |
| --- | --- | --- |
| `DATA_DIR` | `/maestro/data` | Where runs' logs and outputs are kept |
| `RUN_OUTPUT_MAX_MB` | `1024` | Logs and outputs kept per line; the rest is dropped, with a note |
| `RUN_MEMORY_MB` | `512` | Memory limit per container; `0` for none |
| `RUN_PIDS` | `512` | Process limit per container; `0` for none |

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET and MACHINE_SECRET
podman compose up --build -d
```

The reverse proxy must send `/api/*` on the view's host to orq (port 3005),
so that `OIDC_REDIRECT_URL` reaches it and the session cookie is first-party.
