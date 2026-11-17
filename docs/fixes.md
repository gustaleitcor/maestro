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

### Q8. The runs page draws a run of 5000 lines

Do this before Q7. With a run of 5000 lines, `RunsDrive.vue` takes 2.4
seconds to draw it, 1 to 3 seconds to sort it, and stalls for up to a
second every time it polls an active run, every 5 seconds. Every row is
drawn with `v-for`, and each poll replaces every line, so Vue patches all
5000 rows. Draw only the rows in view, and have a poll change only the
lines whose status changed. Behaviour and classes stay as they are. Done
when a run of 5000 lines draws, sorts and polls in under 0.4 seconds each,
as a run of 1000 does now, measured the same way.

### Q7. A run has at most 5000 lines

`container.MaxLines` goes from 1000 to 5000. The book says 1000 in
`repo/maestro-toml.md`, `repo/generator.md`, `reference/troubleshooting.md`
and the glossary. `maestro-template`'s README says ten runs of a thousand
are needed for 10 000 containers, which becomes two runs of 5000. Check
that a run of 5000 lines is listed without a query per line
(`container.List`, `Get`), and that `RunsDrive.vue` draws 5000 rows without
freezing; if it does freeze, say so instead of raising the limit halfway.

## Limits and secrets

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

## Building and deploying

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
