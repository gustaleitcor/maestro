# Roadmap

What Maestro doesn't do yet and should. These come after the
[fixes](fixes.md), in the order given within a group, one change and one
commit each, and each is removed from this list in the commit that finishes
it. Each says where its code goes; [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one hold for it as for any change. If an item can't be done as written, stop and say
why.

## For whoever runs a Maestro

### P10. GPUs are a resource

`maestro top` shows a machine's GPUs, but a line can't ask for one and the
scheduler counts only cores and memory. This is not to be built from this
paragraph: its owner first adds GPUs to the model in
[The queues](queues.md), since shares, the score and fitting a line all
change with a third resource. What it will touch, for whoever plans it:
`sched.Resources`, a machine's capacity (`machine`, `metrics`), `gpus` in
`maestro.toml`, how Podman is given a device (`podman.CreateContainer`),
usage and the export.
