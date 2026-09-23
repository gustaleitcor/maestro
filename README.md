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
- `docker-compose-dev.yml` — local dev stack (`MODE=dev` bypasses real
  logsad.com auth; see `maestro-orq/internal/api.DevSession`)

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
