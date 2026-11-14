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
On Linux, a package installs it in `/usr/bin` with its shell completions:

```sh
sudo dnf install ./maestro-*.x86_64.rpm            # Fedora, RHEL, Rocky, Alma
sudo zypper install --allow-unsigned-rpm ./maestro-*.x86_64.rpm   # openSUSE
sudo apt install ./maestro_*_amd64.deb             # Ubuntu, Debian, Mint, Pop!_OS
sudo apk add --allow-untrusted ./maestro_*_x86_64.apk             # Alpine
sudo pacman -U ./maestro-*-x86_64.pkg.tar.zst      # Arch, Manjaro, EndeavourOS
```

On ARM machines, take the aarch64 or arm64 one. Elsewhere, or without root,
the `.tar.gz` holds the same binary, which needs nothing else.

`maestro login` prints a short code and a link to the view; approving the
code there hands the CLI its own Maestro key. The link is not opened for
you, so it can be followed in any browser, on that machine or another.

The CLI has no server of its own: the first time a command needs one and
nothing names it, `maestro` asks for the server's URL (`https://` is assumed
when it says no scheme) and keeps it, before doing anything else. Without a
terminal to ask at, as in a script, it says how to name one instead.
`maestro login --server https://maestro.example.org` signs in to another
Maestro, which every command then talks to; `--server` on any command talks
to one just that once, and `MAESTRO_ORQ_URL` does the same from the
environment (the flag first, then the variable, then the server kept). The
CLI keeps the server with the key and never sends the key to another: a
command pointed at a server the key wasn't minted by is told to sign in
there. A key stored by a CLI from before, with no server kept beside it,
asks for the server once and then goes to it. `maestro logout` forgets the
server too. `maestro` alone says who is signed in, where, and to which
forges.

`maestro --help` lists the commands by what they are for, and
`maestro help concepts` says what builds, runs, lines and containers are,
and how a line waits. A build has a number shown as `#12`, a run one of its
own shown as `run 31`: `maestro run 12` runs build #12, and
`maestro builds run 12` is the same.

What there is several of has a command in the plural, which lists when given
nothing else: `maestro builds`, `runs`, `machines`, `repos` and `forges` are
their `list`. Each list takes `--json`, which prints what the table shows, as
orq names it, for scripts. Removing is `rm` everywhere (`builds rm`,
`runs rm`, `forges rm`), which asks first; without a terminal to ask at, as
in a script, it takes `--yes`. The names from before still work: `image`,
`machine`, `repo`, `forge`, and `remove` for `rm`.

For scripts, `maestro build` and `maestro run` take `--json`, which prints
what they made, or `-q`, which prints only its number; either keeps stdout
for that, and what they say along the way goes to stderr:

```sh
run=$(maestro run 12 -q) && maestro runs show "$run" --watch
```

`maestro` exits 0 when all went well; 1 when something failed, a run watched
to its end with `--watch` that failed or was cancelled included; 2 when a
command was asked wrongly, which it says before asking the server anything,
signed in or not; and 130 when ctrl-c stopped it first. `--no-color` (or
`NO_COLOR=1`) prints without colours.

`maestro repos` is a full-screen list on a terminal; piped somewhere, or with
`--json`, it prints every forge's repositories once.

## Git forges

Forges are separate from signing in: they never log anyone in. A forge is
only its API plus a token, which the CLI stores (`maestro forges add`) and
passes to orq per build so it can clone. Maestro only reads with it.
Supported kinds:

- `github` — github.com, with a classic token with the `repo` scope. A
  fine-grained token only reaches the repos of the one owner it is made for,
  so never another user's private repo you are a collaborator on.
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

Administrators add machines on the Maestro page, under Admin › Machines:
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

### Machines behind a proxy (Cloudflare Access)

A machine that can't be reached over plain TCP, such as one behind
Cloudflare Access, is reached through a proxy command, as with ssh's
`ProxyCommand`. orq runs the command and speaks SSH over its standard input
and output itself, so the host key is still pinned and everything else works
as for any machine. In the machine's form, set the proxy command to

```
cloudflared access ssh --hostname %h
```

with the host set to the Access hostname (e.g. `q1-ssh.example.com`).
`%h`, `%p` and `%r` become the host, port and user, and `%%` a `%`.
cloudflared is in orq's image. Under *Proxy environment*, paste the Access
service token as

```
TUNNEL_SERVICE_TOKEN_ID=…
TUNNEL_SERVICE_TOKEN_SECRET=…
```

