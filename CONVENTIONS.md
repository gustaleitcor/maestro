# Conventions

Where code goes in the repos and how they are built, so that a change looks
like what is already there. Read this before adding a file. The rest is in
`docs/`, one file for each purpose:

| File | What it is for |
| --- | --- |
| [docs/writing.md](docs/writing.md) | how the text a user reads is written: help, messages, errors, the page |
| [docs/queues.md](docs/queues.md) | the scheduler's model: the three queues and the score |
| [docs/limits-and-secrets.md](docs/limits-and-secrets.md) | what every part holds to, so that users are trusted with their own work and nothing more |
| [docs/fixes.md](docs/fixes.md) | where the code doesn't follow these files yet, as a list of changes to make |
| [docs/roadmap.md](docs/roadmap.md) | what Maestro doesn't do yet and should |
| [docs/thesis.md](docs/thesis.md) | how the thesis about Maestro is written |

When one of these files and the code disagree, the code is right and the
file is to be fixed, with one exception: what
[docs/fixes.md](docs/fixes.md) lists is work to do, and there the files are
right.

Two rules above the rest:

1. **A new feature goes into the package that already owns that part of the
   system.** A new package, or a new file, is for something none of them owns.
   Say why in its package comment.
2. **Each layer does one thing.** What decides goes in a service; what speaks
   HTTP, a terminal or a browser only translates.

## The repos

```
maestro            the compose files that run the parts together, this file and docs/
maestro-orq        the server
maestro-cli        the maestro command, and the book
maestro-view       the Maestro page
maestro-template   the repository users fork to start
```

Each part is a repository of its own, held in `maestro` as a git submodule.
A change is committed in the part's repository. The submodule in `maestro` is
bumped only when asked.

The root of `maestro` holds `docker-compose.yml`, `docker-compose-dev.yml`,
`.env.example`, `dev/` (what the development stack needs), `README.md`,
this file and `docs/`. Nothing else belongs there: no exported pages, no
plans, no notes. `docs/` holds the files listed above and no others: what a
user or an administrator reads is the book, in `maestro-cli/book`. A plan
that was carried out is deleted, since the book says how the thing works
now.

## maestro-orq

```
main.go             wiring: config, database, Redis, runner, router
internal/api        the routes, and nothing else
internal/<resource> one package per resource: what the API can do with it
internal/db         migrations, queries, and the code sqlc writes from them
docs/               the code swag writes from the routes' annotations
cmd/sim             the simulator: policies compared without the machines
```

### `internal/api` is only routes

One file per resource (`runs.go`, `images.go`, …), each with a handler struct
holding the resource's `API` interface, the request and response types, and
the swagger annotations. `router.go` builds the services and registers every
route. There are no tests here, because there is nothing here to test.

A handler does four things, in this order, and no more:

1. read the request: path and query parameters, the body, who is calling
   (`middleware.CurrentUserID`, `auth.IsAdmin`);
2. call **one** method of the service;
3. on an error, `response.Fail(c, err, "…")`;
4. write the answer: status, headers, JSON or the bytes the service handed
   back.

So a handler may refuse a parameter that isn't a number, set
`Content-Disposition`, or copy a reader to the response. It may not open a
file, look at what a file holds, query the database, pick between two files,
or decide who may see what. If a handler needs an `if` about the *resource*
rather than about the *request*, that `if` belongs in the service, which
returns something the handler can write without thinking: see
`container.Logs` and `container.Preview`.

`internal/middleware` is held to the same rule. It reads the cookie or the
`Authorization` header, asks `auth` who that is, and puts the answer in the
request's context. Whether a session or a key is still good is decided in
`auth`, in one place, so that the route that verifies a key and the
middleware can't disagree.

### Services

| Package | Owns |
| --- | --- |
| `auth`, `session` | signing in, sessions, Maestro keys |
| `build` | cloning a repo and building it |
| `image` | the built images in orq's Podman |
| `container` | runs: queueing them, listing them, their logs and files; reading `maestro.toml` |
| `runner` | the loop that starts containers and keeps what they leave; where things are on disk (`Data`) |
| `sched` | which waiting line runs where: pure, without the database or the machines, so a simulator can run it too |
| `group` | the groups users are split into, and who is in which |
| `simulate` | running `sched` over a workload on a simulated clock, for `cmd/sim` |
| `evaluation` | how lines were served: waits, slowdowns, utilization, fairness, from a simulation or an export alike |
| `machine` | machines and the SSH connection to them |
| `metrics` | how loaded the machines are |
| `setting` | what an administrator changes from the Maestro page |
| `config` | what whoever deploys orq sets in its environment |
| `podman`, `gitclone`, `python` | the programs orq drives; `python` is inside orq, as WebAssembly, for the scripts of others |
| `cache`, `kv` | Redis: what is remembered for a while |
| `apierr`, `response`, `middleware` | shared plumbing |

