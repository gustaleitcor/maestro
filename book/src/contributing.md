# Contributing

Maestro's parts each live in their own repo, as git submodules of
[maestro](https://github.com/gustaleitcor/maestro), and are developed and
versioned on their own:

| Repo | |
| --- | --- |
| `maestro-orq` | the server: Go, Gin, SQLite |
| `maestro-cli` | `maestro`: Go, cobra, Bubble Tea |
| `maestro-view` | the Maestro page: Vue |
| `maestro-template` | a repo for users to fork |
| `maestro` | what ties them together: compose files, this book |

[Deploying Maestro](admin/deploy.md#a-development-stack) has the
development stack.

## This book

The book is in `book/`, written with [mdBook](https://rust-lang.github.io/mdBook/).
`book/Dockerfile` builds it as the deployment does: it writes [Every
command](reference/cli.md) from the CLI itself (`maestro gen-docs`), checks
that every topic `maestro docs` knows is a page, and runs `mdbook build`.

To edit it with a live preview:

```sh
go -C maestro-cli run . gen-docs ../book/src/reference/cli.md
mdbook-mermaid install book     # once: the diagrams' scripts
mdbook serve book               # http://localhost:3000
```

A page moved or renamed must move in `maestro-cli/cmd/docs.go` too, where
the topics of `maestro docs` say which page each opens; the book's build
fails while one points nowhere.

## Where code goes

What follows is `CONVENTIONS.md`, from the root of the maestro repo.

---

{{#include ../../CONVENTIONS.md}}
