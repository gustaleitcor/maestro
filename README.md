# maestro

Deployment glue for the Maestro ecosystem: `maestro-cli`, `maestro-orq`, and
`maestro-view` each live in their own repo (as git submodules here) and are
developed/versioned independently. This repo only holds what ties them
together at runtime.

**The documentation is the Maestro book, in
[`maestro-cli/book`](maestro-cli/book/src/SUMMARY.md).** Every `maestro`
carries it: `maestro docs` opens it offline, and `maestro docs <topic>` a
page of it (`maestro docs toml`, `maestro docs queue`, `maestro docs runs
logs`). A deployment can also serve it at `/docs/`. What a user, an
administrator or a contributor needs to know goes there, not here.

## Layout

- `maestro-cli/` — Cobra CLI, and the book in `maestro-cli/book` (submodule)
- `maestro-orq/` — Gin + SQLite backend (submodule)
- `maestro-view/` — Vue frontend (submodule)
- `maestro-template/` — a repo for users to fork: a stress test of the
  scheduler, with a Dockerfile, `maestro.toml` and a generator (submodule)
- `docker-compose.yml` — production stack
- `docker-compose-dev.yml` — local dev stack, with its own throwaway identity
  provider (Dex, configured by `dev/dex.yaml`)
- `.env.example` — the identity provider settings the production stack reads
- `CONVENTIONS.md` — where code goes in each repo; read it before adding a file

`orq` stays up as a server. `view` and `docs` build `maestro-view` and the
book into `maestro-view/dist` and `maestro-cli/book/dist` and exit — Caddy is
expected to serve those directories directly (the book at `/docs/`), not
proxy to a container.

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
cd maestro-cli
sh book/build.sh     # build it, and pack it for the next go build to embed
mdbook serve book    # or edit it with a live preview on :3000
```

`book/build.sh` downloads mdbook and mdbook-mermaid into `~/.cache` when they
aren't installed, and goreleaser runs it before every release, so a release
built here carries the book. `MAESTRO_DOCS_URL=http://localhost:3000` points
`maestro docs` at the live preview. A page moved or renamed must move in
`maestro-cli/cmd/docs.go` too, where each topic of `maestro docs` names its
page; `go test ./cmd` fails while one points nowhere. A change to what
Maestro does is documented in the book, in the same change.

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET and MACHINE_SECRET
podman compose up --build -d
```

The reverse proxy must send `/api/*` on the view's host to orq (port 3005),
so that `OIDC_REDIRECT_URL` reaches it and the session cookie is first-party,
and serve `maestro-cli/book/dist` at `/docs/` for the view's Docs link and
`maestro docs --web`. The book's [Deploying
Maestro](maestro-cli/book/src/admin/deploy.md) has a Caddyfile.
