# Fixes

Where the code doesn't hold yet to [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one. Each item is one change, done and committed on
its own, in the order given within its group. An item is
removed from this list in the commit that finishes it. If an item can't be
done as written, stop and say why instead of doing something near it.

## The queues

These come first, and in this order. The code has a fourth level between
the user queues and the machines: a buffer of `staged` lines for each group,
filled by a select policy and emptied by an allocate policy. It was built by
mistake. [The queues](queues.md) says what is meant.

### Q1. `sched` has three queues

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

### Q2. The score divides by the sum

`Context.Largest` becomes `Context.Cluster`, set from the state's `cluster`
(what every known machine that isn't down has for lines, summed).
`Score.Of` divides a line's cores and memory by it. Tetris keeps
`Context.Whole`. Done when a test in `policy_test.go` shows a line's term
with two machines of 8 cores is its cores over 16, not over 8. Say in the
commit message that the cores and memory weights now multiply smaller
numbers, so saved weights weigh less than they did.

### Q3. orq around `sched`

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

### Q4. The CLI

`maestro queue`, `maestro settings`, `maestro runs show`, `maestro export`
and `maestro help concepts` (`cmd/queue.go`, `settings.go`, `runs.go`,
`export.go`, `concepts.go`, `internal/maestroapi`) show the three queues:
no `staged`, the dispatcher policy where select and allocate were, and the
number of heads in the dispatcher queue. An older server that still answers
with `staged` is shown as it answers.

### Q5. The Maestro page

`QueuePanel.vue`, `SettingsAdmin.vue` (one dispatcher policy, no staging
capacity), `LineDetails.vue` and `RunsDrive.vue` (a line's timeline and
status), `LinesReport.vue` and `GroupsAdmin.vue`.

### Q6. The book

`how/queue.md`, `how/score.md`, `admin/policies.md`, `admin/groups.md`,
`admin/sim.md`, `use/usage.md` (the export's columns), `use/runs.md`,
`use/page.md`, `start/quickstart.md`, `admin/machines.md` and the glossary's
statuses. The diagrams in `how/queue.md` are redrawn with three queues. Then
`sh book/build.sh`.

### Q7. A run has at most 5000 lines

`container.MaxLines` goes from 1000 to 5000. The book says 1000 in
`repo/maestro-toml.md`, `repo/generator.md`, `reference/troubleshooting.md`
and the glossary. `maestro-template`'s README says ten runs of a thousand
are needed for 10 000 containers, which becomes two runs of 5000. Check
that a run of 5000 lines is listed without a query per line
(`container.List`, `Get`), and that `RunsDrive.vue` draws 5000 rows without
freezing; if it does freeze, say so instead of raising the limit halfway.

## Limits and secrets

### K1. A key can be revoked

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

### K2. The middleware asks `auth`

`middleware.RequireMaestroKey` reads the key from the database itself, and
`auth.VerifyKey` does the same apart from it. Give `auth.API` one method that
takes a raw key and returns its user or an `apierr.Unauthorized`, and have
both the middleware and `VerifyKey` use it. `internal/key` is then used only
by `auth`: move its two functions into `internal/auth/keys.go`, with the key
methods of K1, and delete the package. Done when `middleware` no longer
imports `key`, and no longer queries keys.

### K3. A key expires

Add `KEY_TTL` to `config` (a duration, default `2160h`, 90 days; `0` means
never). The method from K2 refuses a key whose `created_at` is older, with
"this Maestro key expired; run `maestro login`". `GET /api/keys` and
`maestro keys` show when each key expires. Book: `reference/env.md`,
`use/login.md`, `reference/troubleshooting.md`. Done when a test shows a key
older than the TTL is refused and one with `KEY_TTL=0` isn't. Say in the
commit message that keys older than 90 days stop working when this is
deployed.

### B1. A build has memory and CPU limits, and a user builds two at once

`podman.Build` passes neither limit. Add `BUILD_MEMORY_MB` (default 4096) and
`BUILD_CPUS` (default 2) to `config`, and pass them in
`client.ImageBuildOptions` (`Memory`, `CPUPeriod`, `CPUQuota`). Add
`BUILDS_AT_ONCE` (default 2): `build.reserve` already counts a user's running
builds, and now refuses one over the limit with `apierr.Conflict`: "you
already have 2 builds running; wait for one to end". Check with
`podman/live_test.go` that Podman holds a build to the memory limit. If it
ignores the option, say so and leave the limit out instead of documenting one
that does nothing. Book: `reference/env.md`, `use/builds.md`.

### B2. Redis has a password

In `.env.example`, show `REDIS_URL` with a password and say how to set one on
the server. In `main.go`, when `MODE` isn't `dev` and `REDIS_URL` has no
password, log one line at start saying that sessions can be forged by
anything that reaches Redis. Book: `admin/deploy.md`, which says that Redis
is given a password, is not published beyond the host, and that a Redis
shared with other services gets the same care from each of them.

The Redis itself is not Maestro's to change: on the production server it is
a container of another compose project, shared with other services. Its
owner sets the password there, and then `REDIS_URL` here.

### L1. A line has a longest running time

Add `RUN_MAX_HOURS` to `config.RunLimits` (default 168, a week; `0` means no
limit). In `runner.check`, a running line whose `started_at` is older is
stopped the way a cancelled one is: its logs and outputs are collected, and
it ends as `error` with the note "stopped after 168 hours, the longest a line
may run on this server". Book: `reference/env.md`, `use/runs.md`, the
glossary's statuses. Done when a test in `runner` shows which lines are over
the limit (a pure function, as `ended` is).

### L2. A user's runs keep a limited amount

Add `USER_DATA_MAX_GB` to `config.RunLimits` (default 0, no limit). Add a
method to `runner.Data` that sums the files under a user's directory.
`container.Create` refuses a new run once the user is at the limit, with
`apierr.Conflict`: "your runs keep 52 GB of the 50 GB allowed; delete one
with `maestro runs rm <run>`". Book: `reference/env.md`,
`admin/retention.md`.

### N1. orq listens on the loopback address

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

### N2. The swagger pages need a session

In `router.go`, register `/swagger/*any` behind `authMW` unless `cfg.Dev`.

### N3. The HTTP server has timeouts

In `main.go`, replace `router.Run` with an `http.Server` that has a
`ReadHeaderTimeout` of 10 seconds and an `IdleTimeout` of 2 minutes, and no
`ReadTimeout` or `WriteTimeout`.

## Building and deploying

### C1. Each repository tests itself

Add `.github/workflows/test.yml` to `maestro-orq` and `maestro-cli` (set up
Go from `go.mod`, then build, vet and test) and to `maestro-view` (`npm ci`,
`npm run build`).

### V1. The view's image installs from the lock file

Its `Dockerfile` copies only `package.json` and runs `bun install`, so
`package-lock.json` is ignored. Build on a Node LTS image: copy both files,
`npm ci`, then `npm run build`. `serve.ts` and the `serve` script use bun:
keep them only if something still runs them, and say what in the README.

### D1. SQLite in WAL mode

In `main.go`, open the database with `_pragma=journal_mode(WAL)` and
`_pragma=synchronous(NORMAL)` beside the busy timeout. Add `*.db-wal` and
`*.db-shm` to orq's `.gitignore`. Book: `admin/retention.md`, on backing the
database up. Don't turn `foreign_keys` on: the deletes in `container.Remove`
and `group` were never run with it, and that needs its own change and tests.

### D2. orq's production image is slim

The `prod` stage is the Go image with the whole source. Build the binary in
a stage, then copy it, with `cloudflared`, into `debian:bookworm-slim` with
`git`, `tini` and `ca-certificates` installed. orq runs `git` and `sh`, so
both must be there. Done when `podman build --target prod` works and the
image starts.

### D3. The book says how rootless Podman keeps running

Add to `admin/deploy.md`: the user whose Podman runs Maestro needs lingering
(`loginctl enable-linger <user>`), or its containers stop when that user's
last session ends. The production server has it off.

## Text a user reads

### T1. The CLI's help, in the book's voice

Go through every file in `maestro-cli/cmd`, one commit per command group
(`login` and `logout`; `build` and `builds`; `run` and `runs`; `forges` and
`repos`; `queue`, `usage`, `export`, `settings`; `machines` and `top`;
`docs` and the root). For each command, open its page in the book, then
rewrite `Short`, `Long`, the flags' descriptions and the messages it prints
by [Text a user reads](writing.md). Change the wording and nothing
else: no flag is renamed, and no fact is added or dropped. Known cases:

- the sentences shown as "Before" in [writing.md](writing.md), in
  `login.go` and `top.go`;
- "this machine" for the user's computer, in `logout.go`;
- "minted", "errored", "ctrl-c", and "stdout" and "stderr" in sentences;
- `--line int64Slice (default [])` in `maestro runs get`;
- the group commands' `Short` ("Commands for what `maestro build` built");
- `--server`'s "(default: the one kept, asked for the first time)".

Run `sh book/build.sh` in each commit, and fix the tests that quote the old
text.

### T2. orq's messages

The same pass over every `apierr.…(` message and every `response.Fail`
fallback in `maestro-orq/internal`, and over what a build writes to its log
(`build.Create`). One commit.

### T3. The Maestro page's text

The same pass over every component in `maestro-view/src`, one commit per
component: labels, buttons, empty lists, notes, `title`s, placeholders and
the messages set in the script. Known cases:

- curly apostrophes ("user’s", "group’s") beside straight ones;
- `title`s that are fragments in lower case ("the container never wrote
  it"), and ones that use θ and Z without naming them, in
  `SettingsAdmin.vue`;
- "Open in new tab, drawn", which doesn't say what it does.

## Structure

### S1. The READMEs point to the book

The root `README.md` holds over 600 lines of behaviour that the book now
covers, and the two are kept true by hand. For each section of the root
README, find the page of the book that says the same thing. If the book
lacks something, add it to the book. Then cut the README down to what
Maestro is, the layout, getting started, and production, each with a link to
the book's page. Do the same for `maestro-view/README.md`. One commit per
README, after the text of that part is done (T1 to T3).

### S2. The runs page is one component of 1170 lines

Take the pieces of `RunsDrive.vue` out into components of their own, one
commit each: the list of runs, one run's lines, and the bar of filters and
search. Behaviour and classes stay as they are.

### S3. The root holds what it shouldn't

`plano.md` is the plan of the queues, and describes the four levels that
[The queues](queues.md) replaces. Once Q1 to Q6 are done the book's
`how/queue.md` says how they work. Delete it once its owner agrees. `Maestro.html`
(5.6 MB, untracked) and the worktree at `.claude/worktrees/docs-book` are
the owner's to remove: ask, don't delete.
