# Fixes

Where the code doesn't hold yet to [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one. Each item is one change, done and committed on
its own, in the order given within its group. An item is
removed from this list in the commit that finishes it. If an item can't be
done as written, stop and say why instead of doing something near it.

## Structure

### S3. The root holds what it shouldn't

The worktree at `.claude/worktrees/docs-book` (branch
`worktree-docs-book`) holds two commits that `main` doesn't: the book's
first home in root, with a `docs` service in compose. The book has since
moved to `maestro-cli`, and the stack no longer serves it, so they are
likely not wanted. Its owner removes it.
