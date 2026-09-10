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

The fake clock's frame interval is a **variable** (`FRAME_MS`), and the counting suite runs
at 8, 10, 12, 15, 20, 30 and 60 fps. That is not thoroughness for its own sake: while the
suite only ever ran at 30 fps it stayed green through a bug that scored one rep in five on
any phone slower than about 15 fps, which is where MoveNet Thunder over WebGL actually sits
on mid-range hardware. Frames pumped in `e2e.test.js` are likewise spaced in wall-clock time
(`pump(n, gap)`) — a rep whose 36 frames all land in the same millisecond is not a rep any
camera can produce, and the engine is right to refuse it.

`tools/probe-framerate.js` and `tools/probe-accuracy.js` are not tests but standalone probes:
they print the counting behaviour as tables (reps counted per frame rate, degrees of
overshoot required, behaviour under keypoint dropout) and are the fastest way to see the
shape of a change before pinning it in a test.

Every test named `(regression)` reproduces a bug that was actually present in this
codebase — run either suite against an older checkout of `js/` and it fails. A test
that guards a mistake you nearly made while fixing something, rather than one that
shipped, does not get the tag: `unit.test.js`'s "a dropout on the rep-crediting side
does not freeze the set" is deliberately untagged for that reason.

Current counts: `unit.test.js` 79, `e2e.test.js` 56.

Two details exist purely so that verification is possible, and both are easy to
undo by accident:
- `unit.test.js` pulls each exported symbol out inside its own `try`, so the file
  still RUNS against an older checkout of `js/` that lacks some of them. A single
  destructuring export threw a ReferenceError before test one and made the whole
  check impossible.
- `e2e.test.js`'s `calibOpen()` is null-safe, so the calibration helper can never
  be the reason an unrelated test fails when the suite is pointed at an old tree.