The package that holds runs is called `container` and stays so: a rename
would touch every file for no change a user sees.

Each resource package has the same shape:

```go
type Service struct {
	API                    // so a test can embed it and fake a few methods
	Queries *db.Queries
	// …what it needs, as exported fields set in router.go
}

// API is what the handler needs of this package.
type API interface { … }

var _ API = (*Service)(nil)
```

- A method the handler calls is in `API`; one only the package uses is
  unexported.
- Every method that touches someone's data takes `userID` and `admin`, and
  the *service* decides "not found" against "yours" against "anyone's for an
  administrator". Someone else's thing is reported as not there.
- A failure the caller should see is an `apierr` (`apierr.NotFound(…)`), made
  where it is decided; it carries its status. Anything else is wrapped with
  `fmt.Errorf("doing x: %w", err)` and reaches the caller as a 500 with the
  handler's fallback message. A status orq doesn't have yet is a new
  constructor in `apierr`, not a `c.JSON` in a handler.
- Where a file is on disk comes from `runner.Data` and nowhere else, so that
  nothing can be named outside a run's directory. How much a user keeps on
  disk is asked of `runner.Data` too.
- Something slow that is asked for often is remembered through `cache.Cache`,
  and whatever changes it forgets it (`Delete`). A nil cache always misses,
  so a service works without one. The book's table of what is remembered
  (`admin/retention.md`) is kept true.

### The queues

`sched` holds the scheduler's model, and everything else carries it out or
shows it: the three queues, who is a user's head, and how the score is
normalized are in [docs/queues.md](docs/queues.md). A change to how lines
are chosen starts there.

### Limits: `config` or `setting`

A limit that whoever deploys orq chooses once is an environment variable read
in `config` (`RUN_PIDS`, `RUN_OUTPUT_MAX_MB`, `BUILD_TIMEOUT`). A limit an
administrator changes while orq runs is in `setting`, and is changed from
Admin › Settings (`images_per_user`, the scheduler). A new limit goes in
`config` unless it was asked for on the page.

Every limit has a default written in `config` or `setting`, a row in the
book's `reference/env.md` or `admin/policies.md`, and a message for the user
it stops. See [Limits and secrets](docs/limits-and-secrets.md) for what must have
one.

### Database

Change `internal/db/queries/*.sql` (or add a migration in
`internal/db/migrations`, never edit an old one), then run `sqlc generate`.
The `*.sql.go` files, `models.go` and `querier.go` are never edited by hand.
One query for a list, not a query per row.

### Swagger

Every route is annotated above its handler. After changing an annotation run
`swag init`, and commit `docs/`. Don't run `swag fmt`: it realigns every
annotation in the repo.

### Tests

Beside the code, in the same package: `<file>_test.go` for what `<file>.go`
holds (`files.go` and `files_test.go`), or named after the one behaviour it
covers when that is clearer (`status_test.go`, `reserve_test.go`). They use a real SQLite in
memory (`db.Migrate`) and `miniredis`, not mocks of them. A test that needs a
real Podman or a real forge is a `live_test.go` that skips without its
environment variables.

## maestro-cli

```
cmd/                 one file per command: flags, arguments, what it prints
tui/                 whatever redraws the terminal
internal/maestroapi  the client of orq's API: types and requests
internal/forge       the clients of the git forges
internal/config      what is stored on this computer
internal/humanize    bytes, rates, durations and percentages as text
internal/netfail     the words for a request that never got an answer
internal/book        the built book, embedded, and what serves it
book/                the book's pages (book/src) and what builds them
```

- **`cmd`** is cobra. A command's file has its `cobra.Command`, its `run…`
  function, and the plain text it prints. What a command prints is written by
  a `write…(w io.Writer, …)` function, so that it can be tested and drawn
  again; `run…` fetches and calls it. Completions are in `complete.go`,
  colours in `style.go`. `concepts.go` is a help topic and `gendocs.go`
  writes the book's command reference: neither is a command a user runs.
- **`tui`** is everything that takes the terminal over or rewrites it in
  place: the full-screen views (`top.go`), `Watch`, and the questions asked
  the first time (`welcome.go`, `init.go`). `cmd` calls into `tui`; `tui`
  never imports `cmd`.
- **`internal/maestroapi`** only mirrors the API: a struct per response, a
  function per request. No methods on its types, and nothing about how a
  thing is shown. How a value reads on screen (`2/4 +3`, a container's
  owner) is a function in `tui` or `cmd`, whichever shows it; if both do, it
  is exported from `tui`.
- A unit as text is `internal/humanize`.
- A command that needs the server gets its key from `maestroKey`, loaded in
  `rootCmd`'s `PersistentPreRunE`; a completion loads its own with `withKey`.
- Tests are beside the file, named as in orq. A command is tested against a
  fake orq (`httptest`, `MAESTRO_ORQ_URL`), a view through its model and
  `ansi.Strip`.

### The book

