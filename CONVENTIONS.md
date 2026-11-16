# Conventions

Where code goes in the repos, how the text a user reads is written, and what
every part must hold to, so that a change looks like what is already there.
Read this before adding a file. When it and the code disagree, the code is
right and this file is to be fixed, with one exception: what
[Not followed yet](#not-followed-yet) lists is work to do, and there this
file is right.

Two rules above the rest:

1. **A new feature goes into the package that already owns that part of the
   system.** A new package, or a new file, is for something none of them owns.
   Say why in its package comment.
2. **Each layer does one thing.** What decides goes in a service; what speaks
   HTTP, a terminal or a browser only translates.

## The repos

```
maestro            the compose files that run the parts together, and this file
maestro-orq        the server
maestro-cli        the maestro command, and the book
maestro-view       the Maestro page
maestro-template   the repository users fork to start
```

Each part is a repository of its own, held in `maestro` as a git submodule.
A change is committed in the part's repository. The submodule in `maestro` is
bumped only when asked.

The root of `maestro` holds `docker-compose.yml`, `docker-compose-dev.yml`,
`.env.example`, `dev/` (what the development stack needs), `README.md` and
this file. Nothing else belongs there: no exported pages, no plans, no notes.
A plan that was carried out is deleted, since the book says how the thing
works now.

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
| `auth`, `session`, `key` | signing in, sessions, Maestro keys |
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

`sched` holds the model, and everything else carries it out or shows it.
There are three queues, and a policy for each:

1. The user queue. Each user's waiting lines, in the order the user policy
   gives them. The first of them is the user's head.
2. The dispatcher queue. The heads, one for each user who has lines waiting,
   and nothing else. It is not filled from the user queues and has no size
   of its own: when a user's head goes to a machine, their next line is
   their head. Each group has a dispatcher queue of its own, made of the
   heads of its users, and groups take turns. In a group's turn the
   dispatcher policy picks one head, which goes to a machine drawn among
   those that would hold it and have room in their queue.
3. The machine queue. The lines given to a machine that wait for room on it,
   at most `depth` of them. The machine policy picks which starts.

So a line is `queued` in its user's queue (as its head or behind it),
`assigned` in a machine's queue, then `starting` and `running`. Being a head
is worked out on every tick from the user policy and is never stored: with
LCFS or PQ a newer line can take the head's place.

A line that no machine would hold, even empty, is never a head and holds
back no one. A user's share counts their lines assigned, starting and
running.

In the score, a line's cores and memory are each divided by what every
machine has for lines, summed: capacity less what is kept back, over the
machines orq knows and can reach. That is the total users' shares are
taken over too. Tetris alone divides by the one machine it fits a line
into.

### Limits: `config` or `setting`

A limit that whoever deploys orq chooses once is an environment variable read
in `config` (`RUN_PIDS`, `RUN_OUTPUT_MAX_MB`, `BUILD_TIMEOUT`). A limit an
administrator changes while orq runs is in `setting`, and is changed from
Admin › Settings (`images_per_user`, the scheduler). A new limit goes in
`config` unless it was asked for on the page.

Every limit has a default written in `config` or `setting`, a row in the
book's `reference/env.md` or `admin/policies.md`, and a message for the user
it stops. See [Limits and secrets](#limits-and-secrets) for what must have
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

## Text a user reads

A command's help, what a command prints, an error, a label or a note on the
Maestro page: all of it is written in the voice of the book
(`maestro-cli/book/src`). Someone who read a chapter and then runs the
command should meet the same words for the same things. When you write or
change such text, open the book's page on that subject and take its wording.

### The voice

- Write to the reader as "you". The command or the page is "it", and the
  server is "Maestro" or "the server".
- One idea in a sentence. Two ideas are two sentences, not one joined by a
  semicolon or by "; without it, …".
- Say what happens, in the order it happens. Put the condition first and the
  result after it: "With --watch, it follows the run until the run is over."
- Use the plain verb. "It asks before it removes", not "confirmation is
  requested".
- Say a thing once. A sentence that repeats the one before it goes.
- No dashes between clauses and no exclamation marks. A colon introduces a
  list or an example.
- Give the number: "every 2 seconds", "your 20 newest runs", "at most 5000
  lines".
- When something can't be done, say what to do next, with the command that
  does it.

### The words

One word for each thing, the glossary's (`book/src/reference/glossary.md`).
A word the glossary doesn't have is added there before it is used anywhere.

| Write | Not | Because |
| --- | --- | --- |
| build #12, run 31, line 2 | build 12, run #31, job, task | they count apart, and are written apart |
| repository in a sentence; repo in a command, an argument, a column or a label | | `maestro repos`, `<repo>`, `REPO` |
| machine | node, host, server, worker | a machine is one of Maestro's, where containers run |
| your computer | this machine, the client, locally | "machine" is taken |
| the Maestro page | maestro-view, the web UI, the dashboard, the site | users don't know the repos' names |
| Maestro, or the server | orq, the backend, the API | orq is named only to administrators, in the book's "Running a Maestro" |
| sign in, sign out | log in, log out, authenticate | the commands keep their names, `maestro login` and `maestro logout` |
| Maestro key | token, API key, credential | a token is a forge's |
| issued | minted | |
| administrator | admin | Admin is the name of a page |
| remove an image, a forge, a machine; delete a run | | a run's files go with it |
| ended in an error | errored | |
| standard output, standard error | stdout, stderr | except the files `stdout.log` and `stderr.log`, and `--json` names |
| Ctrl-C | ctrl-c, ^C | |
| queued, assigned, starting, running, succeeded, failed, error, cancelled | Queued, QUEUED, pending, done, staged | the statuses as the server names them, in lower case |
| user queue, dispatcher queue, machine queue; a user's head | submission queue, intermediate queue, staged lines, selection, allocation | the three queues, see [The queues](#the-queues) |
| colours, cancelled | colors, canceled | the book's spelling |

### A command's help

- `Short` starts with a verb, has no full stop, and fits the command list:
  "Download the files kept from a run". A command that only groups others
  says what they are for: "List, show and download your runs", not "Commands
  for the runs started with `maestro run`".
- `Long` opens with what the command does, its verb in the third person
  ("Builds a container image from …"). After that it speaks to "you".
- A whole command is in backticks (`maestro runs rm 31`). A flag, a file name
  or an argument is written bare (--watch, maestro.toml, <build>).
- A paragraph holds one subject: what it does, then what the arguments are,
  then the flags that change it most. Whatever a flag's own line already
  says isn't said again in `Long`.
- A flag's description is a fragment in lower case with no full stop, and
  says the default when cobra doesn't print it: "how many days back".
- A flag that takes a value names the value, never a Go type: `--line n`,
  not `--line int64Slice`. cobra takes the name from the word in backticks
  in the flag's description.
- `Example` holds commands a reader could run as they are, with the names
  the book uses (`my-app`, build 12, run 31), and a `#` comment only where
  the command doesn't explain itself.
- Every help ends with its `maestro docs` topic, which `root.go` adds.

Before:

```text
With --server, signs in to that Maestro server, which every command then
talks to; without it, to the one kept, which is asked for the first time.
The key is only ever sent to the server that minted it.
```

After:

```text
With --server, it signs you in to that Maestro server, and every later
command talks to it. Without --server, it uses the server the CLI has kept,
and asks for one the first time. The CLI sends your key only to the server
that issued it.
```

Before:

```text
Shows every machine on a row: CPU, memory, GPUs, load, how many of the
cores it has for lines they take and how many lines wait (6/14 +3),
refreshed as you watch.
```

After:

```text
Shows one row for each machine: its CPU, memory, GPUs and load. The last
column reads 6/14 +3 when lines use 6 of the 14 cores the machine has for
them and 3 more lines wait. The rows refresh every 2 seconds.
```

### What a command prints, and errors

- A table's headings are in capitals and its cells are what the book's
  examples show (`RUN`, `#14`, `54m ago`).
- A message after something was done says what was done and names it:
  "Deleted run 31 and its files."
- An error says what is wrong in the user's words and ends with what to do:
  "you have 10 of the 10 images allowed, and runs are using all of them;
  remove one with `maestro builds rm <build>`". It doesn't start with
  "error:" or "failed to", and it doesn't show a Go error, a URL or a status
  code unless that is all there is.
- An error from orq is written once, in orq, as an `apierr`. The CLI and the
  page show it as it came.
- A message the book quotes (`reference/troubleshooting.md`) changes there
  in the same change.

### The Maestro page

- Labels, buttons and headings are in sentence case with no full stop:
  "Images per user", "Kept outputs", "Sign out".
- A button says what it does to what: "Remove", "Download run 31 as a zip".
- An empty list says what would be there and how to get it: "No runs yet.
  Start one with `maestro run <build>`."
- A note under a field is a full sentence: "Stored encrypted and never shown
  again."
- A `title` that explains a value is a sentence in words, starting with a
  capital: "The share of the machines you have used, as the scheduler counts
  it." A symbol from the scheduler's maths (θ, Z) is named in words first.
- Apostrophes and quotes are the straight ones, as in the book.
- The page says "you" where the CLI does, and uses the words above.

## Limits and secrets

Lab users are trusted with their own work, and nothing more. These hold for
every part:

- Whatever signs someone in ends, and can be ended. A session expires
  (`SESSION_TTL`). A Maestro key expires (`KEY_TTL`), its owner can revoke
  it, `maestro logout` revokes the one it holds, and an administrator can
  revoke every key of a user.
- Who someone is, is read on every request. Whether a caller is an
  administrator comes from their row in `users`, never from something kept in
  the session or the key. That row is as fresh as their last sign-in on the
  page, so a key can outlive a removal from the identity provider by at most
  `KEY_TTL`. The book says so (`admin/identity.md`).
- Whatever runs someone else's code has limits on time, memory, CPU and
  processes. A line's container has all four. A build has a time limit
  (`BUILD_TIMEOUT`), memory and CPU, and a user builds a few at once. A
  generator runs inside orq as WebAssembly with no access to the host.
- Whatever keeps someone's data has a limit on how much. A line keeps at
  most `RUN_OUTPUT_MAX_MB`, a user keeps at most `images_per_user` images,
  and a user's runs keep at most `USER_DATA_MAX_GB` in all.
- A secret is kept sealed or hashed, and is sent only where it is needed.
  Keys and sessions are stored as hashes. Machines' SSH keys are sealed with
  `MACHINE_SECRET`. A forge token is kept by the CLI, sent for one clone, and
  never reaches an image (`.git` is stripped).
- orq is reached through the reverse proxy and nothing else. The compose
  file publishes its port on the loopback address. Every route but signing
  in, the health check and verifying a key needs a session or a key, the
  swagger pages included.
- Redis has a password outside development. It holds the sessions, so
  whoever can write to it can sign in as anyone. Builds run on the same host
  and may reach it.
- A request that never finishes doesn't hold orq. The HTTP server has a
  timeout on reading headers and on idle connections. It has none on writing,
  because logs, builds and archives are streamed for as long as they take.

A new route, a new thing kept, or a new program run for a user is checked
against this list before it is done.

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

## Not followed yet

Where the code doesn't hold to this file. Each item is one change, done and
committed on its own, in the order given within its group. An item is
removed from this list in the commit that finishes it. If an item can't be
done as written, stop and say why instead of doing something near it.

### The queues

These come first, and in this order. The code has a fourth level between
the user queues and the machines: a buffer of `staged` lines for each group,
filled by a select policy and emptied by an allocate policy. It was built by
mistake. [The queues](#the-queues) says what is meant.

#### Q1. `sched` has three queues

In `maestro-orq/internal/sched`:

- `Config` and `Policies` lose `Select`, `Allocate` and `StagedCapacity`
  and gain `Dispatcher` (JSON `dispatcher`): fifo, lcfs, siro or pq, FIFO by
  default. Saved settings that still have `select` are read with it as the
  dispatcher, so that an administrator's PQ isn't lost. `allocate` and
  `staged_capacity` in saved settings are ignored.
- `Snapshot` loses `Staged`, `Task` loses `Staged`, and the status `Staged`
  goes. The moves left are queued to assigned, assigned to starting, and
  assigned back to queued for a line whose machine would no longer hold it.
- `Step` drops selection. Its dispatch step gives the groups turns, as
  allocation does now. In a group's turn the candidates are the heads of
  its users: for each user, the line the user policy picks among their
  queued lines that some machine would hold. A head with no machine that
  has room in its queue isn't a candidate this turn, and its user's other
  lines don't go in its place. The dispatcher policy picks one candidate,
  and the machine is drawn as now. After each line dispatched, its need is
  added to its user's share and the shares are worked out again, as
  `selectIn` does now, so that PQ with a share weight takes users in turn.
- Shares count what a user's lines take once assigned, starting or running.
- Promotion on the machines stays as it is.
- Done when `step_test.go` shows: a user with ten lines and a user with one
  each have one head; no user has two lines dispatched in a turn while
  another user's head has room; a group with no head that has room passes
  its turn; a line no machine holds blocks no one.

#### Q2. The score divides by the sum

`Context.Largest` becomes `Context.Cluster`, set from the state's `cluster`
(what every known machine that isn't down has for lines, summed).
`Score.Of` divides a line's cores and memory by it. Tetris keeps
`Context.Whole`. Done when a test in `policy_test.go` shows a line's term
with two machines of 8 cores is its cores over 16, not over 8. Say in the
commit message that the cores and memory weights now multiply smaller
numbers, so saved weights weigh less than they did.

#### Q3. orq around `sched`

- A migration sends lines `staged` back to `queued` and drops
  `run_lines.staged_at`. Queries that name `staged` lose it
  (`internal/db/queries/runs.sql`, `groups.sql`); `StageLine` goes.
- The scheduler's settings, and the group a line's user was in, are recorded
  when a line is assigned, where they were recorded when it was staged.
- `runner` (`schedule.go`, `runner.go`: `Waiting`, `Active`, `unstart`,
  the statuses) and `simulate` follow the new moves. A line sent back from a
  machine goes to `queued`.
- `container/queue.go` and `api/queue.go`: the queue reports, for each group
  and for the caller, how many lines are queued, how many of those are heads
  (the dispatcher queue), and how many are assigned. `api/settings.go` and
  `api/runs.go` lose the staged fields and gain `dispatcher`.
- The export and `evaluation` lose the staged time. A file exported before
  this, with that column, is still read.
- `cmd/sim` takes `-dispatcher` where it took the two policies.
- Run `sqlc generate` and `swag init`. Done when `go build ./... && go vet
  ./... && go test ./...` pass and `grep -ri staged internal cmd` finds only
  old migrations and the reading of old exports and settings.

#### Q4. The CLI

`maestro queue`, `maestro settings`, `maestro runs show`, `maestro export`
and `maestro help concepts` (`cmd/queue.go`, `settings.go`, `runs.go`,
`export.go`, `concepts.go`, `internal/maestroapi`) show the three queues:
no `staged`, the dispatcher policy where select and allocate were, and the
number of heads in the dispatcher queue. An older server that still answers
with `staged` is shown as it answers.

#### Q5. The Maestro page

`QueuePanel.vue`, `SettingsAdmin.vue` (one dispatcher policy, no staging
capacity), `LineDetails.vue` and `RunsDrive.vue` (a line's timeline and
status), `LinesReport.vue` and `GroupsAdmin.vue`.

#### Q6. The book

`how/queue.md`, `how/score.md`, `admin/policies.md`, `admin/groups.md`,
`admin/sim.md`, `use/usage.md` (the export's columns), `use/runs.md`,
`use/page.md`, `start/quickstart.md`, `admin/machines.md` and the glossary's
statuses. The diagrams in `how/queue.md` are redrawn with three queues. Then
`sh book/build.sh`.

#### Q7. A run has at most 5000 lines

`container.MaxLines` goes from 1000 to 5000. The book says 1000 in
`repo/maestro-toml.md`, `repo/generator.md`, `reference/troubleshooting.md`
and the glossary. `maestro-template`'s README says ten runs of a thousand
are needed for 10 000 containers, which becomes two runs of 5000. Check
that a run of 5000 lines is listed without a query per line
(`container.List`, `Get`), and that `RunsDrive.vue` draws 5000 rows without
freezing; if it does freeze, say so instead of raising the limit halfway.

### Limits and secrets

#### K1. A key can be revoked

`internal/db/queries/keys.sql` has no delete, and `maestro logout` only
forgets the key on the user's computer.

- orq: add queries that delete a key by its hash, by its user and prefix, and
  all of a user's. Add to `auth.API`: `RevokeKey(ctx, userID, prefix)`, which
  is `apierr.NotFound` when that user has no such key; `RevokeCurrentKey(ctx,
  rawKey)`; `RevokeUserKeys(ctx, userID)`; and `ListKeys(ctx, userID)`.
- Routes, in `internal/api/keys.go`: `GET /api/keys` and
  `DELETE /api/keys/:prefix` for a session or a key, `DELETE
  /api/keys/current` for a key, and `DELETE /api/admin/users/:id/keys` for
  an administrator.
- CLI: `maestro logout` calls `DELETE /api/keys/current` before it forgets.
  If the server can't be reached it says the key is still valid there, and
  forgets it anyway. Add `maestro keys` (lists the prefix of each key and
  when it was created, with `--json`) and `maestro keys rm <prefix>` (asks
  first, `--yes`), in a new `cmd/keys.go`.
- Page: in `GroupsAdmin.vue`, each user gets a "Revoke keys" button that
  asks before it calls the administrator's route.
- Book: `use/login.md`, `admin/identity.md`, the glossary.
- Done when a test in `auth` shows a revoked key is refused by
  `RequireMaestroKey` and by `/api/keys/verify`, and a test in `cmd` shows
  `maestro logout` calls the route.

#### K2. The middleware asks `auth`

`middleware.RequireMaestroKey` reads the key from the database itself, and
`auth.VerifyKey` does the same apart from it. Give `auth.API` one method that
takes a raw key and returns its user or an `apierr.Unauthorized`, and have
both the middleware and `VerifyKey` use it. `internal/key` is then used only
by `auth`: move its two functions into `internal/auth/keys.go`, with the key
methods of K1, and delete the package. Done when `middleware` no longer
imports `key`, and no longer queries keys.

#### K3. A key expires

Add `KEY_TTL` to `config` (a duration, default `2160h`, 90 days; `0` means
never). The method from K2 refuses a key whose `created_at` is older, with
"this Maestro key expired; run `maestro login`". `GET /api/keys` and
`maestro keys` show when each key expires. Book: `reference/env.md`,
`use/login.md`, `reference/troubleshooting.md`. Done when a test shows a key
older than the TTL is refused and one with `KEY_TTL=0` isn't. Say in the
commit message that keys older than 90 days stop working when this is
deployed.

#### B1. A build has memory and CPU limits, and a user builds two at once

`podman.Build` passes neither limit. Add `BUILD_MEMORY_MB` (default 4096) and
`BUILD_CPUS` (default 2) to `config`, and pass them in
`client.ImageBuildOptions` (`Memory`, `CPUPeriod`, `CPUQuota`). Add
`BUILDS_AT_ONCE` (default 2): `build.reserve` already counts a user's running
builds, and now refuses one over the limit with `apierr.Conflict`: "you
already have 2 builds running; wait for one to end". Check with
`podman/live_test.go` that Podman holds a build to the memory limit. If it
ignores the option, say so and leave the limit out instead of documenting one
that does nothing. Book: `reference/env.md`, `use/builds.md`.

#### B2. Redis has a password

In `.env.example`, show `REDIS_URL` with a password and say how to set one on
the server. In `main.go`, when `MODE` isn't `dev` and `REDIS_URL` has no
password, log one line at start saying that sessions can be forged by
anything that reaches Redis. Book: `admin/deploy.md`, which says that Redis
is given a password, is not published beyond the host, and that a Redis
shared with other services gets the same care from each of them.

The Redis itself is not Maestro's to change: on the production server it is
a container of another compose project, shared with other services. Its
owner sets the password there, and then `REDIS_URL` here.

#### L1. A line has a longest running time

Add `RUN_MAX_HOURS` to `config.RunLimits` (default 168, a week; `0` means no
limit). In `runner.check`, a running line whose `started_at` is older is
stopped the way a cancelled one is: its logs and outputs are collected, and
it ends as `error` with the note "stopped after 168 hours, the longest a line
may run on this server". Book: `reference/env.md`, `use/runs.md`, the
glossary's statuses. Done when a test in `runner` shows which lines are over
the limit (a pure function, as `ended` is).

#### L2. A user's runs keep a limited amount

Add `USER_DATA_MAX_GB` to `config.RunLimits` (default 0, no limit). Add a
method to `runner.Data` that sums the files under a user's directory.
`container.Create` refuses a new run once the user is at the limit, with
`apierr.Conflict`: "your runs keep 52 GB of the 50 GB allowed; delete one
with `maestro runs rm <run>`". Book: `reference/env.md`,
`admin/retention.md`.

#### N1. orq listens on the loopback address

In `docker-compose.yml`, the port becomes
`"${ORQ_BIND:-127.0.0.1}:3005:3005"`, with `ORQ_BIND` explained in
`.env.example`. Book: `admin/deploy.md`, which also says that the host needs
a firewall letting in only SSH and what the reverse proxy listens on.

Don't deploy this without its owner. On the production server the reverse
proxy is a container of another compose project, and reaches orq at
`host.containers.internal:3005`, the gateway of Podman's bridge. Whether a
port published on the loopback address still answers there has to be tried
on that server. If it doesn't, `ORQ_BIND` is set there to what does, or the
proxy and orq are put on one Podman network and the port isn't published.

#### N2. The swagger pages need a session

In `router.go`, register `/swagger/*any` behind `authMW` unless `cfg.Dev`.

#### N3. The HTTP server has timeouts

In `main.go`, replace `router.Run` with an `http.Server` that has a
`ReadHeaderTimeout` of 10 seconds and an `IdleTimeout` of 2 minutes, and no
`ReadTimeout` or `WriteTimeout`.

### Building and deploying

#### C1. Each repository tests itself

Add `.github/workflows/test.yml` to `maestro-orq` and `maestro-cli` (set up
Go from `go.mod`, then build, vet and test) and to `maestro-view` (`npm ci`,
`npm run build`).

#### V1. The view's image installs from the lock file

Its `Dockerfile` copies only `package.json` and runs `bun install`, so
`package-lock.json` is ignored. Build on a Node LTS image: copy both files,
`npm ci`, then `npm run build`. `serve.ts` and the `serve` script use bun:
keep them only if something still runs them, and say what in the README.

#### D1. SQLite in WAL mode

In `main.go`, open the database with `_pragma=journal_mode(WAL)` and
`_pragma=synchronous(NORMAL)` beside the busy timeout. Add `*.db-wal` and
`*.db-shm` to orq's `.gitignore`. Book: `admin/retention.md`, on backing the
database up. Don't turn `foreign_keys` on: the deletes in `container.Remove`
and `group` were never run with it, and that needs its own change and tests.

#### D2. orq's production image is slim

The `prod` stage is the Go image with the whole source. Build the binary in
a stage, then copy it, with `cloudflared`, into `debian:bookworm-slim` with
`git`, `tini` and `ca-certificates` installed. orq runs `git` and `sh`, so
both must be there. Done when `podman build --target prod` works and the
image starts.

#### D3. The book says how rootless Podman keeps running

Add to `admin/deploy.md`: the user whose Podman runs Maestro needs lingering
(`loginctl enable-linger <user>`), or its containers stop when that user's
last session ends. The production server has it off.

### Text a user reads

#### T1. The CLI's help, in the book's voice

Go through every file in `maestro-cli/cmd`, one commit per command group
(`login` and `logout`; `build` and `builds`; `run` and `runs`; `forges` and
`repos`; `queue`, `usage`, `export`, `settings`; `machines` and `top`;
`docs` and the root). For each command, open its page in the book, then
rewrite `Short`, `Long`, the flags' descriptions and the messages it prints
by [Text a user reads](#text-a-user-reads). Change the wording and nothing
else: no flag is renamed, and no fact is added or dropped. Known cases:

- the sentences shown as "Before" above, in `login.go` and `top.go`;
- "this machine" for the user's computer, in `logout.go`;
- "minted", "errored", "ctrl-c", and "stdout" and "stderr" in sentences;
- `--line int64Slice (default [])` in `maestro runs get`;
- the group commands' `Short` ("Commands for what `maestro build` built");
- `--server`'s "(default: the one kept, asked for the first time)".

Run `sh book/build.sh` in each commit, and fix the tests that quote the old
text.

#### T2. orq's messages

The same pass over every `apierr.…(` message and every `response.Fail`
fallback in `maestro-orq/internal`, and over what a build writes to its log
(`build.Create`). One commit.

#### T3. The Maestro page's text

The same pass over every component in `maestro-view/src`, one commit per
component: labels, buttons, empty lists, notes, `title`s, placeholders and
the messages set in the script. Known cases:

- curly apostrophes ("user’s", "group’s") beside straight ones;
- `title`s that are fragments in lower case ("the container never wrote
  it"), and ones that use θ and Z without naming them, in
  `SettingsAdmin.vue`;
- "Open in new tab, drawn", which doesn't say what it does.

### Structure

#### S1. The READMEs point to the book

The root `README.md` holds over 600 lines of behaviour that the book now
covers, and the two are kept true by hand. For each section of the root
README, find the page of the book that says the same thing. If the book
lacks something, add it to the book. Then cut the README down to what
Maestro is, the layout, getting started, and production, each with a link to
the book's page. Do the same for `maestro-view/README.md`. One commit per
README, after the text of that part is done (T1 to T3).

#### S2. The runs page is one component of 1170 lines

Take the pieces of `RunsDrive.vue` out into components of their own, one
commit each: the list of runs, one run's lines, and the bar of filters and
search. Behaviour and classes stay as they are.

#### S3. The root holds what it shouldn't

`plano.md` is the plan of the queues, and describes the four levels that
[The queues](#the-queues) replaces. Once Q1 to Q6 are done the book's
`how/queue.md` says how they work. Delete it once its owner agrees. `Maestro.html`
(5.6 MB, untracked) and the worktree at `.claude/worktrees/docs-book` are
the owner's to remove: ask, don't delete.

## To build

What Maestro doesn't do yet and should. These come after
[Not followed yet](#not-followed-yet), in the order given within a group,
one change and one commit each, and each is removed from this list in the
commit that finishes it. Each says where its code goes; the rules above hold
for it as for any change. If an item can't be done as written, stop and say
why.

### For the thesis

#### P1. The simulator replays what really happened

`cmd/sim` generates a workload, runs it and evaluates it, but can't take
the lines of a real period. Add `sim replay`: it reads an export
(`maestro export`, read by `evaluation.Read`), makes a job of each line that
ran (its user, group, cores, memory, when it was submitted, and how long it
ran, from started to finished), and runs them through `simulate` on the
machines and policies given as `sim run` takes them. Lines that never ran
are left out, and it says how many. Add `sim compare a.csv b.csv`, which
prints the two evaluations side by side with the difference in each measure.
The conversion goes in `simulate/workload.go`. Book: `admin/sim.md`, with
the steps to check the simulator against a real week. Done when a test shows
that a simulation's own export, replayed on the same machines with the same
policies and seed, gives every line the same wait.

#### P2. A line says how long it may run

Add `time` to `maestro.toml`, with the keys a generator's `Config` may
change for each line (`choices` in `container/config.go`): a duration such
as "90m" or "2h", at most the server's `RUN_MAX_HOURS`, which is also what a
line gets when it names none. It is stored with the line (a migration adds
the column), shown by `maestro runs show` and the page's line details, given
to the container as `MAESTRO_TIME` in seconds, and enforced in
`runner.check` the way L1 enforces the server's limit, with the note
"stopped after 2h, the time this line asked for". `sched.Task` gains the
limit, so that a policy can read it. Do this after L1. Book:
`repo/maestro-toml.md`, `reference/maestro-toml.md`, `repo/container.md`,
`use/runs.md`. No policy uses the limit in this change: shortest-first and
backfilling are added to the model by its owner first, in
[The queues](#the-queues), and then built.

#### P3. One command runs the whole comparison

Add `sim grid`: given a workload, the machines, and lists of policies for
each queue, of share measures and of seeds, it runs every combination and
writes one CSV row for each, with the settings and every measure
`evaluation.Evaluate` gives. The same arguments write the same file. It
goes in `cmd/sim` and `simulate`; the figures are the thesis's own to draw.
Book: `admin/sim.md`.

### For users

#### P4. A run's lines are run again, the failed ones or the ones named

Add `maestro runs retry <run>`, which queues a new run of the same build
with some of the old run's lines, each with the arguments, cores, memory,
environment and outputs it had. `--failed` takes the lines that failed,
ended in an error or were cancelled, and is what it does when no line is
named. `--line n` (again for more) takes exactly those lines, whatever
their status, so that one line that succeeded can be run again too:
`maestro runs retry 31 --line 2`. A line that is still waiting or running
is refused, with its status. In the new run the lines keep the numbers they
had, so that line 2 of the retry is line 2 of run 31. On the page, a line's
details have a "Run again" button that does the same for that line. It takes `--watch`, `-q`
and `--json` as `maestro run` does. orq: `POST /api/runs/:id/retry` and a
`Retry` method in `container`, which refuses with `apierr.Conflict` when the
build no longer has its image ("build #12 no longer has its image; build it
again with `maestro build`"). The new run records which run it retries (a
migration adds `runs.retry_of`), and `maestro runs show` and the page say
"a retry of run 31". Book: `use/runs.md`, `reference/troubleshooting.md`.

#### P5. A line whose machine was lost goes back to the queue

Add `retries` to `maestro.toml`, a number from 0 to 5, 0 when left out,
with the keys a generator may change for each line. A line that ends
because its machine restarted, was removed or lost its container goes back
to `queued` instead of ending in `error`, at most that many times, and its
details say how many attempts it took (a migration adds
`run_lines.attempts`). A line that exits with a code, is cancelled or runs
out of time is never retried. The decision is a pure function in `runner`,
with its test. Book: `repo/maestro-toml.md`, `reference/maestro-toml.md`,
`use/runs.md`.

#### P6. Outputs are kept while a line runs

Outputs are copied out only when a container ends, so a line that runs for
days and loses its machine keeps nothing. Add `outputs_every` to
`maestro.toml`, a duration of at least 10 minutes, off when left out. In
`runner.check`, a running line whose last copy is older has its outputs
copied as `collect` does at the end, into the same place and within the
same `RUN_OUTPUT_MAX_MB`, each copy taking the place of the one before. A
line that then loses its machine keeps the last copy, and its note says when
it was taken. This is the largest item here: do it after P5, and stop to
say so if `collect` can't be run on a container that is still running.
Book: `repo/maestro-toml.md`, `use/results.md`.

#### P7. Old runs expire

orq deletes no run on its own. Add `run_retention_days` to `setting`,
changed from Admin › Settings, 0 by default, which means never. A run whose
last line ended more than that many days ago is deleted with its files, by
the runner, once an hour, the way `container.Remove` deletes one. A user
keeps a run with `maestro runs keep <run>` and lets it go again with
`--off` (a migration adds `runs.kept`). `maestro runs` and the page show
when a run expires, once that is within a week. Book: `admin/retention.md`,
`admin/policies.md`, `use/runs.md`.

### For whoever runs a Maestro

#### P8. orq backs its database up

Everything orq knows is one SQLite file. Add `DB_BACKUP_DIR` to `config`,
off when empty, and `DB_BACKUPS_KEPT`, 7 by default. Once a day orq writes
`maestro-orq-<date>.db` there with `VACUUM INTO`, which is safe while orq
runs, and removes the oldest beyond the number kept. It goes in `db`.
`docker-compose.yml` mounts a volume for it. Book: `reference/env.md`, and
`admin/retention.md` with the steps to restore one and what a restore
loses (the runs' files aren't in it).

#### P9. One test goes through everything

Add `dev/e2e.sh`, which against the development stack signs in through its
identity provider, approves a `maestro login`, adds the host as a machine,
builds the public template, runs it, downloads the result with
`maestro runs get` and checks a file it expects. It leaves the stack as it
found it. If signing in can't be scripted against the development
provider, stop and say so instead of adding a way around signing in. Book:
`contributing.md`.

#### P10. GPUs are a resource

`maestro top` shows a machine's GPUs, but a line can't ask for one and the
scheduler counts only cores and memory. This is not to be built from this
paragraph: its owner first adds GPUs to the model in
[The queues](#the-queues), since shares, the score and fitting a line all
change with a third resource. What it will touch, for whoever plans it:
`sched.Resources`, a machine's capacity (`machine`, `metrics`), `gpus` in
`maestro.toml`, how Podman is given a device (`podman.CreateContainer`),
usage and the export.

#### P11. One line is cancelled

`maestro runs cancel 31` stops a whole run. Add `--line n` (again for
more), which cancels those lines and leaves the rest: a line still waiting
ends as `cancelled` at once, and a running one is stopped by the runner the
way a cancelled run's lines are, with its logs and outputs kept. A line
already over is refused, with its status. orq: `POST
/api/runs/:id/lines/:line/cancel` and a method in `container`; a migration
marks the line, since today only a run is marked cancelled. On the page, a
line's details have a "Cancel" button. Book: `use/runs.md`.

#### P12. A user holds at most so many cores

Add `user_max_cpus` to `setting`, changed from Admin › Settings, 0 by
default, which means no ceiling. In `sched`, a user's head isn't a candidate
in a turn while the cores of their lines assigned, starting and running,
with the head's, would be over it; other users' heads go as usual. The
snapshot carries the ceiling, so the simulator obeys it too (`sim run
-user-max-cpus`). `maestro settings` shows it, and `maestro queue` says
when the caller is at it. Add the rule to [The queues](#the-queues) in the
same change. Book: `how/queue.md`, `admin/policies.md`.

#### P13. What administrators change is written down

Nothing records who changed the scheduler's settings, moved a user, edited
a machine or revoked keys, or when. Add a table of administrators' actions
(who, when, what, and the old and new values as JSON), written by the
service that makes each change, in the same transaction where there is one.
It is a new package, `audit`, because it belongs to no resource: every
resource writes to it. `GET /api/admin/actions`, newest first, and a
History section in the page's Admin. The export gains nothing, but a
period measured for the thesis can be cut where the settings changed.
Book: `admin/policies.md`.

## The thesis

Maestro is its author's final project in computer engineering. This is how
the text of the thesis is written, by whoever helps write it.

### The claim

Every section is tested against one sentence. As it stands:

> A scheduler of three queues with configurable policies lets a small
> shared lab cluster run containerized experiments with less waiting and
> fairer sharing than first come, first served, and a simulator that runs
> the same scheduler predicts how it behaves.

A section that neither supports nor qualifies it is shortened or moved to
an appendix. When the results change the claim, the sentence is changed
first and the sections after it.

### What each chapter answers

1. Introduction. What problem a lab has today, who it hurts, and what is
   delivered. It ends with the general objective, three or four specific
   ones, and the contributions as a list. Each specific objective has a
   section of results that answers it.
2. Background. Only what the model needs: online scheduling without
   knowing how long a task runs; the queue policies used; fairness over
   several resources (DRF); the measures (waiting time, bounded slowdown,
   utilization, Jain's index). Each symbol is defined once, in a table of
   notation.
3. Related work. Slurm, HTCondor and Kubernetes as systems; DRF, Tetris and
   Choosy as policies. It closes with a table of what each offers and what
   Maestro does differently, and one paragraph on why a lab wouldn't just
   use Slurm.
4. The model. Users, groups, machines and lines; the three queues and the
   policy of each; the score and how it is normalized. It matches `sched`
   name for name, and [The queues](#the-queues) above.
5. The system. The architecture in one diagram, then the decisions that
   mattered: the scheduler kept pure and shared with the simulator; what
   orq knows kept in its database, so that it restarts in the middle of a
   run; how someone else's code is contained; how machines are reached. The
   CLI, the page and the book get a short section or an appendix.
6. Method. The workloads, exported from real use and generated; the
   machines; the factors of the experiment and their levels; the seeds; the
   measures; and how the simulator was checked against the real cluster
   (P1).
7. Results. One question in each subsection, which opens with its answer
   and then shows the figure. Effects are given as sizes with units, not
   only as which policy won.
8. Conclusion. What the evidence supports, the limits (few users, machines
   all alike, no GPUs, no estimate of how long a line runs), and what comes
   next.

### While writing

- The order of writing is the model, the method, the results, the system,
  related work, the introduction, then the abstract.
- A figure's or a table's caption says what the reader should conclude from
  it.
- A claim about waiting, utilization or fairness points to a measurement. A
  claim about the code points to a package.
- The experiments name the commit of each repository they ran on, tagged,
  and an appendix gives the commands that run them again (P3).
- The limits are stated by the author, in the text.
- A feature isn't listed. A decision is described: what was chosen, what
  was turned down, and why.
- The words are the glossary's and this file's, in the thesis's language:
  one word for each thing, the same in the model, the code and the figures.

### What the examiners will ask

- Why three queues, and what the dispatcher queue gives that one queue for
  everyone doesn't.
- Why nothing is kept for a line when it is dispatched, and what that costs
  a large line.
- How it is known that the simulator matches the cluster.
- What becomes of fairness when a user's lines fit only some machines.
- How one user's code is kept from harming another's, or the server.

## Before finishing a change

- [ ] No file was added where an existing one already holds that kind of thing.
- [ ] No package was added for what an existing one owns.
- [ ] `internal/api` and `internal/middleware` gained only handlers, types and annotations.
- [ ] `internal/maestroapi` gained only types and requests.
- [ ] Tests are beside what they test, in the package that holds it.
- [ ] `sqlc generate` and `swag init` were run if queries or annotations changed.
- [ ] Text a user reads uses the book's words, and the book's page says the same thing.
- [ ] `sh book/build.sh` was run if a page or a command's help changed.
- [ ] A new route, a new thing kept or a new program run was checked against Limits and secrets.
- [ ] The book says what changed for whoever uses it.
- [ ] The item was removed from Not followed yet or To build, if it was one.
