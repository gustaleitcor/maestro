# Roadmap

What Maestro doesn't do yet and should. These come after the
[fixes](fixes.md), in the order given within a group, one change and one
commit each, and each is removed from this list in the commit that finishes
it. Each says where its code goes; [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one hold for it as for any change. If an item can't be done as written, stop and say
why.

## For the thesis

### P2. A line says how long it may run

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
[The queues](queues.md), and then built.

## For users

### P5. A line whose machine was lost goes back to the queue

Add `retries` to `maestro.toml`, a number from 0 to 5, 0 when left out,
with the keys a generator may change for each line. A line that ends
because its machine restarted, was removed or lost its container goes back
to `queued` instead of ending in `error`, at most that many times, and its
details say how many attempts it took (a migration adds
`run_lines.attempts`). A line that exits with a code, is cancelled or runs
out of time is never retried. The decision is a pure function in `runner`,
with its test. Book: `repo/maestro-toml.md`, `reference/maestro-toml.md`,
`use/runs.md`.

### P6. Outputs are kept while a line runs

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

### P7. Old runs expire

orq deletes no run on its own. Add `run_retention_days` to `setting`,
changed from Admin › Settings, 0 by default, which means never. A run whose
last line ended more than that many days ago is deleted with its files, by
the runner, once an hour, the way `container.Remove` deletes one. A user
keeps a run with `maestro runs keep <run>` and lets it go again with
`--off` (a migration adds `runs.kept`). `maestro runs` and the page show
when a run expires, once that is within a week. Book: `admin/retention.md`,
`admin/policies.md`, `use/runs.md`.

## For whoever runs a Maestro

### P8. orq backs its database up

Everything orq knows is one SQLite file. Add `DB_BACKUP_DIR` to `config`,
off when empty, and `DB_BACKUPS_KEPT`, 7 by default. Once a day orq writes
`maestro-orq-<date>.db` there with `VACUUM INTO`, which is safe while orq
runs, and removes the oldest beyond the number kept. It goes in `db`.
`docker-compose.yml` mounts a volume for it. Book: `reference/env.md`, and
`admin/retention.md` with the steps to restore one and what a restore
loses (the runs' files aren't in it).

### P9. One test goes through everything

Add `dev/e2e.sh`, which against the development stack signs in through its
identity provider, approves a `maestro login`, adds the host as a machine,
builds the public template, runs it, downloads the result with
`maestro runs get` and checks a file it expects. It leaves the stack as it
found it. If signing in can't be scripted against the development
provider, stop and say so instead of adding a way around signing in. Book:
`contributing.md`.

### P10. GPUs are a resource

`maestro top` shows a machine's GPUs, but a line can't ask for one and the
scheduler counts only cores and memory. This is not to be built from this
paragraph: its owner first adds GPUs to the model in
[The queues](queues.md), since shares, the score and fitting a line all
change with a third resource. What it will touch, for whoever plans it:
`sched.Resources`, a machine's capacity (`machine`, `metrics`), `gpus` in
`maestro.toml`, how Podman is given a device (`podman.CreateContainer`),
usage and the export.

### P12. A user holds at most so many cores

Add `user_max_cpus` to `setting`, changed from Admin › Settings, 0 by
default, which means no ceiling. In `sched`, a user's head isn't a candidate
in a turn while the cores of their lines assigned, starting and running,
with the head's, would be over it; other users' heads go as usual. The
snapshot carries the ceiling, so the simulator obeys it too (`sim run
-user-max-cpus`). `maestro settings` shows it, and `maestro queue` says
when the caller is at it. Add the rule to [The queues](queues.md) in the
same change. Book: `how/queue.md`, `admin/policies.md`.

### P13. What administrators change is written down

Nothing records who changed the scheduler's settings, moved a user, edited
a machine or revoked keys, or when. Add a table of administrators' actions
(who, when, what, and the old and new values as JSON), written by the
service that makes each change, in the same transaction where there is one.
It is a new package, `audit`, because it belongs to no resource: every
resource writes to it. `GET /api/admin/actions`, newest first, and a
History section in the page's Admin. The export gains nothing, but a
period measured for the thesis can be cut where the settings changed.
Book: `admin/policies.md`.
