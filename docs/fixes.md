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

The worktree at `.claude/worktrees/docs-book` (branch
`worktree-docs-book`) holds two commits that `main` doesn't: the book's
first home in root, with a `docs` service in compose. The book has since
moved to `maestro-cli`, and S4 drops the `docs` service, so they are likely
not wanted. Its owner removes it.
