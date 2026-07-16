/**
 * questions/tlaplus.ts — Probe generation for formal_tlaplus dimension
 */

import type { ProbeItem } from '../types.js';

export function generateTlaPlusProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
    {
      probe_id: 'formal_tlaplus-1',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a simple counter. The counter has two operations:
- Increment: increases the counter value by 1, but the value must not exceed 100.
- Reset: sets the counter to 0.

Include a type invariant to ensure the counter is always a non-negative integer <= 100.
Name your module "Counter".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-2 (easy) ----
    {
      probe_id: 'formal_tlaplus-2',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a toggle switch. The switch has two states: "on" and "off".
The only operation is Toggle, which changes the state from on to off or from off to on.
Include an invariant that the switch is always either "on" or "off".
Name your module "Toggle".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'formal_tlaplus-3',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a bounded FIFO queue with maximum capacity MaxLen = 5.
The queue supports two operations:
- Enqueue(item): adds an item to the back of the queue (only if not full).
- Dequeue: removes and returns the item at the front of the queue (only if not empty).

Define items as natural numbers. Include a type invariant and a capacity invariant.
Name your module "Queue".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-4 (medium) ----
    {
      probe_id: 'formal_tlaplus-4',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a mutual exclusion lock shared by 2 concurrent processes (p1, p2).
Each process alternates between states: "idle", "trying", and "critical".
Safety property: at most one process may be in the "critical" state at any time.

Define two process actions per process (Try, Exit). Use a global lock variable.
Name your module "Mutex".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'formal_tlaplus-5',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a producer-consumer system with a shared bounded buffer of capacity 3.
- The producer puts items (natural numbers) into the buffer when the buffer is not full.
- The consumer takes items from the buffer when the buffer is not empty.

Use a FIFO queue for the buffer. Include type and safety invariants (buffer size never exceeds 3).
Name your module "ProdCons".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'formal_tlaplus-6',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a leader election protocol among 3 nodes (n1, n2, n3).
Each node can be in states: "candidate" or "leader".
Safety property: at most 1 node may be in the "leader" state at any time.
Liveness property: eventually at least one node becomes leader.

Model nodes with a set {n1, n2, n3}. Each node has state variable. Use a single shared
leader variable. Include both safety and liveness (temporal) properties.
Name your module "LeaderElection".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-7 (hard) ----
    {
      probe_id: 'formal_tlaplus-7',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a distributed lock system with deadlock detection.
Two concurrent processes (p1, p2) compete for two shared resources (r1, r2).
Each process needs to acquire both resources to do work, but they can only acquire one at a time.

Process p1 acquires r1 then r2. Process p2 acquires r2 then r1 — this creates risk of deadlock.
Model each resource with states: "free" or "held_by_pX".
Include a deadlock detection invariant that flags when both processes are waiting.

Name your module "DistributedLock".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
  ];
}
