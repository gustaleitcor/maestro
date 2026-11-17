# The queues

`sched` holds the model, and everything else carries it out or shows it.
There are three queues, and a policy for each:

1. The user queue. Each user's waiting lines, in the order the user policy
   gives them. The first of them is the user's head.
2. The dispatcher queue. The heads, one for each user who has lines waiting,
   and nothing else. It is not filled from the user queues and has no size
   of its own: when a user's head goes to a machine, their next line is
   their head. Each group has a dispatcher queue of its own, made of the
   heads of its users, and groups take turns. In a group's turn the
   dispatcher policy picks one head, which goes to a machine drawn among
   those that would hold it and have room in their queue.
3. The machine queue. The lines given to a machine that wait for room on it,
   at most `depth` of them. The machine policy picks which starts.

So a line is `queued` in its user's queue (as its head or behind it),
`assigned` in a machine's queue, then `starting` and `running`. Being a head
is worked out on every tick from the user policy and is never stored: with
LCFS or PQ a newer line can take the head's place.

A line that no machine would hold, even empty, is never a head and holds
back no one. A user's share counts their lines assigned, starting and
running.

A user may hold at most `user_max_cpus` cores, an administrator's setting
that the snapshot carries; 0 means no ceiling. What they hold is what their
share counts: their lines assigned, starting and running, and not those
queued. In a group's turn, a user's head is not a candidate while its cores,
with what the user holds, would be over the ceiling, and the other users'
heads go as usual. It stays the user's head, and their next line doesn't
take its place.

In the score, a line's cores and memory are each divided by what every
machine has for lines, summed: capacity less what is kept back, over the
machines orq knows and can reach. That is the total users' shares are
taken over too. Tetris alone divides by the one machine it fits a line
into.