(a file of `export NAME=value` lines, such as one you source for ssh, can be
pasted as it is). Like the private key, it is stored encrypted with
`MACHINE_SECRET` and never sent back: the page shows only the names, and an
edit that leaves it empty keeps what is stored. The command gets only
`PATH`, `HOME` and these variables, none of orq's own environment.

A proxy command runs a program inside orq's container, so it lets any
administrator run commands on the server. orq refuses them unless
`MACHINE_PROXY_COMMANDS=true`, and a machine saved with one shows as
unreachable, saying why, while it is off.

orq doesn't keep connections open: each one, from the runner, a check or
`maestro top` (one every couple of seconds while someone watches it), starts
its own cloudflared, which adds half a second to a second to it. If
cloudflared fails, what it printed is in the machine's error.

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
| `MACHINE_PROXY_COMMANDS` | `false` | Allows machines reached through a proxy command, which runs on the orq server |
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
dockerfile = "docker/Dockerfile"             # what the image is built from
outputs_layout = "per-line"                  # or "shared": see below
```

`outputs_layout` is where the outputs are kept. With `per-line`, the
default, each line's go in a directory of its own, `<run>/<line>/<path>`.
With `shared`, every line's go in one tree of the run's, `<run>/shared/<path>`,
as a program that has its lines fill in one results tree expects:
`results/<month>/<day>/...` from all of them, downloaded as one. Two lines
writing the same path overwrite each other, the one kept last winning, so
each line should write paths of its own. Logs stay per line either way, and
`maestro runs get` and the run's download give the shared tree once, under
`shared/`.

`dockerfile` is the file the image is built from, a path from the root of
the repo, which stays the build's context: its `COPY` lines name files from
the root, not from beside it. Without it orq builds the `Containerfile` at
the root, or else the `Dockerfile`. It must be a file inside the repo; a
symbolic link out of it isn't followed, and a missing one fails the build.

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
On a machine whose Podman can't limit CPU, a rootless one whose user
systemd doesn't hand the `cpu` cgroup controller (Ubuntu 22.04's default),
lines still count their `cpus` there, but nothing holds them to it: one
that takes more slows the others down. To have the limit, an administrator
of the machine gives users the controller once:

```sh
sudo mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' |
  sudo tee /etc/systemd/system/user@.service.d/delegate.conf
