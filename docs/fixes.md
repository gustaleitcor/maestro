# Fixes

Where the code doesn't hold yet to [CONVENTIONS.md](../CONVENTIONS.md) and
the files beside this one. Each item is one change, done and committed on
its own, in the order given within its group. An item is
removed from this list in the commit that finishes it. If an item can't be
done as written, stop and say why instead of doing something near it.

## Structure

### S4. `maestro docs --web` opens what nothing serves

The book no longer names a docs service, since the stack doesn't serve the
book. `maestro docs --web` still opens the server's `/docs`
(`docsBase` in `cmd/docs.go`), and its help, its example and the hint shown
without a browser still promise the copy the server serves. Its owner
decides whether `--web` goes, with `MAESTRO_DOCS_URL` left for a copy
somewhere else, or serves the book the CLI carries where another computer
can reach it. Then the help, the example and the hint say what it does.

### S3. The root holds what it shouldn't

The worktree at `.claude/worktrees/docs-book` (branch
`worktree-docs-book`) holds two commits that `main` doesn't: the book's
first home in root, with a `docs` service in compose. The book has since
moved to `maestro-cli`, and S4 drops the `docs` service, so they are likely
not wanted. Its owner removes it.
