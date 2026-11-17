#!/bin/sh
# Goes through Maestro end to end against a running development stack
# (`podman compose -f docker-compose-dev.yml up --build`): it signs in through
# Dex as the dev user, approves a `maestro login`, adds this computer as a
# machine, builds the public template, runs it, downloads the run with
# `maestro runs get` and checks the files it wrote. Then it removes what it
# made: the run, the build's image, the machine, the Maestro key and the
# session, and stops the sshd it started.
#
#   sh dev/e2e.sh
#
# It needs curl, python3, ssh-keygen, an sshd binary and go (or MAESTRO set to
# a maestro binary), and the Podman socket of the user running it. These
# change what it uses:
#
#   MAESTRO_ROOT  the maestro checkout whose maestro-cli it builds
#                 (default: the one this script is in)
#   MAESTRO       a maestro binary to use instead of building one
#   ORQ_URL       the server (default: http://localhost:8081)
#   DEX_URL       the identity provider (default: http://localhost:5556)
#   DEX_LOGIN     who signs in (default: dev@example.com, from dev/dex.yaml)
#   DEX_PASSWORD  their password (default: password)
#   SSHD          the sshd to start (default: sshd on PATH, or /usr/sbin/sshd)
#   SSH_PORT      the port it listens on (default: a free one)
#   PODMAN_SOCK   the Podman socket the machine offers
#                 (default: $XDG_RUNTIME_DIR/podman/podman.sock)
#   TEMPLATE      the repository to build
#                 (default: https://github.com/gustaleitcor/maestro-template)
#
# The machine is the sshd this script starts on 127.0.0.1, as the user who
# runs it, with a key pair made for it: orq runs with host networking in the
# development stack, so it reaches that port. Nothing in ~/.ssh is touched.

set -eu

