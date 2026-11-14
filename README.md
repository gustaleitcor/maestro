# maestro

Deployment glue for the Maestro ecosystem: `maestro-cli`, `maestro-orq`, and
`maestro-view` each live in their own repo (as git submodules here) and are
developed/versioned independently. This repo only holds what ties them
together at runtime, and the book that explains them.

**The documentation is the Maestro book, in [`book/`](book/src/SUMMARY.md).**
A deployment serves it at `/docs/`; `maestro docs` opens it, and
`maestro docs <topic>` a page of it (`maestro docs toml`, `maestro docs
queue`, `maestro docs runs logs`). What a user, an administrator or a
contributor needs to know goes there, not here.

## Layout

- `maestro-cli/` — Cobra CLI (submodule)
- `maestro-orq/` — Gin + SQLite backend (submodule)
- `maestro-view/` — Vue frontend (submodule)
- `maestro-template/` — a repo for users to fork: a stress test of the
  scheduler, with a Dockerfile, `maestro.toml` and a generator (submodule)
- `book/` — the Maestro book (mdBook), built by `book/Dockerfile`
- `docker-compose.yml` — production stack
- `docker-compose-dev.yml` — local dev stack, with its own throwaway identity
  provider (Dex, configured by `dev/dex.yaml`)
- `.env.example` — the identity provider settings the production stack reads
- `CONVENTIONS.md` — where code goes in each repo; read it before adding a file

`orq` stays up as a server. `view` and `docs` build `maestro-view` and the
book into `maestro-view/dist` and `book/dist` and exit — Caddy is expected to
serve those directories directly (the book at `/docs/`), not proxy to a
container.

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

## The book

```sh
go -C maestro-cli run . gen-docs ../book/src/reference/cli.md   # the CLI reference
mdbook-mermaid install book                                     # once: the diagrams' scripts
mdbook serve book                                               # http://localhost:3000
```

`MAESTRO_DOCS_URL=http://localhost:3000` points `maestro docs` at it. A page
moved or renamed must move in `maestro-cli/cmd/docs.go` too, where each topic
of `maestro docs` names its page: `book/Dockerfile` fails the build while one
points nowhere. A change to what Maestro does is documented in the book, in
the same change.

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET and MACHINE_SECRET
podman compose up --build -d
```

The reverse proxy must send `/api/*` on the view's host to orq (port 3005),
so that `OIDC_REDIRECT_URL` reaches it and the session cookie is first-party,
and serve `book/dist` at `/docs/`. The book's [Deploying
Maestro](book/src/admin/deploy.md) has a Caddyfile.
