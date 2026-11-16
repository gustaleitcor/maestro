# Text a user reads

A command's help, what a command prints, an error, a label or a note on the
Maestro page: all of it is written in the voice of the book
(`maestro-cli/book/src`). Someone who read a chapter and then runs the
command should meet the same words for the same things. When you write or
change such text, open the book's page on that subject and take its wording.

## The voice

- Write to the reader as "you". The command or the page is "it", and the
  server is "Maestro" or "the server".
- One idea in a sentence. Two ideas are two sentences, not one joined by a
  semicolon or by "; without it, …".
- Say what happens, in the order it happens. Put the condition first and the
  result after it: "With --watch, it follows the run until the run is over."
- Use the plain verb. "It asks before it removes", not "confirmation is
  requested".
- Say a thing once. A sentence that repeats the one before it goes.
- No dashes between clauses and no exclamation marks. A colon introduces a
  list or an example.
- Give the number: "every 2 seconds", "your 20 newest runs", "at most 5000
  lines".
- When something can't be done, say what to do next, with the command that
  does it.

## The words

One word for each thing, the glossary's (`book/src/reference/glossary.md`).
A word the glossary doesn't have is added there before it is used anywhere.

| Write | Not | Because |
| --- | --- | --- |
| build #12, run 31, line 2 | build 12, run #31, job, task | they count apart, and are written apart |
| repository in a sentence; repo in a command, an argument, a column or a label | | `maestro repos`, `<repo>`, `REPO` |
| machine | node, host, server, worker | a machine is one of Maestro's, where containers run |
| your computer | this machine, the client, locally | "machine" is taken |
| the Maestro page | maestro-view, the web UI, the dashboard, the site | users don't know the repos' names |
| Maestro, or the server | orq, the backend, the API | orq is named only to administrators, in the book's "Running a Maestro" |
| sign in, sign out | log in, log out, authenticate | the commands keep their names, `maestro login` and `maestro logout` |
| Maestro key | token, API key, credential | a token is a forge's |
| issued | minted | |
| administrator | admin | Admin is the name of a page |
| remove an image, a forge, a machine; delete a run | | a run's files go with it |
| ended in an error | errored | |
| standard output, standard error | stdout, stderr | except the files `stdout.log` and `stderr.log`, and `--json` names |
| Ctrl-C | ctrl-c, ^C | |
| queued, assigned, starting, running, succeeded, failed, error, cancelled | Queued, QUEUED, pending, done, staged | the statuses as the server names them, in lower case |
| user queue, dispatcher queue, machine queue; a user's head | submission queue, intermediate queue, staged lines, selection, allocation | the three queues, see [The queues](queues.md) |
| colours, cancelled | colors, canceled | the book's spelling |

## A command's help

- `Short` starts with a verb, has no full stop, and fits the command list:
  "Download the files kept from a run". A command that only groups others
  says what they are for: "List, show and download your runs", not "Commands
  for the runs started with `maestro run`".
- `Long` opens with what the command does, its verb in the third person
  ("Builds a container image from …"). After that it speaks to "you".
- A whole command is in backticks (`maestro runs rm 31`). A flag, a file name
  or an argument is written bare (--watch, maestro.toml, <build>).
- A paragraph holds one subject: what it does, then what the arguments are,
  then the flags that change it most. Whatever a flag's own line already
  says isn't said again in `Long`.
- A flag's description is a fragment in lower case with no full stop, and
  says the default when cobra doesn't print it: "how many days back".
- A flag that takes a value names the value, never a Go type: `--line n`,
  not `--line int64Slice`. cobra takes the name from the word in backticks
  in the flag's description.
- `Example` holds commands a reader could run as they are, with the names
  the book uses (`my-app`, build 12, run 31), and a `#` comment only where
  the command doesn't explain itself.
- Every help ends with its `maestro docs` topic, which `root.go` adds.

Before:

```text
With --server, signs in to that Maestro server, which every command then
talks to; without it, to the one kept, which is asked for the first time.
The key is only ever sent to the server that minted it.
```

After:

```text
With --server, it signs you in to that Maestro server, and every later
command talks to it. Without --server, it uses the server the CLI has kept,
and asks for one the first time. The CLI sends your key only to the server
that issued it.
```

Before:

```text
Shows every machine on a row: CPU, memory, GPUs, load, how many of the
cores it has for lines they take and how many lines wait (6/14 +3),
refreshed as you watch.
```

After:

```text
Shows one row for each machine: its CPU, memory, GPUs and load. The last
column reads 6/14 +3 when lines use 6 of the 14 cores the machine has for
them and 3 more lines wait. The rows refresh every 2 seconds.
```

## What a command prints, and errors

- A table's headings are in capitals and its cells are what the book's
  examples show (`RUN`, `#14`, `54m ago`).
- A message after something was done says what was done and names it:
  "Deleted run 31 and its files."
- An error says what is wrong in the user's words and ends with what to do:
  "you have 10 of the 10 images allowed, and runs are using all of them;
  remove one with `maestro builds rm <build>`". It doesn't start with
  "error:" or "failed to", and it doesn't show a Go error, a URL or a status
  code unless that is all there is.
- An error from orq is written once, in orq, as an `apierr`. The CLI and the
  page show it as it came.
- A message the book quotes (`reference/troubleshooting.md`) changes there
  in the same change.

## The Maestro page

- Labels, buttons and headings are in sentence case with no full stop:
  "Images per user", "Kept outputs", "Sign out".
- A button says what it does to what: "Remove", "Download run 31 as a zip".
- An empty list says what would be there and how to get it: "No runs yet.
  Start one with `maestro run <build>`."
- A note under a field is a full sentence: "Stored encrypted and never shown
  again."
- A `title` that explains a value is a sentence in words, starting with a
  capital: "The share of the machines you have used, as the scheduler counts
  it." A symbol from the scheduler's maths (θ, Z) is named in words first.
- Apostrophes and quotes are the straight ones, as in the book.
- The page says "you" where the CLI does, and uses [the words](#the-words).