MAESTRO_ROOT=${MAESTRO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
ORQ_URL=${ORQ_URL:-http://localhost:8081}
DEX_URL=${DEX_URL:-http://localhost:5556}
DEX_LOGIN=${DEX_LOGIN:-dev@example.com}
DEX_PASSWORD=${DEX_PASSWORD:-password}
PODMAN_SOCK=${PODMAN_SOCK:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock}
TEMPLATE=${TEMPLATE:-https://github.com/gustaleitcor/maestro-template}

step() { printf '\n== %s\n' "$*"; }
fail() { printf 'e2e: %s\n' "$*" >&2; exit 1; }

for tool in curl python3 ssh-keygen; do
	command -v "$tool" >/dev/null || fail "$tool is needed and isn't on PATH"
done
if [ -z "${SSHD:-}" ]; then
	SSHD=$(command -v sshd || echo /usr/sbin/sshd)
fi
[ -x "$SSHD" ] || fail "no sshd at $SSHD; set SSHD to one"
[ -S "$PODMAN_SOCK" ] || fail "no Podman socket at $PODMAN_SOCK; run \`systemctl --user enable --now podman.socket\` or set PODMAN_SOCK"
curl -sf "$ORQ_URL/api/healthz" >/dev/null ||
	fail "no Maestro server answers at $ORQ_URL; start the stack with \`podman compose -f docker-compose-dev.yml up --build\`"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/maestro-e2e.XXXXXX")
jar=$tmp/cookies
machine=e2e-$$
run= build= keyed= machined= sshd_pid= login_pid= failed=

# Everything made is undone here, whether the test passed or not.
cleanup() {
	status=$?
	set +e
	step "cleaning up"
	[ -n "$login_pid" ] && kill "$login_pid" 2>/dev/null
	if [ -n "$run" ]; then
		# A cancelled run is still running until its containers have
		# stopped, and removing the machine before that would leave them
		# there.
		m runs cancel "$run" >/dev/null 2>&1
		for _ in $(seq 60); do
			case $(m runs show "$run" --json 2>/dev/null | json 'j["status"]' 2>/dev/null) in
			queued | running) sleep 2 ;;
			*) break ;;
			esac
		done
		m runs rm -y "$run" || failed=1
	fi
	if [ -n "$build" ]; then
		m builds rm -y "$build" || failed=1
	fi
	if [ -n "$machined" ]; then
		code=$(curl -s -o /dev/null -w '%{http_code}' -b "$jar" -X DELETE "$ORQ_URL/api/admin/machines/$machine")
		case $code in
		2*) echo "Removed machine $machine." ;;
		*) echo "couldn't remove machine $machine (HTTP $code)" >&2; failed=1 ;;
		esac
	fi
	if [ -n "$keyed" ]; then
		m logout -y || failed=1
	fi
	[ -f "$jar" ] && curl -s -o /dev/null -b "$jar" -X POST "$ORQ_URL/api/auth/logout"
	[ -n "$sshd_pid" ] && kill "$sshd_pid" 2>/dev/null
	rm -rf "$tmp"
	if [ "$status" -eq 0 ] && [ -n "$failed" ]; then
		echo "e2e: the test passed but cleaning up failed; see above" >&2
		status=1
	fi
	[ "$status" -eq 0 ] && printf '\ne2e: passed\n'
	exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# m runs the CLI with a configuration of its own, so that the key it gets
# never mixes with yours.
m() {
	XDG_CONFIG_HOME=$tmp/config NO_COLOR=1 "$MAESTRO" --server "$ORQ_URL" "$@"
}

# json prints what a Python expression makes of the JSON on stdin, as j.
json() { python3 -c "import json,sys; j=json.load(sys.stdin); print($1)"; }

if [ -z "${MAESTRO:-}" ]; then
	step "building the CLI from $MAESTRO_ROOT/maestro-cli"
	command -v go >/dev/null || fail "go is needed to build the CLI; or set MAESTRO to a maestro binary"
	[ -f "$MAESTRO_ROOT/maestro-cli/go.mod" ] ||
		fail "no maestro-cli in $MAESTRO_ROOT; run \`git submodule update --init\` or set MAESTRO_ROOT"
	(cd "$MAESTRO_ROOT/maestro-cli" && go build -o "$tmp/maestro" .)
	MAESTRO=$tmp/maestro
fi

# Each request's answer either sends the browser on (a redirect) or is a page
# for it. follow goes on while the redirects stay on Dex and orq, and leaves
# the last page in $tmp/page and where it stopped in $url.
follow() {
	while :; do
		next=$(curl -s -b "$jar" -c "$jar" -o "$tmp/page" -w '%{redirect_url}' "$url")
		case $next in
		"$DEX_URL"/* | "$ORQ_URL"/*) url=$next ;;
		*) return ;;
		esac
	done
}

step "signing in through Dex as $DEX_LOGIN"
url=$ORQ_URL/api/auth/login
follow
action=$(sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' "$tmp/page" | head -n 1 | sed 's/&amp;/\&/g')
[ -n "$action" ] || fail "Dex didn't show a sign-in form at $url"
case $action in
/*) action=$DEX_URL$action ;;
esac
next=$(curl -s -b "$jar" -c "$jar" -o "$tmp/page" -w '%{redirect_url}' \
	--data-urlencode "login=$DEX_LOGIN" --data-urlencode "password=$DEX_PASSWORD" "$action")
[ -n "$next" ] || fail "Dex didn't take $DEX_LOGIN and its password"
url=$next
follow
me=$(curl -sf -b "$jar" "$ORQ_URL/api/me") || fail "signed in to Dex, but Maestro has no session for it"
email=$(echo "$me" | json 'j["email"]')
admin=$(echo "$me" | json 'j["is_admin"]')
echo "Signed in to the Maestro page as $email."
[ "$admin" = True ] || fail "$email isn't an administrator, so it can't add a machine; list it in ADMIN_EMAILS"

step "approving maestro login"
# login waits for the code to be approved, then asks about a forge: no.
echo n | m login --store-in-file >"$tmp/login.out" 2>&1 &
login_pid=$!
code=
for _ in $(seq 50); do
	code=$(sed -n 's/.*[?]cli=\([A-Z0-9-]*\).*/\1/p' "$tmp/login.out" | head -n 1)
	[ -n "$code" ] && break
	kill -0 "$login_pid" 2>/dev/null || break
	sleep 0.2
done
[ -n "$code" ] || { cat "$tmp/login.out" >&2; fail "maestro login printed no code"; }
curl -sf -o /dev/null -b "$jar" -H 'Content-Type: application/json' \
	-d "{\"user_code\":\"$code\"}" "$ORQ_URL/api/cli/login/approve" ||
	fail "couldn't approve code $code on the Maestro page"
keyed=1
wait "$login_pid" || { cat "$tmp/login.out" >&2; fail "maestro login failed after code $code was approved"; }
login_pid=
grep 'Signed in to' "$tmp/login.out"

step "adding this computer as machine $machine"
port=${SSH_PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')}
ssh-keygen -q -t ed25519 -N '' -f "$tmp/host_key"
ssh-keygen -q -t ed25519 -N '' -f "$tmp/orq_key"
cp "$tmp/orq_key.pub" "$tmp/authorized_keys"
cat >"$tmp/sshd_config" <<EOF
ListenAddress 127.0.0.1
Port $port
HostKey $tmp/host_key
PidFile none
AuthorizedKeysFile $tmp/authorized_keys
AllowUsers $(id -un)
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
EOF
# An sshd unpacked anywhere but / has its helpers beside it, not where it
# was built to look.
libexec=$(dirname "$SSHD")/../libexec/openssh
[ -x "$libexec/sshd-session" ] && echo "SshdSessionPath $libexec/sshd-session" >>"$tmp/sshd_config"
[ -x "$libexec/sshd-auth" ] && echo "SshdAuthPath $libexec/sshd-auth" >>"$tmp/sshd_config"
"$SSHD" -D -e -f "$tmp/sshd_config" 2>"$tmp/sshd.log" &
sshd_pid=$!
for _ in $(seq 50); do
	python3 -c "import socket; socket.create_connection(('127.0.0.1',$port),1)" 2>/dev/null && break
	kill -0 "$sshd_pid" 2>/dev/null || { cat "$tmp/sshd.log" >&2; fail "sshd didn't start"; }
	sleep 0.2
done
python3 - "$machine" "$port" "$(id -un)" "$PODMAN_SOCK" "$tmp/orq_key" "$tmp/host_key.pub" >"$tmp/machine.json" <<'EOF'
import json, sys
name, port, user, sock, key, host_key = sys.argv[1:]
print(json.dumps({
    "name": name, "description": "made by dev/e2e.sh",
    "host": "127.0.0.1", "port": int(port), "user": user, "socket_path": sock,
    "private_key": open(key).read(), "host_key": open(host_key).read().strip(),
}))
EOF
answer=$(curl -s -w '\n%{http_code}' -b "$jar" -H 'Content-Type: application/json' \
	--data-binary "@$tmp/machine.json" "$ORQ_URL/api/admin/machines")
case $(echo "$answer" | tail -n 1) in
2*) machined=1 ;;
*) echo "$answer" | sed '$d' >&2; cat "$tmp/sshd.log" >&2; fail "Maestro didn't add machine $machine" ;;
esac
ready=$(m machines --json | json "[x['status'] for x in j if x['name']=='$machine'][0]")
m machines list
[ "$ready" = ready ] || fail "machine $machine is $ready, not ready"

step "building $TEMPLATE and running it"
# The image is built in orq's Podman, which here is the machine's too: the
# run starts straight away, before a sweep could take an image no line needs.
# With --json, what it says along the way goes to standard error, which also
# names the build if starting the run is what failed.
built=0
m build "$TEMPLATE" --run --json >"$tmp/build.json" 2>"$tmp/build.log" || built=$?
cat "$tmp/build.log"
build=$(sed -n 's/.*Build #\([0-9]*\) succeeded.*/\1/p' "$tmp/build.log")
[ "$built" -eq 0 ] || fail "building $TEMPLATE and starting its run failed"
run=$(json 'j["run"]["id"]' <"$tmp/build.json")
echo "Build #$build, run $run."
m runs show "$run" --watch --interval 2s || fail "run $run didn't succeed"

step "downloading run $run"
(cd "$tmp" && m runs get "$run")
check() {
	[ -f "$tmp/$run/$1" ] || fail "run $run has no $1"
	got=$(cat "$tmp/$run/$1")
	[ "$got" = "$2" ] || fail "$1 holds \"$got\", not \"$2\""
	echo "$1: $got"
}
check 1/out.txt "run: done after 10s"
check 2/out.txt "long run: done after 20s"
check 2/stdout.log "long run: waiting 20s
done"
