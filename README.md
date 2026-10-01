# maestro

Deployment glue for the Maestro ecosystem: `maestro-cli`, `maestro-orq`, and
`maestro-view` each live in their own repo (as git submodules here) and are
developed/versioned independently. This repo only holds what ties them
together at runtime.

## Layout

- `maestro-cli/` — Cobra CLI (submodule)
- `maestro-orq/` — Gin + SQLite backend (submodule)
- `maestro-view/` — Vue frontend (submodule)
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

`maestro login` prints a short code and opens the view; approving the code
there hands the CLI its own Maestro key. `maestro login --with-key` pastes a
key generated on the page instead, for machines without a browser.

## Git forges

Forges are separate from signing in: they never log anyone in. A forge is
only its API plus a read-only token, which the CLI stores (`maestro forge
add`) and passes to orq per build so it can clone. Supported kinds:

- `github` — github.com, or GitHub Enterprise Server with `--url`
- `forgejo` — any Forgejo instance; also Codeberg and Gitea
- `gitlab` — gitlab.com or self-hosted, including nested groups

orq only clones from hosts listed in `ALLOWED_FORGE_HOSTS` (default
`github.com,codeberg.org,gitlab.com`), so it can't be pointed at hosts on its
own network. Add your self-hosted forge's host there.

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET
podman compose up --build -d
```

The reverse proxy must send `/api/*` on the view's host to orq (port 3005),
so that `OIDC_REDIRECT_URL` reaches it and the session cookie is first-party.