sudo systemctl daemon-reload
```

and the Podman user signs out of every session (or the machine restarts),
so that its systemd starts again with it. `podman info` then lists `cpu`
under `cgroupControllers`.

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
line keeps only its own, or, with `outputs_layout = "shared"`, writes them
into the run's shared tree.

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

#### Trying a change without pushing it

`maestro build` and `maestro run` can send `maestro.toml`, its generator and,
to `build` only, the Dockerfile from where the CLI runs, in place of the
repo's; each may have any name there:

```sh
maestro build my-app -c bench.toml -g genvrs.py -f Dockerfile  # a new image
maestro run 81 -c small.toml --watch                           # build 81's image, other lines
```

`-c` stands for `maestro.toml` at the root; `-g` for the generator it
names, or, when it names none, adds one at the root under its own name; `-f`
for the Dockerfile it names, or else `Dockerfile` at the root, built from
even with a `Containerfile` there. A build puts them over its clone before it
reads anything, so the image is built with them too. A run doesn't build: orq
clones the repo again at the commit its build was made from (with the forge
token the CLI has for it, when it's private), puts the files over it, runs
the generator there, and runs the build's image on the lines that come of
it, in seconds and without copying an image to the machines. So a run takes
no Dockerfile, and the `dockerfile` of a `maestro.toml` sent to it is of no
matter. Either fails as a build would when what was sent is invalid.

The lines of such a build or run aren't its commit's alone, so `maestro
builds list` and `maestro runs show` say which files were sent. A file is at
most 1 MiB.

orq reads `maestro.toml` when it builds the repo (an invalid one fails the
build) and keeps it with the build. `maestro run <build>` then queues one container per
line, spread over the machines: each line runs once, on whichever allowed
machine has room for it first. A line waits at three levels before it
starts: `queued`, among its user's lines; `staged`, chosen from them and
waiting for a machine; and `assigned`, given to a machine and waiting for
room on it, while orq copies its image there. Users are in groups, all in
one open to everyone until an administrator makes others: each group's
lines are staged apart, only a few at a time (twice the machines, for each
group), and groups take turns at the machines. Only three lines wait on
each machine, so which user's line goes next is decided as late as it can
be.

A machine orq can't reach, over SSH or to its Podman socket, gets no
lines until it can: those waiting or about to start there go back to
`staged`, for another machine, rather than ending in an error, and orq
tries it again every 30 seconds. Lines already running there are left
alone, and looked at again once it is back.

An administrator sets on the Maestro page, under Admin › Settings, the four
policies: which of a user's lines is next, whose line is staged among a
group's users, which of a group's staged lines goes to a machine in the
group's turn, and which line waiting on a machine starts. Until then each
takes them in the order they were queued, oldest run first, and on a
machine a line that doesn't fit yet holds back those after it. The first
three are FIFO, LCFS, SIRO (random, repeatable with a seed) or PQ, the
highest score ω1·cores + ω2·memory + ω3·waiting + ω4·share. A user's share
of the machines is what their lines hold now (DRF, optionally weighted per
user) or what they used, each hour counting half as much a half-life later
(fair-share); with ω4 below 0, whoever has less goes first. A staged line
goes to a machine drawn among those it may use that have room in their
queue; nothing is kept for it there. Only the machine's own policy fits
lines in what it has free, so it may also be FIFO-skip (the oldest that
fits), best-fit, weighted best-fit (with how long a line has waited) or
Tetris (the line whose needs are most like the free cores and memory).
Admin › Groups has the groups: making, renaming and removing them, and
moving users between them (Add member, or ✕ to send someone back to the
default group). Each line records the settings it was staged under,
and its user's group.

`maestro queue` shows how many lines wait at each level, yours and
everyone's, your group and how many of its lines are staged, and your
share; `maestro usage` the core-hours and memory
GB-hours your lines used each day, counted as they end, and `maestro
settings` how the scheduler is set up. Administrators see every user. The
page has the first under Queue, read again every 5 seconds, and the core-hours
under Usage, where "Lines over a period" also downloads what `maestro
export` writes and measures it as `sim evaluate` does, against what the
machines have for lines now.

### Comparing policies

`maestro export --since 2026-11-01` (or `--since 7d`) writes, as CSV, what
happened to each of your lines over a period (administrators: `--all` for
everyone's; `-o` writes a file only once the export worked): when
it was submitted, staged, assigned, started and finished, where, under
which scheduler settings and in which group. `sim`, in maestro-orq, measures such a file, or
makes one by running orq's own scheduler over a workload on a simulated
clock, so that policies can be compared without the machines:

```sh
cd maestro-orq
go run ./cmd/sim generate -users 4 -groups 2 -hours 8 > workload.csv
go run ./cmd/sim run -machines Q1:32:65536:2:4096 -config drf.json < workload.csv > lines.csv
go run ./cmd/sim evaluate -cpus 30 -memory 61440 -lambda-j 1h -lambda-o 1h < lines.csv
```

A workload's `group` column puts each user in a group (1 without it), and a
machine written with `@speed`, as `Q2:8:16384@1.5`, runs lines that much
faster: a line's duration depends on the machine.

A config is the scheduler's settings as JSON, as `GET /api/settings` shows
them under `scheduler` (for instance `{"select": "pq", "share_weight": -1}`
for DRF); without one, FIFO everywhere. `evaluate` reports the mean wait
(and how much of it at each level), the mean time in the system, the mean
bounded slowdown, the utilization of cores and memory, Jain's index of
users' slowdowns, and the objective Z = F + λ_J·Φ_J + λ_O·Φ_O: F is the
mean time from a run's submission to the end of its last line, Φ_J the
mean over time of the gap between the largest and the smallest dominant
share of the users with lines not finished, and Φ_O the mean over time of
the fraction of the machines idle while some line waits; `-lambda-j` and
`-lambda-o` say what a whole unit of each is worth. A simulated line starts as soon as it is chosen; a real
one first has its image copied and its container created. `maestro run <build> --watch` follows the run
until it is over, and `maestro build <repo> --run` queues it as soon as the
image is built; `maestro build <repo> --watch` does both, from a repo to its
results in one command. orq copies the image to a machine the first
time it needs it there, streaming `podman save` into `podman load` over SSH,
gzipped on the way, which takes an image's layers to about a third, and
leaves it there when the run is over, so the next run of that build starts
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
/maestro/data/<user>/<run>/shared/<file>     (with outputs_layout = "shared")
```

orq creates each container with Podman's file log driver (`k8s-file`),
whatever the machine's default: on a machine whose default is journald, the
user Podman runs as may not be allowed to read the journal, and the logs
came back empty.

