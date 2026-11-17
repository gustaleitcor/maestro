# Roadmap

What Maestro doesn't do yet and should. These come after the
[fixes](fixes.md), in the order given within a group, one change and one
commit each, and each is removed from this list in the commit that finishes
it. Each says where its code goes; [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one hold for it as for any change. If an item can't be done as written, stop and say
why.

## For whoever runs a Maestro

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
