# Conventions

Where code goes in the three repos, so that a change looks like what is
already there. Read this before adding a file; when it and the code disagree,
the code is right and this file is to be fixed.

Two rules above the rest:

1. **A new feature goes into the package that already owns that part of the
   system.** A new package, or a new file, is for something none of them owns.
   Say why in its package comment.
2. **Each layer does one thing.** What decides goes in a service; what speaks
   HTTP, a terminal or a browser only translates.

## maestro-orq

```
main.go             wiring: config, database, Redis, runner, router
internal/api        the routes, and nothing else
internal/<resource> one package per resource: what the API can do with it
internal/db         migrations, queries, and the code sqlc writes from them
docs/               the code swag writes from the routes' annotations
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

### Services

| Package | Owns |
| --- | --- |
| `auth`, `session`, `key` | signing in, sessions, Maestro keys |
| `build` | cloning a repo and building it |
| `image` | the built images in orq's Podman |
| `container` | runs: queueing them, listing them, their logs and files |
| `runner` | the loop that starts containers and keeps what they leave; where things are on disk (`Data`) |
| `machine` | machines and the SSH connection to them |
| `metrics` | how loaded the machines are |
| `setting` | server-wide limits |
| `podman`, `gitclone` | the programs orq drives |
| `cache`, `kv` | Redis: what is remembered for a while |
| `apierr`, `response`, `middleware`, `config` | shared plumbing |

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
  nothing can be named outside a run's directory.
- Something slow that is asked for often is remembered through `cache.Cache`,
  and whatever changes it forgets it (`Delete`). A nil cache always misses,
  so a service works without one. The root README's table of what is
  remembered is kept true.

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
```

- **`cmd`** is cobra. A command's file has its `cobra.Command`, its `run…`
  function, and the plain text it prints. What a command prints is written by
  a `write…(w io.Writer, …)` function, so that it can be tested and drawn
  again; `run…` fetches and calls it. Completions are in `complete.go`,
  colours in `style.go`.
- **`tui`** is everything that takes the terminal over or rewrites it in
  place: the full-screen views (`top.go`) and `Watch`. `cmd` calls into
  `tui`; `tui` never imports `cmd`.
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

## maestro-view

```
src/App.vue          who is signed in, and which page the hash asks for
src/components/      one component per page or per piece of one
src/style.css        the colours, and every class more than one component uses
```

- No router and no store: the page is in the hash (`#files/…`, `#admin`),
  read and written only in `App.vue`. A component says where to go with an
  event (`navigate`), and is told where it is with a prop.
- A component talks to orq with `fetch(…, { credentials: 'include' })`, and
  emits `unauthorized` on a 401 instead of handling it.
- A class used by two components goes in `style.css` (`.btn`, `.card`,
  `.pill`, `.panel`); one used by a single component stays in its
  `<style scoped>`. Icons are `EntryIcon`, not a font.
- What a file is, and whether it may be shown, is decided by orq. The view
  never runs or renders what a container wrote as part of the page.
- No new dependencies without asking: it is Vue and Vite.

## Everywhere

- Comments say why, or what isn't obvious; none restate the code. Their
  voice is the one already there: plain, about what the thing is.
- Names follow the surrounding code before any outside style guide.
- A behaviour a user can see is in the root `README.md`; each repo's README
  says what that repo is.
- `go build ./... && go vet ./... && go test ./...` in orq and the CLI, and
  `npm run build` in the view, before saying a change is done.
- Commits carry no AI attribution lines, and submodules are bumped only when
  asked.

## Before finishing a change

- [ ] No file was added where an existing one already holds that kind of thing.
- [ ] No package was added for what an existing one owns.
- [ ] `internal/api` gained only handlers, types and annotations.
- [ ] `internal/maestroapi` gained only types and requests.
- [ ] Tests are beside what they test, in the package that holds it.
- [ ] `sqlc generate` and `swag init` were run if queries or annotations changed.
- [ ] The README says what changed for whoever uses it.
