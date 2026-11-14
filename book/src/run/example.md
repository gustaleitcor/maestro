# A worked example: the stress test

[maestro-template](https://github.com/gustaleitcor/maestro-template) is a
repo to fork: a stress test of Maestro's scheduler, which uses every key of
`maestro.toml` and a generator with `Config`. Its containers do no useful
work. Each takes up the cores and memory it asked for (or only reserves
them) for a while, and writes `report.json` with what it used. What it tests
is how Maestro places, queues and interleaves a thousand lines of very
different sizes.

The files below are the template's own, as this book was built.

## maestro.toml

```toml
{{#include ../../../maestro-template/maestro.toml}}
```

## The generator

`genvrs.py` adds 996 lines to the four of `parameters`, which makes 1000, a
run's most. Each gets a shape (its cores and memory, through `Config`), a
mode and a time, drawn from a fixed seed, so every build of a commit gives
the same lines:

```python
{{#include ../../../maestro-template/genvrs.py}}
```

## The Dockerfile

The program needs only Python's standard library. Its `ENTRYPOINT` is the
program, so each line's words reach it as arguments; `CMD` is what runs when
there are no lines.

```dockerfile
{{#include ../../../maestro-template/Dockerfile}}
```

## Running it

```sh
maestro build <your fork> --watch     # build, run once, and follow it
maestro run <build>                   # again
maestro queue                         # where the lines wait
maestro top q1                        # one machine, as it fills
maestro runs get <run>                # the reports and logs
```

Every run of a build is the same lines. A different `SEED` in `genvrs.py`
draws others, with no new build: `maestro run <build> -g genvrs.py` sends
it from your copy, and `-c` a `maestro.toml` with, say, other machines.
