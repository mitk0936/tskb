# Cancellation & Teardown Redesign — progress ledger

Base ref: 814b48d (no commits; stage-only working-tree execution)
Plan: docs/superpowers/plans/2026-07-13-cancellation-teardown-redesign.md
Target files (clean at base): packages/omkit/src/core/ExecutionTree.ts, packages/omkit/src/core/ActionRun.ts, packages/omkit/tests/unit/teardown.test.ts (new)
Isolation: prior tasks staged in the index; `git diff` (unstaged) shows the current task's delta.

- Task 1: complete (review clean, staged in index; ExecutionTree.ts + teardown.test.ts)
- Task 2: complete (review clean, staged; ActionRun.ts + ExecutionTree.ts + teardown.test.ts). Two in-scope companion fixes verified: removed trackNode's node.done read; memoized finalize() to close a write race.
- Task 3: complete (verification). omkit 19/19; full workspace suite 224/224; typecheck clean; lint 0 errors (2 pre-existing complexity warnings in untouched actions/healthcheck.ts + actions/prompt.ts).

Minor findings roll-up: task reviews clean. Final whole-branch review (opus): "With fixes" — NO Critical.
Final-review findings:

- Important #1: attach-then-fail hole. `.ref` marks observed, but once the handle resolves (attach) a LATER failure has no receiver → silently swallowed (no teardown/fault). Not reached by current actions (chromePage/prompt don't throw post-attach). DECISION NEEDED: tighten observed vs document.
- Important #2: SIGINT idempotency untested (design test item #6). Add via direct handler invocation (avoid process.emit in vitest).
- Important #3: event-only-observed distinction untested (once("healthy") unobserved vs once/on("error") observed). Add tests.
- Minor #4: grace 8000→5000ms (intended per spec, no action).
- Minor #5: green run never resets process.exitCode to 0 (pre-existing, low impact, no action).
- Minor #6: cosmetic self-teardown churn on clean completion (harmless, no action).

Final-review fixes applied (staged): #1 tightened .ref observation (refObserved gated on !attached) + test; #2 SIGINT idempotency test (direct handler invocation); #3 event-only-observed tests (once("healthy") unobserved vs on("error") observed). Minors #4/#5/#6 no action.
FINAL STATE: all staged, nothing committed. omkit 23/23; full workspace 228/228; typecheck clean; lint 0 errors. COMPLETE.

---

Prior plan 2026-07-11-omkit-action-decomposition: all 7 tasks complete, review clean, READY TO MERGE (see git history).

---

# Activity Outcome & Failure Handling (.result / .handleFailure) — progress ledger

Base: teardown-redesign work staged in index on 814b48d (stage-only, no commits).
Plan: docs/superpowers/plans/2026-07-13-omkit-activity-result-model.md
Execution: stage-only. Each task's changes land UNSTAGED; controller reviews `git diff`, then `git add` to stage (isolating the next task). No commits.

- Task 1: complete (review clean after fix; staged in index). Reviewer caught a Critical: an out-of-brief succeed() cancellation guard flipped root/racing-success nodes to "cancelled" on nearby cancel(); reverted succeed() and moved cancellation-as-CancelledError to the fail() path (test daemon rejects on abort). omkit focused 17/17 + smoke 10/10; full suite 232/232; typecheck clean.
- Task 2: complete (controller-verified; staged). tskb-dev.ts run body rewritten to .result; matches plan exactly; typecheck clean (only remaining wm error is tskb-build.ts:28 .done = Task 3). Note: subagent overwrote user in-progress equivalent hand-edit.
- Task 3: complete (controller-verified; staged). tskb-build.ts run body → .result; build failure re-thrown to stay red. npm run typecheck -w wm clean (exit 0).

Final whole-branch review (opus): "With fixes". Core verdict sound (.result provably never rejects; handleFailure skips cancel; step + pipelines preserve behavior; no leftover .done). 1 Important: sync-throwing body runs inline during exec(), so fluent .handleFailure/.on("error") attached after exec() miss the failure (silently swallowed). Minors: tskb-dev prints success banner on failed inspect; gate-failure now green (per design); README drift + tautological teardown-mechanics test (out of scope).
Final-review fixes — COMPLETE, verified, staged:

- First tried the reviewer-suggested `await Promise.resolve()` defer in ActionRun.run() (user's pick). REJECTED after the user's test run: it delays a body's abort-listener registration past an immediate cancel(), so an unguarded daemon misses the abort and the run HANGS (cancelled-daemon test timed out 60s). Reverted.
- Correct fix instead (no dispatch-timing change): ActionRun.handleFailure() delivers the already-recorded error when it attaches to a node already in status "failed" (a synchronously-throwing body fails inline during exec()). on/once("error") needed NO change — the event emitter snapshots the last "error" payload and replays it to a late listener (reviewer was mistaken that on-error was affected). Reverted my buggy on()/once() edits.
- teardown.test.ts: added "sync-throwing body still runs its fluent handleFailure (green)" and "…still delivers to a fluent on('error') (green)".
- tskb-dev.ts: inspect reads outcome; on !ok prints "Explorer inspection failed — servers are still up." instead of the success banner. [user chose "check ok, skip banner"]
- Spec doc updated: corrected the false "body runs on a later microtask" rationale.
  VERIFIED: omkit tsc clean; wm typecheck clean; omkit build OK; focused teardown+smoke 29/29; FULL WORKSPACE SUITE 234/234.
  STAGED: all 10 plan files in the index (stage-only, no commits). PLAN COMPLETE.
