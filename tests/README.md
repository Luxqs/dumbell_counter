# Tests

Two suites, no framework.

| File | Needs | Covers |
|---|---|---|
| `unit.test.js` | nothing (plain `node`) | rep counting for every exercise, the armed-latch safety rules, side selection, ROM/imbalance, localStorage hardening, plan sanitising, FIT/TCX encoding |
| `e2e.test.js` | `jsdom` | the real `index.html` booted with a stubbed camera + pose model, driven through complete single and multi-exercise workouts, rest, RPE, history and export |

```sh
node tests/unit.test.js       # fast, zero setup
npm install && node tests/e2e.test.js
npm test                      # both
```

`e2e.test.js` stubs `poseDetection`, `getUserMedia`, `AudioContext`, `requestAnimationFrame`
(pumped manually, one frame at a time) and canvas 2D, so no camera or GPU is involved.
`unit.test.js` drives `RepCounter` with synthetic joint geometry and a fake clock, which is
what makes tempo and cooldown behaviour testable at all.

Every test named `(regression)` reproduces a bug that was actually present in this
codebase — run either suite against an older checkout of `js/` and it fails.
