# Limits and secrets

Lab users are trusted with their own work, and nothing more. These hold for
every part:

- Whatever signs someone in ends, and can be ended. A session expires
  (`SESSION_TTL`). A Maestro key expires (`KEY_TTL`), its owner can revoke
  it, `maestro logout` revokes the one it holds, and an administrator can
  revoke every key of a user.
- Who someone is, is read on every request. Whether a caller is an
  administrator comes from their row in `users`, never from something kept in
  the session or the key. That row is as fresh as their last sign-in on the
  page, so a key can outlive a removal from the identity provider by at most
  `KEY_TTL`. The book says so (`admin/identity.md`).
- Whatever runs someone else's code has limits on time, memory, CPU and
  processes. A line's container has all four. A build has a time limit
  (`BUILD_TIMEOUT`), and a user builds a few at once (`BUILDS_AT_ONCE`).
  Rootless Podman ignores memory and CPU limits on a build, so a build has
  none. A
  generator runs inside orq as WebAssembly with no access to the host.
- Whatever keeps someone's data has a limit on how much. A line keeps at
  most `RUN_OUTPUT_MAX_MB`, a user keeps at most `images_per_user` images,
  and a user's runs keep at most `USER_DATA_MAX_GB` in all.
- A secret is kept sealed or hashed, and is sent only where it is needed.
  Keys and sessions are stored as hashes. Machines' SSH keys are sealed with
  `MACHINE_SECRET`. A forge token is kept by the CLI, sent for one clone, and
  never reaches an image (`.git` is stripped).
- orq is reached through the reverse proxy and nothing else. The compose
  file publishes its port on the loopback address. Every route but signing
  in, the health check and verifying a key needs a session or a key, the
  swagger pages included.
- Redis has a password outside development. It holds the sessions, so
  whoever can write to it can sign in as anyone. Builds run on the same host
  and may reach it.
- A request that never finishes doesn't hold orq. The HTTP server has a
  timeout on reading headers and on idle connections. It has none on writing,
  because logs, builds and archives are streamed for as long as they take.

A new route, a new thing kept, or a new program run for a user is checked
against this list before it is done.
