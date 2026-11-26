## What changed

<!-- One paragraph. Link the issue: closes #123 -->

## Why

<!-- The user-visible problem this solves. -->

## Verification

<!-- Paste the four gate results, not just a claim. -->

```
node tools/verify/tap-count.js tests
node tools/doctor.js
node tools/k3.js
node tools/verify/html-check.js
```

- [ ] Test totals report 0 failures
- [ ] Doctor reports 0 FAIL / 0 WARN
- [ ] k3 gate PASSED
- [ ] HTML balanced
- [ ] No new runtime dependency
- [ ] No secrets, keys or tokens in the diff
- [ ] Renderer rules kept: no network, no `innerHTML`, no inline `style=""`

## Screenshots

<!-- Before / after if the UI changed. -->
