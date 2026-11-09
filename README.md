# maestro

Deployment glue for the Maestro ecosystem: `maestro-cli`, `maestro-orq`, and
`maestro-view` each live in their own repo (as git submodules here) and are
developed/versioned independently. This repo only holds what ties them
together at runtime.

## Layout

- `maestro-cli/` — Cobra CLI (submodule)
- `maestro-orq/` — Gin + SQLite backend (submodule)
- `maestro-view/` — Vue frontend (submodule)
- `maestro-template/` — a repo for users to fork: Dockerfile, `maestro.toml`
  and a stand-in program (submodule)
- `docker-compose.yml` — production stack
- `docker-compose-dev.yml` — local dev stack, with its own throwaway identity
  provider (Dex, configured by `dev/dex.yaml`)
- `.env.example` — the identity provider settings the production stack reads
- `CONVENTIONS.md` — where code goes in each repo; read it before adding a file

`orq` stays up as a server. `view` just builds `maestro-view` into
`maestro-view/dist` and exits — Caddy is expected to serve that directory
directly, not proxy to a container.

## Getting started

```sh
git clone --recurse-submodules <this-repo>
# or, if already cloned:
git submodule update --init

podman compose -f docker-compose-dev.yml up --build
```

Then open the view (`cd maestro-view && npm run dev`, with
`VIEW_URL=http://localhost:5173` exported before starting the stack, or serve
`maestro-view/dist` on port 8080) and sign in with the dev user:

- login: `dev@example.com`
- password: `password`

`dex` and `orq` use host networking in dev so that `localhost:5556` is the
same Dex for your browser and for orq.

## Signing in: one identity provider

