# maestro

Maestro runs a program many times on a group of shared machines and keeps
what each run produces. It builds a git repository into a container image
and starts one container for each set of parameters. This repository puts
the parts together and runs them. Each part lives in a repository of its
own, as a git submodule here, and is developed and versioned on its own.

The book says how to use Maestro and how to run one. It is built from
[`maestro-cli/book`](https://github.com/gustaleitcor/maestro-cli/tree/main/book/src),
and `maestro docs` opens it offline.

## Layout

- `maestro-orq/`: the server, in Go with Gin and SQLite (submodule)
- `maestro-cli/`: the `maestro` command and the book (submodule)
- `maestro-view/`: the Maestro page, in Vue (submodule)
- `maestro-template/`: the repository users fork to start, with a
  Dockerfile, a `maestro.toml` and a stand-in program (submodule)
- `docker-compose.yml`: the production stack
- `docker-compose-dev.yml`: the development stack, with its own throwaway
  identity provider (Dex, set up by `dev/dex.yaml`) and Valkey
- `dev/e2e.sh`: a test that goes through everything against the development
  stack, from signing in to downloading a run's files (see the book's
  Contributing page)
- `.env.example`: what the production stack needs set, with a line on each
- `CONVENTIONS.md`: where code goes in each repository. Read it before you
  add a file.
- `docs/`: notes for whoever works on Maestro, such as how text is written
  (`docs/writing.md`)

In both stacks the `orq` service stays up as the server. The `view` service
builds `maestro-view` into `maestro-view/dist` and exits. In production the
reverse proxy serves that directory itself, with no container in between.

The book's [The parts](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/how/parts.md)
says how the parts talk to each other.

## Getting started

```sh
git clone --recurse-submodules https://github.com/gustaleitcor/maestro
# or, in a clone you already have:
git submodule update --init

podman compose -f docker-compose-dev.yml up --build
```

Open the page in one of two ways: run `cd maestro-view && npm run dev`, with
`VIEW_URL=http://localhost:5173` exported before you start the stack, or
serve `maestro-view/dist` on port 8080. Sign in as `dev@example.com` with the
password `password`.

In the development stack, `dex` and `orq` use host networking, so that
`localhost:5556` is the same Dex for your browser and for orq.

The book's
[A development stack](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/deploy.md#a-development-stack)
says more about the stack, and
[Contributing](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/contributing.md)
says how to work on the book.

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET, MACHINE_SECRET and REDIS_URL's password
podman compose up --build -d
```

The reverse proxy sends `/api/*` on the page's host to orq on port 3005, and
serves `maestro-view/dist` for every other path. The compose file publishes
orq's port on 127.0.0.1, or on `ORQ_BIND` when it is set, so that only the
proxy reaches orq.

The book's [Running a Maestro](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/deploy.md)
part has the rest:

- [Deploying Maestro](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/deploy.md):
  the reverse proxy, Redis, the firewall and updating
- [The identity provider](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/identity.md)
- [Adding machines](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/machines.md)
  and [Machines behind a proxy](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/proxy.md)
- [Choosing the policies](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/policies.md),
  [Groups](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/groups.md)
  and [Comparing policies offline](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/sim.md)
- [What orq keeps, and for how long](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/admin/retention.md),
  backing up the database included
- [Environment variables](https://github.com/gustaleitcor/maestro-cli/blob/main/book/src/reference/env.md)