stdout and stderr are kept apart, each in its own file, in the line's folder
with its outputs. An output named `stdout.log` or `stderr.log` isn't kept:
the log always is. `maestro runs logs <run> <line>`
prints the first to stdout and the second to stderr, so `2>/dev/null` or
`>/dev/null` leaves just one; the line may be left out of a run of one. Once
a line is over, all of stdout comes before all of stderr: how the two were
mixed as the container ran isn't kept. Runs from before this have both in
one `<line>.log` beside the line's folder, and are still read as they are.

`maestro runs logs <run> <line> -f` follows a line as `tail -f` does: one
still waiting is waited for, and what a running line prints comes as it is
printed, until the line ends. orq reads it from the machine with
`GET /runs/{id}/lines/{line}/logs?follow=true`, which streams until the
container exits; an orq from before follow answers what there is so far,
and the CLI says so.

`maestro runs list|show|logs|get|cancel|rm` are for following a run and
fetching what it kept. `maestro runs list` shows your newest 20 runs
(`--limit`, 0 for all), of a `--status` or a `--repo` if asked, created so
long ago. `maestro runs show` without a run shows your newest; `--failed`
shows only the lines that failed, errored or were cancelled.
`maestro runs list --watch` and
`maestro runs show <run> --watch` draw themselves again every 2 seconds
(`--interval`) in place, without taking over the terminal; `show --watch`
ends by itself when the run does, says on its status line how it ended, and
exits 1 if it failed; ctrl-c ends either. Piped somewhere, they print a new
copy only when something changed. `--json` prints once, so it can't be used
with `--watch`. `maestro runs list --all` gives an administrator everyone's
runs, with whose each is. `maestro runs get` takes `--line` for some lines
only, and downloads over a run already downloaded only with `--force`.

The Maestro page is the same files: it opens on My runs once signed in, as
`<run>/<line>/<file>`, and administrators have everyone's under All users.
Its sidebar leads to My runs, Queue and Usage, and for administrators to All
users and the Admin pages (Machines, Groups, Settings); on a narrow screen it
is a rail of icons. The page follows the system's light or dark theme until
the sidebar's toggle picks one, which the browser then keeps. My runs can be narrowed to active or finished runs, or
searched by run or repository. A run's lines show the cores and memory
each asked for, and can be sorted by line, args, those,
where they are or how many files they kept: click a column's heading, and
again to reverse it. Each click on Status puts the next status the lines
have at the top, from those that are over: cancelled, then error, failed,
and on round to queued. A line that ends `failed` ran and its program
exited with an error; one that ends `error` is orq's trouble, most often a
line that couldn't start on its machine, or one whose machine restarted
while it ran there and so lost its container, which the page says and draws
apart, in amber. Cancelling a run cancels the lines it stops; one that had
already ended keeps how it ended. A line's page opens on its files; its
Details button shows all it runs with, as its container got it: its cores and memory, its command, its environment (its
`env`, then orq's `MAESTRO_` variables), the files kept from it, its
container's name, the image and commit, and when it was queued, staged,
assigned, started and finished, with how long it waited and ran. A line's
files show as folders, not as a list of long paths: paths that share a
prefix go under a folder of it, a chain of folders that each hold only the
next shows as one (`results/7/1/0.01_0.01`), and a folder folds with a
click. A run whose outputs are shared also has its tree on its own page,
every line's files merged, each saying which line wrote it. A file, or
either of a line's logs, opens in
a pane beside the line's files (a running line's logs are read again every 5
seconds), or in a tab of its own, and can be downloaded; a line or a
whole run downloads as a zip, laid out as `maestro runs get` leaves it. Only
png, jpeg, gif and webp images, PDFs and text are shown; the rest can only
be downloaded. Text is highlighted by its extension (Python, JSON, TOML,
YAML, shell, C/C++, Go, Rust, Julia, R, SQL, Markdown, HTML/XML and more),
and some of it is drawn, with its source a click away: a CSV as a table, an
SVG as an image (which runs none of its scripts), and an HTML page, such as
a chart, in a sandbox. The sandbox runs the page's scripts, so that its
charts draw, in an origin of its own: it can't read your session, call orq as
you or move the Maestro page. Any preview goes full screen, and a drawn one
opens in a tab of its own drawn the same way, sandbox included.

orq keeps everything about runs in its database, so it can restart mid-run:
lines it was about to start are started again, containers it started are
picked up where they are, and those that finished
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
