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

### Q7. A run has at most 5000 lines

orq and the book allow 5000 lines. What is left is `maestro-template`'s
README on its `stress` branch, which still says a run has at most 1000
lines (line 13, "which makes 1000, a run's most") and that 10 000
containers are ten runs of a thousand (lines 48 and 54). Its owner decides
whether `genvrs.py` makes 5000 lines, so that two runs make 10 000, or keeps
1000 and the README only stops calling 1000 a run's most.

## Text a user reads

### T3. The Maestro page's text

The same pass over every component in `maestro-view/src`, one commit per
component: labels, buttons, empty lists, notes, `title`s, placeholders and
the messages set in the script. Known cases:

- curly apostrophes ("user’s", "group’s") beside straight ones;
- `title`s that are fragments in lower case ("the container never wrote
  it"), and ones that use θ and Z without naming them, in
  `SettingsAdmin.vue`;
- "Open in new tab, drawn", which doesn't say what it does.

## Structure

### S1. The READMEs point to the book

The root `README.md` holds over 600 lines of behaviour that the book now
covers, and the two are kept true by hand. For each section of the root
README, find the page of the book that says the same thing. If the book
lacks something, add it to the book. Then cut the README down to what
Maestro is, the layout, getting started, and production, each with a link to
the book's page. Do the same for `maestro-view/README.md`. One commit per
README, after the text of that part is done (T1 to T3).

### S2. The runs page is one component of 1170 lines

Take the pieces of `RunsDrive.vue` out into components of their own, one
commit each: the list of runs, one run's lines, and the bar of filters and
search. Behaviour and classes stay as they are.

### S3. The root holds what it shouldn't

`plano.md` is the plan of the queues, and describes the four levels that
[The queues](queues.md) replaces. Once Q1 to Q6 are done the book's
`how/queue.md` says how they work. Delete it once its owner agrees. `Maestro.html`
(5.6 MB, untracked) and the worktree at `.claude/worktrees/docs-book` are
the owner's to remove: ask, don't delete.
