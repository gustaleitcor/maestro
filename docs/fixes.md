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

### Q7. A run has at most 5000 lines

orq and the book allow 5000 lines. What is left is `maestro-template`'s
README on its `stress` branch, which still says a run has at most 1000
lines (line 13, "which makes 1000, a run's most") and that 10 000
containers are ten runs of a thousand (lines 48 and 54). Its owner decides
whether `genvrs.py` makes 5000 lines, so that two runs make 10 000, or keeps
1000 and the README only stops calling 1000 a run's most.

## Structure

### S4. The book's docs service

The book says what the stack doesn't have. `admin/deploy.md` names a `docs`
service in compose that builds `maestro-cli/book/dist`, and its update
command lists it, but `docker-compose.yml` has only `orq` and `view`.
`reference/env.md` lists `VITE_DOCS_URL` and `use/page.md` a Docs link in
the sidebar ("The sidebar has My runs, Queue, Usage and Docs"), and neither was ever in the view. `maestro docs --web` and the
`/docs/` block for Caddy need a server that serves the book. Its owner
decides whether the stack serves the book, and then either the service and
the link are added or the book stops naming them.

### S3. The root holds what it shouldn't

`plano.md` is the plan of the queues, and describes the four levels that
[The queues](queues.md) replaces. Once Q1 to Q6 are done the book's
`how/queue.md` says how they work. Delete it once its owner agrees. `Maestro.html`
(5.6 MB, untracked) and the worktree at `.claude/worktrees/docs-book` are
the owner's to remove: ask, don't delete.
