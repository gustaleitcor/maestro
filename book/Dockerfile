# syntax=docker/dockerfile:1
#
# Builds the Maestro book into /out, then exits: the reverse proxy serves
# book/dist at /docs/ (bind-mount it on the host). Its context is the root of
# the maestro repo, so that it sees the CLI, the template and CONVENTIONS.md;
# the root's .dockerignore keeps the rest out.

# The CLI writes the reference of every command, and the topics `maestro
# docs` opens, so that both are the CLI's own.
FROM docker.io/library/golang:1.27-bookworm AS cli
WORKDIR /src
COPY maestro-cli/go.mod maestro-cli/go.sum ./
RUN go mod download
COPY maestro-cli/ ./
RUN go run . gen-docs /cli.md && go run . docs --topics > /topics.tsv

# mdbook-mermaid has no ARM build, and the book is files: amd64 serves anywhere.
FROM --platform=linux/amd64 docker.io/library/debian:bookworm-slim
ARG MDBOOK=0.4.40
ARG MDBOOK_SHA256=9ef07fd288ba58ff3b99d1c94e6d414d431c9a61fdb20348e5beb74b823d546b
ARG MERMAID=0.14.0
ARG MERMAID_SHA256=37364965fb190cf9929d93c930c6b6c69b2fed05f7658ea2d312882ed59c645e
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /tmp/mdbook.tgz "https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK}/mdbook-v${MDBOOK}-x86_64-unknown-linux-gnu.tar.gz" \
 && echo "${MDBOOK_SHA256}  /tmp/mdbook.tgz" | sha256sum -c - \
 && curl -fsSL -o /tmp/mermaid.tgz "https://github.com/badboy/mdbook-mermaid/releases/download/v${MERMAID}/mdbook-mermaid-v${MERMAID}-x86_64-unknown-linux-gnu.tar.gz" \
 && echo "${MERMAID_SHA256}  /tmp/mermaid.tgz" | sha256sum -c - \
 && tar -xzf /tmp/mdbook.tgz -C /usr/local/bin \
 && tar -xzf /tmp/mermaid.tgz -C /usr/local/bin \
 && rm /tmp/*.tgz

WORKDIR /maestro
COPY CONVENTIONS.md ./
COPY maestro-template/ maestro-template/
COPY book/ book/
COPY --from=cli /cli.md book/src/reference/cli.md
COPY --from=cli /topics.tsv /topics.tsv

# Built here, so that a broken book fails the image rather than the deploy;
# then every page a topic opens must be there.
RUN mdbook-mermaid install book \
 && mdbook build book \
 && missing=0 \
 && while IFS="$(printf '\t')" read -r topic page; do \
      page="${page%%#*}"; \
      [ -f "book/dist/${page:-index.html}" ] || { echo "maestro docs $topic opens $page, which the book hasn't"; missing=1; }; \
    done < /topics.tsv \
 && [ "$missing" = 0 ]

# Replaces what /out held with the book.
CMD ["sh", "-c", "find /out -mindepth 1 -delete && cp -a book/dist/. /out/"]
