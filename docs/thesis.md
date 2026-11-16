# The thesis

Maestro is its author's final project in computer engineering. This is how
the text of the thesis is written, by whoever helps write it.

## The claim

Every section is tested against one sentence. As it stands:

> A scheduler of three queues with configurable policies lets a small
> shared lab cluster run containerized experiments with less waiting and
> fairer sharing than first come, first served, and a simulator that runs
> the same scheduler predicts how it behaves.

A section that neither supports nor qualifies it is shortened or moved to
an appendix. When the results change the claim, the sentence is changed
first and the sections after it.

## What each chapter answers

1. Introduction. What problem a lab has today, who it hurts, and what is
   delivered. It ends with the general objective, three or four specific
   ones, and the contributions as a list. Each specific objective has a
   section of results that answers it.
2. Background. Only what the model needs: online scheduling without
   knowing how long a task runs; the queue policies used; fairness over
   several resources (DRF); the measures (waiting time, bounded slowdown,
   utilization, Jain's index). Each symbol is defined once, in a table of
   notation.
3. Related work. Slurm, HTCondor and Kubernetes as systems; DRF, Tetris and
   Choosy as policies. It closes with a table of what each offers and what
   Maestro does differently, and one paragraph on why a lab wouldn't just
   use Slurm.
4. The model. Users, groups, machines and lines; the three queues and the
   policy of each; the score and how it is normalized. It matches `sched`
   name for name, and [queues.md](queues.md).
5. The system. The architecture in one diagram, then the decisions that
   mattered: the scheduler kept pure and shared with the simulator; what
   orq knows kept in its database, so that it restarts in the middle of a
   run; how someone else's code is contained; how machines are reached. The
   CLI, the page and the book get a short section or an appendix.
6. Method. The workloads, exported from real use and generated; the
   machines; the factors of the experiment and their levels; the seeds; the
   measures; and how the simulator was checked against the real cluster
   (P1 in [roadmap.md](roadmap.md)).
7. Results. One question in each subsection, which opens with its answer
   and then shows the figure. Effects are given as sizes with units, not
   only as which policy won.
8. Conclusion. What the evidence supports, the limits (few users, machines
   all alike, no GPUs, no estimate of how long a line runs), and what comes
   next.

## While writing

- The order of writing is the model, the method, the results, the system,
  related work, the introduction, then the abstract.
- A figure's or a table's caption says what the reader should conclude from
  it.
- A claim about waiting, utilization or fairness points to a measurement. A
  claim about the code points to a package.
- The experiments name the commit of each repository they ran on, tagged,
  and an appendix gives the commands that run them again (P3 in
  [roadmap.md](roadmap.md)).
- The limits are stated by the author, in the text.
- A feature isn't listed. A decision is described: what was chosen, what
  was turned down, and why.
- The words are the glossary's and [writing.md](writing.md)'s, in the
  thesis's language: one word for each thing, the same in the model, the code and the figures.

## What the examiners will ask

- Why three queues, and what the dispatcher queue gives that one queue for
  everyone doesn't.
- Why nothing is kept for a line when it is dispatched, and what that costs
  a large line.
- How it is known that the simulator matches the cluster.
- What becomes of fairness when a user's lines fit only some machines.
- How one user's code is kept from harming another's, or the server.