`book/src` is the book. `book/src/reference/cli.md` is written from the
commands' help by `maestro gen-docs`, and `internal/book/site` is the built
book, committed so that a plain `go build` carries it. Neither is edited by
hand.

After changing a page, `book.toml` or any command's help, run
`sh book/build.sh` and commit what it writes. `go test ./...` fails until you
do. A page that moves is moved in `cmd/docs.go` too.

## maestro-view

```
src/App.vue          who is signed in, and which page the hash asks for
src/components/      one component per page or per piece of one
src/style.css        the colours, and every class more than one component uses
```

- No router and no store: the page is in the hash (`#files/…`, `#queue`,
  `#usage`, `#admin/<section>`), read and written only in `App.vue`. A
  component says where to go with an event (`navigate`), and is told where it
  is with a prop. `SideNav` is the sidebar every signed-in page has, beside it
  in `PageShell`; each page draws its own `.top` bar.
- A component talks to orq with `fetch(…, { credentials: 'include' })`, and
  emits `unauthorized` on a 401 instead of handling it.
- A component is one page or one piece of a page. One that has grown past
  about 500 lines holds more than one piece: take a piece out into a
  component of its own, as `LineDetails` and `FileTree` are.
- A class used by two components goes in `style.css` (`.btn`, `.card`,
  `.pill`, `.row`, `.top`), and its colours are the tokens at the top of it;
  one used by a single component stays in its `<style scoped>`. Icons are
  `EntryIcon`, not a font or an image.
- What a file is, and whether it may be shown, is decided by orq, which
  serves anything that is text as plain text. What a container wrote is
  never part of the page: text is shown as text, or highlighted by
  highlight.js, which escapes it; an SVG only as an `<img>`, which runs no
  script; and an HTML page only in an iframe sandboxed with `allow-scripts`
  and nothing else, so that it runs in an origin of its own and can't read
  the session, call orq as whoever looks, or move the page (`FilePreview`).
  The same holds in a tab of its own: what opens there is a page of the
  view's that draws it the same way, never the file as a blob, which would
  run as the view.
- No new dependencies without asking: it is Vue, Vite and highlight.js
  (its core, and only the languages `FilePreview` registers). That includes
  a test runner: the view has no tests, and gets none until one is asked
  for.
- Packages are installed with npm from `package-lock.json`, in development
  and in the image alike.

## Building and deploying

- A Dockerfile copies the lock file with the manifest and installs from it
  (`go.sum` with `go mod download`, `package-lock.json` with `npm ci`), so
  that an image built twice holds the same dependencies.
- An image that runs in production holds the program and what it runs
  (`git`, `tini`, `cloudflared`, the CA certificates), on a slim base. The
  compiler and the source stay in the build stage.
- A version that is downloaded is pinned and checked against its checksum, as
  `cloudflared` is in orq's Dockerfile and `mdbook` is in `book/build.sh`.
- Each repository has a workflow in `.github/workflows` that runs, on every
  push and pull request, what [Everywhere](#everywhere) says to run before a
  change is done. The CLI's release workflow is apart from it.
- What production needs set is in `.env.example`, with a line saying what it
  is for and how to make a value. `docker-compose.yml` holds no secret.
- SQLite is opened in WAL mode with a busy timeout, so that the API's reads
  don't wait on the runner's writes. A backup of the database copies the
  `-wal` file with it, or uses `sqlite3 .backup`.

## Everywhere

- Comments say why, or what isn't obvious; none restate the code. Their
  voice is the one already there: plain, about what the thing is.
- Names follow the surrounding code before any outside style guide.
- A behaviour a user or an administrator can see is in the book, in the same
  change as the code. Each repository's README says what that repository is
  and how to work on it, and points to the book for the rest. The root README
  says how the parts are put together and deployed.
- `go build ./... && go vet ./... && go test ./...` in orq and the CLI, and
  `npm run build` in the view, before saying a change is done.
- A commit is one change, and its message is one sentence that says what
  changed for whoever uses the thing: "Let a Maestro key be revoked, by its
  owner or an administrator". Commits carry no AI attribution lines, and
  submodules are bumped only when asked.

## Before finishing a change

- [ ] No file was added where an existing one already holds that kind of thing.
- [ ] No package was added for what an existing one owns.
- [ ] `internal/api` and `internal/middleware` gained only handlers, types and annotations.
- [ ] `internal/maestroapi` gained only types and requests.
- [ ] Tests are beside what they test, in the package that holds it.
- [ ] `sqlc generate` and `swag init` were run if queries or annotations changed.
- [ ] Text a user reads follows `docs/writing.md`, and the book's page says the same thing.
- [ ] `sh book/build.sh` was run if a page or a command's help changed.
- [ ] A new route, a new thing kept or a new program run was checked against `docs/limits-and-secrets.md`.
- [ ] The book says what changed for whoever uses it.
- [ ] The item was removed from `docs/fixes.md` or `docs/roadmap.md`, if it was one.
