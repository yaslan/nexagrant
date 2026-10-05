---
name: fabrika-two-way-evidence-for-guard-tests
description: When writing regression tests for guard clauses, verify both RED and GREEN states to prove the test actually measures what it claims
metadata:
  type: feedback
  project: Fabrika
---

## Rule
When writing a regression test for a guard clause that prevents silent data loss (e.g., hidrasyon guard preventing cart wipe), the test must be verified in both GREEN (guard present) and RED (guard removed) states. A single green run proves nothing — the test could be passing for unrelated reasons (e.g., the guard isn't even being tested).

## Why
In TASK-MTU1CM8ITW6VH, the cart guard test was written to catch when `if (!isHydrated) return;` gets deleted. But if the test only ran with the guard present, it would always pass even if:
- The guard was silently removed
- The test was measuring something else entirely
- The component code changed in a way that bypassed the guard anyway

By removing the guard temporarily and showing the test turns RED, we proved the test is actually catching the thing it claims to catch.

## How to apply
1. Write the regression test
2. Run it with the current (good) code → should pass (GREEN)
3. Deliberately break the thing the test guards against (remove guard, toggle flag, etc.)
4. Run the test again → should fail (RED), and copy the failure output
5. Restore the guard/flag
6. Run one more time → GREEN again
7. Include both RED and GREEN outputs in the result report as proof

This is especially important for tests guarding against **silent data loss** (cart emptied, profile settings reset, etc.) where a buggy test could pass forever while the guard is slowly deleted piecemeal.

Related: [[fabrika-silently-dropped-input-inflates-a-success-count]] (if input silently drops, it's still counted; same problem space, different angle).
