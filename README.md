# Dumbbell Counter

A camera-powered rep and set counter for dumbbell training. Runs entirely in the
browser — no build step, no server, no account. Pose detection is TensorFlow.js
MoveNet loaded from a CDN; everything else is plain HTML, CSS and JavaScript.

```
index.html          the whole UI — six screens, one of which is visible at a time
css/styles.css      all styling
js/config.js        exercise definitions, counting bands, template workouts
js/core.js          RepCounter, PoseDetector, and the localStorage managers
js/app.js           screen flow, camera loop, UI wiring
js/export.js        FIT and TCX encoders, Strava client
strava-worker.js    optional Cloudflare Worker for one-click Strava upload
tests/              two suites — see tests/README.md
```

## Running it

Open `index.html` over `http://localhost` or `https://` — **not** `file://`.
Browsers only grant camera access on a secure origin.

```sh
python3 -m http.server 8000     # then visit http://localhost:8000
```

## How counting works

Each exercise in `config.js` defines a band of joint angles:

```
restThreshold ───── peakThreshold ───── idealPeak
(return here)       (rep counts here)   (full range)
```

The counter is a two-state latch. It arms when the joint returns past
`restThreshold` (plus hysteresis) and fires one rep on the next crossing of
`peakThreshold`. That is what makes a hold safe: pressing to lockout and holding
for thirty seconds crosses the peak once and never re-arms.

Two rules in the engine are load-bearing and easy to break by accident:

- **Counting reads the raw joint angle, not the smoothed one.** An EMA trailing
  a 1.4 s rep lags about 7°, which is enough to mark a full rep shallow and
  enough to miss the counting line entirely. Noise is filtered by requiring the
  crossing to persist for `CONFIRM_FRAMES`, not by smoothing.
- **The side that counts is the side that is moving**, then the side further
  through the range, and only then the better-tracked one. Selecting purely on
  keypoint confidence meant that whenever the camera saw the idle or weaker limb
  better, the counter watched a limb that never moves and credited nothing for
  the whole set.

`tests/unit.test.js` pins both. Break either and it fails.

## Exporting

`.FIT` is the only common format that actually models strength training — sets,
reps and weight survive the trip. Garmin Connect and Strava both accept a manual
import. `.TCX` is a fallback that loses the per-set structure.

Strava one-click upload stays hidden unless `STRAVA_CONFIG` in `js/config.js` is
filled in; it needs the proxy in `strava-worker.js` because Strava's token
exchange requires a client secret and its API sends no CORS headers.

## Storage

Everything is in `localStorage`, namespaced per profile. Nothing leaves the
device unless you press an export button.