Maestro trusts exactly one identity provider per deployment, over standard
[OpenID Connect](https://openid.net/developers/how-connect-works/). orq sends
the browser to the provider, checks the ID token it gets back, and then keeps
its own session (`maestro_session` cookie). Nothing in Maestro is specific to
any one provider.

Register Maestro with your provider as a confidential client using the
authorization code flow, with redirect URI `<orq>/api/auth/callback`, then
configure orq:

| Variable | Default | |
| --- | --- | --- |
| `OIDC_ISSUER` | required | Issuer URL; must serve `/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` | required | |
| `OIDC_CLIENT_SECRET` | required | |
| `OIDC_REDIRECT_URL` | required | `<orq>/api/auth/callback`, as registered with the provider |
| `OIDC_SCOPES` | `openid email profile` | Space-separated |
| `OIDC_ROLES_CLAIM` | `roles` | ID token claim holding the user's roles (a string or a list); e.g. `groups` |
| `OIDC_ALLOWED_ROLES` | empty | Comma-separated. Empty lets in anyone the provider authenticates |
| `VIEW_URL` | first of `ALLOWED_ORIGINS` | Where maestro-view is served; logins return there |
| `REDIS_URL` | required | `redis://[:password@]host:port/db` of a Redis, Valkey or KeyDB, where sessions are kept |
| `SESSION_TTL` | `12h` | How long a Maestro session lasts |
| `COOKIE_SECURE` | `true` (`false` with `MODE=dev`) | Set `false` only when serving over plain http |

The view only needs `VITE_ORQ_URL`, plus optionally `VITE_IDP_NAME` for the
sign-in button label.

Providers:

- **SaciAuthService** (auth.logsad.com) — what logsad.com runs; tested end to end.
- **Dex** — what the dev stack runs.
- **Keycloak, Authentik, Zitadel, …** — any provider with OIDC discovery,
  the authorization code flow, PKCE (S256) and RS256/ES256-signed ID tokens
  should work, but these have not been tried yet. Point `OIDC_ROLES_CLAIM`
  at whichever claim your provider puts roles or groups in.

Signing out of Maestro ends the Maestro session only; it does not sign you
out of the provider, and signing out of the provider does not end a Maestro
session that is already open.

### The CLI

Install `maestro` from the
[maestro-cli releases](https://github.com/gustaleitcor/maestro-cli/releases).

`maestro login` prints a short code and a link to the view; approving the
code there hands the CLI its own Maestro key. The link is not opened for
you, so it can be followed in any browser, on that machine or another.

What there is several of has a command in the plural, which lists when given
nothing else: `maestro builds`, `runs`, `machines`, `repos` and `forges` are
their `list`. Each list takes `--json`, which prints what the table shows, as
orq names it, for scripts. Removing is `rm` everywhere (`builds rm`,
`runs rm`, `forges rm`). The names from before still work: `image`,
`machine`, `repo`, `forge`, and `remove` for `rm`.

`maestro repos` is a full-screen list on a terminal; piped somewhere, or with
`--json`, it prints every forge's repositories once.

## Git forges

Forges are separate from signing in: they never log anyone in. A forge is
only its API plus a read-only token, which the CLI stores (`maestro forges
add`) and passes to orq per build so it can clone. Supported kinds:

- `github` — github.com
- `forgejo` — Codeberg by default, or any Forgejo or Gitea instance with `--url`
- `gitlab` — gitlab.com, including nested groups

orq only clones from hosts listed in `ALLOWED_FORGE_HOSTS` (default
`github.com,codeberg.org,gitlab.com`), so it can't be pointed at hosts on its
own network. Add your self-hosted forge's host there.

## Machines

A machine is a host whose Podman runs users' containers. orq reaches it over
SSH and talks to the Podman socket through that connection, so the machine
needs nothing but sshd and Podman's API socket
(`systemctl --user enable --now podman.socket` for the SSH user).

Administrators add machines on the Maestro page, under "Admin panel":
host, SSH port and user, the socket path (e.g.
`/run/user/1000/podman/podman.sock`), and a private key without a
passphrase, and how many cores and how much memory to keep back for the
machine's own system. Saving connects and asks Podman for its version, cores
and memory, so only a working machine is saved, and a reserve that leaves
nothing for lines is refused. orq asks again whenever it checks the machine,
so a machine that grows or shrinks is seen. Leave the host key empty to pin the one the
machine presents then, and compare the fingerprint shown with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the machine; or paste
the line from `ssh-keyscan -t ed25519 <host>`. Private keys are stored
encrypted with `MACHINE_SECRET` and never sent back.

Users see the machines, and whether orq can reach them, with
`maestro machines list`. Checking opens an SSH connection, so orq answers
with what it last saw and never makes a list wait for a machine: an answer
older than 30 seconds (10 for a machine it couldn't reach) is still given,
and the machine is looked at again behind it, so the next list has the news.
Only a machine nobody asked about for 10 minutes is waited for, and editing
a machine checks it again at once.

### Watching the machines

`maestro top` shows how loaded every machine is, like `top` or `btop`, one
machine to a row: CPU, memory, GPUs, load, and under `CORES` how much of it
Maestro is using. `6/14 +3` is lines taking six of the fourteen cores the
machine has for them (what it has less what is kept back), and three lines
waiting; the machine's own page says the same of memory. With enter on a machine: each core, swap, disks,
network, GPU memory, temperatures and the containers running on it, with
whose each is and the repo it was built from. `maestro top Q1` opens a
machine straight away, and `maestro machines stats` prints the table once
(`--json` for scripts).

orq reads a machine by running one small shell script over the SSH connection
it already has (`/proc`, `df`, and `nvidia-smi` when there is one), and asks
Podman for the containers' usage. So the SSH user must be allowed to run
commands; if it can only reach the Podman socket, the machine still shows,
with its containers, and says why it has nothing else. Only NVIDIA GPUs are
read, and only on Linux.

Everyone signed in sees the machines and the containers of their own runs.
Administrators see every container, and the server orq runs on, as `orq`.
Readings are kept in Redis for 2 seconds and shared, so any number of open
windows costs each machine one SSH connection every couple of seconds. What
lines take and the queue come from orq's own records, and are never that old.

| Variable | Default | |
| --- | --- | --- |
| `MACHINE_SECRET` | empty | Encrypts the stored SSH keys; at least 32 characters. Empty disables machines |
| `OIDC_ADMIN_ROLES` | `ADMIN` | Comma-separated roles (from `OIDC_ROLES_CLAIM`) that make a user an administrator |
| `ADMIN_EMAILS` | empty | Comma-separated emails that are administrators regardless of roles |

## Running images

A repo can say how its image is run with a `maestro.toml` next to its
Dockerfile. [`maestro-template`](maestro-template) is a repo to fork with
both, and a stand-in program:

```toml
machines   = ["Q1", "Q2", "Q3"]              # leave out for any machine
parameters = ["-t 10 out.txt", "-t 20 out.txt"] # one container per line
outputs    = ["out.txt"]                     # copied out when each finishes
cpus       = 2                               # cores per container; default 1
memory     = 2048                            # MB per container; default 512
env        = { SEED = "42" }                 # variables of each container's environment
```

There is always a limit: `cpus` is a whole number of cores, at least 1, and
`memory` at least 6 MB. They also decide where and when a line runs: a
machine starts a line only while its cores and memory fit in what the
machine has, less what is kept back and what the lines already there take.
A run with a line larger than every machine it may use, even empty, is
refused, so asking for less lets a line start sooner.

orq sets these variables in every container, after those of `env`, whose
names may not start with `MAESTRO_`:

| Variable | |
| --- | --- |
| `MAESTRO_RUN`, `MAESTRO_LINE` | The run's number, and the line's in it, from 1 |
| `MAESTRO_CPUS` | Its `cpus` |
| `MAESTRO_MEMORY` | Its `memory`, in MB |
| `MAESTRO_OUTPUTS` | Its `outputs`, one per line |

A limit on CPUs doesn't change how many cores a program sees, so a solver
should size itself by `MAESTRO_CPUS`: `threads = int(os.environ["MAESTRO_CPUS"])`.
The environment is kept with the run and shown by `podman inspect` on the
machine, so `env` is no place for secrets.

The lines can also be computed. `generator` names a Python script in the
repo that defines a generator called `genvrs`; every string it yields is one
more line, split as a line of `parameters` is, after those of `parameters`
when there are both:

```toml
generator = "genvrs.py"
```

```python
import itertools
from collections.abc import Generator

def genvrs() -> Generator[str]:
    for t, seed in itertools.product([10, 20, 30], range(3)):
        yield f"-t {t} --seed {seed} out.txt"
```

Above `genvrs`, the script may define a class `Config` with the keys that
can differ from one line to the next: `outputs`, `cpus`, `memory` and `env`.
A key the class leaves out or sets to `None` has what `maestro.toml` says, or
its default (`[]`, `1`, `512`, `{}`); any other value overrides it. `genvrs`
changes them on the class, `None` going back to `maestro.toml`'s, and each
line runs with what the class holds when it is yielded, checked as
`maestro.toml` is:

```python
class Config:
    outputs: list[str] | None = None     # default: none
    cpus: int | None = 4                 # instead of maestro.toml's; default: 1
    memory: int | None = None            # MB; default: 512
    env: dict[str, str] | None = None    # default: none

def genvrs() -> Generator[str]:
    yield "-t 10 small"          # 4 CPUs, maestro.toml's memory
    Config.memory = 4096
    for seed in range(3):
        Config.env = {"SEED": str(seed)}
        yield "-t 10 large"      # 4 CPUs, 4096 MB, SEED 0, 1 and 2
    Config.memory = None
    yield "-t 10 medium"         # 4 CPUs, maestro.toml's memory again
```

`machines` is set in `maestro.toml` only, the same for every line. Any other
name in `Config`, `machines` included, fails the build, so that a misspelt
key isn't ignored. A run lists the outputs of all its lines together; each
line keeps only its own.

orq runs the script once, when it builds the repo, and the build keeps the
lines it gave: every run of that build is the same lines. It is run inside
orq, not in the image, by a CPython 3.14 compiled to WebAssembly: it has
Python's standard library and the repo, which it can read and not write. It
starts at the root of the repo and imports from beside itself, so it can
`import` the repo's other modules and open its files (`open("cases.csv")`).
Nothing else is there: no packages installed from `requirements.txt` and
nothing that needs compiling, such as numpy; nothing a symbolic link leads
to outside the repo; no other file of the server, no network, no
environment, 256 MB of memory and 30 seconds. What it prints goes to the
build log. A script that raises, yields something that isn't a string,
yields nothing, makes the build's lines more than 1000, or gives a line an
invalid `Config`, fails the build, and the log says why.

What orq clones is the repo's files without `.git`, for the generator and
for the image alike: git keeps the forge token there, and it would end up in
the image. So a Dockerfile can't ask git for the commit it is built from.

orq reads `maestro.toml` when it builds the repo (an invalid one fails the
build) and keeps it with the build. `maestro run <build>` then queues one container per
line, spread over the machines: each line runs once, on whichever allowed
machine has room for it first. Lines start in the order they were queued,
oldest run first, and a line that doesn't fit yet holds back those after it. `maestro run <build> --watch` follows the run
until it is over, and `maestro build <repo> --run` queues it as soon as the
image is built; `maestro build <repo> --watch` does both, from a repo to its
results in one command. orq copies the image to a machine the first
time it needs it there, streaming `podman save` into `podman load` over SSH,
and leaves it there when the run is over, so the next run of that build starts
without copying it again.

Each user keeps at most 10 built images (an administrator can change the
number on the Maestro page). A build that would make one more removes the
image they ran least recently, or built longest ago if they never ran it,
skipping any a run is still using; it is removed from the machines as well.
The build's record, runs and files are kept, and `maestro builds rm <build>`
frees a place by hand.
Without a `maestro.toml` a run takes the default, which is also what any key
left out of one falls back to: a single container with the image's own
`CMD`, on any machine, with 1 core and 512 MB, keeping only what it prints. The build log says which
one a build got.

When a container finishes, orq keeps what it printed and the outputs it
wrote, then removes it:

```
/maestro/data/<user>/<run>/<line>/stdout.log
/maestro/data/<user>/<run>/<line>/stderr.log
/maestro/data/<user>/<run>/<line>/<file>
```

stdout and stderr are kept apart, each in its own file, in the line's folder
with its outputs. An output named `stdout.log` or `stderr.log` isn't kept:
the log always is. `maestro runs logs <run> <line>`
prints the first to stdout and the second to stderr, so `2>/dev/null` or
`>/dev/null` leaves just one. All of stdout comes before all of stderr: how
the two were mixed as the container ran isn't kept. Runs from before this
have both in one `<line>.log` beside the line's folder, and are still read
as they are.

`maestro runs list|show|logs|get|cancel|rm` are for following a run and
fetching what it kept. `maestro runs show` without a run shows your newest.
`maestro runs list --watch` and
`maestro runs show <run> --watch` draw themselves again every 2 seconds
(`--interval`) in place, without taking over the terminal; `show --watch`
ends by itself when the run does, and ctrl-c ends either. Piped somewhere,
they print a new copy only when something changed. `--json` prints once, so
it can't be used with `--watch`. `maestro runs list --all` gives an
administrator everyone's runs, with whose each is.

The Maestro page is the same files: it opens on them once signed in, as
`<run>/<line>/<file>`, with everyone's for administrators. A file, or either
of a line's logs, can be seen in the page or in a tab of its own, and downloaded; a line or a
whole run downloads as a zip, laid out as `maestro runs get` leaves it. Only
png, jpeg, gif and webp images, PDFs and text are shown. Whatever else is
text, an html page or an svg a container wrote included, is shown as its
source and never run; the rest can only be downloaded.

orq keeps everything about runs in its database, so it can restart mid-run:
containers it started are picked up where they are, and those that finished
while it was off are collected as if it had been there. A build it was making
when it stopped fails, so it doesn't count against the image limit, and an
image left of it is removed.

Everything orq makes is labelled with a name it gives itself the first time
it starts (`maestro.orq`): its images, which also carry their build
(`maestro.build`), and its containers, which also carry their run and line.
When orq starts, every 10 minutes, and whenever an image goes, it sweeps each
machine. A container of its own that no line has there, such as one that was
left running when a machine was removed and added back, is removed, and so is
an image of its own that orq itself no longer has and no line needs there,
tagged or not. Nothing else on a machine is touched: neither the machine's
own images and containers nor those of another orq that uses it too. What an
orq made before it labelled things carries no name, and every orq takes it
for its own, as it did before.

| Variable | Default | |
| --- | --- | --- |
| `DATA_DIR` | `/maestro/data` | Where runs' logs and outputs are kept |
| `RUN_OUTPUT_MAX_MB` | `1024` | Logs and outputs kept per line; the rest is dropped, with a note |
| `RUN_PIDS` | `512` | Process limit per container; `0` for none |

## What orq remembers, and for how long

Lists are asked for often, by tab completion above all, so orq answers the
slow ones from Redis. Nothing here is the record of anything: with Redis
emptied, the next answer is just read again.

| What | Remembered for | Forgotten sooner when |
| --- | --- | --- |
| A user's images (`maestro builds list`, completing `maestro run`) | 60s | a build of theirs ends, or one of their images is removed |
| Runs (`maestro runs list`, completing a run, the page) | 2s | their owner, or an administrator, starts, cancels or deletes one |
| A machine's status | 10 min, looked at again behind an answer older than 30s (10s if unreachable) | the machine is edited |
| A machine's load (`maestro top`) | 2s | |

So what you do yourself shows at once, and what the runner does to a run (a
line starting or ending) within 2 seconds. An image removed from Podman by
hand, behind orq's back, can stay listed for up to a minute. Builds are one
quick query and aren't remembered at all. The CLI keeps nothing itself: a
completion still costs one request to orq.

## Production

```sh
cp .env.example .env   # fill in OIDC_CLIENT_SECRET and MACHINE_SECRET
podman compose up --build -d
```

The reverse proxy must send `/api/*` on the view's host to orq (port 3005),
so that `OIDC_REDIRECT_URL` reaches it and the session cookie is first-party.
