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
sw.js               service worker — caches the app shell, the CDN libraries
                    and the model weights, so a gym with no signal still works
manifest.webmanifest, icon.svg   installable-PWA metadata
tests/              two suites — see tests/README.md
tools/              standalone probes for counting accuracy (plain node)
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
  crossing to persist for `CONFIRM_MS`, not by smoothing.
- **Nothing in the engine is measured in frames.** Confirmation, smoothing and
  the per-limb motion estimate are all in milliseconds and degrees per second.
  A frame count silently changes meaning with the phone: a two-frame
  confirmation demands an overshoot of 2 × (speed / fps) degrees past the
  counting line, which on a 2 s rep at 10 fps is most of the range between the
  counting line and full lockout — every exercise scored one rep in five there
  while scoring five in five at 30 fps. `tests/unit.test.js` now runs the whole
  counting suite at 8, 10, 12, 15, 20, 30 and 60 fps.
- **The side that counts is the side that is moving**, then the side further
  through the range, and only then the better-tracked one. Selecting purely on
  keypoint confidence meant that whenever the camera saw the idle or weaker limb
  better, the counter watched a limb that never moves and credited nothing for
  the whole set.
- **Only the side that credited a rep may close it.** The rule above hands the
  active side to whichever limb is standing in the start position when nothing
  is moving — which, on a one-arm movement, is the idle limb hanging inside the
  rest band. Pausing at the top for about a second therefore let that limb
  re-arm the latch while the weight was still locked out, and the next frame of
  movement credited a second rep from a peak the arm had never left: six counted
  for three performed. Arming follows `_repSide`, and falls back to the active
  side only when the rep's own side is no longer visible.

`tests/unit.test.js` pins all of these. Break any and it fails.

## Calibration

The bands in `config.js` are a starting guess for an average body, and a rep
that stops exactly at `peakThreshold` counts **zero** by design — the line has
to be crossed *and held*. So anyone who does not lock out to the assumed angle
used to get nothing for a whole set while being told to go higher. Measured:
a lifter who tops out at 140° on a bench press scores **0 of 5** against the
config band and **5 of 5** against their own.

Before the first set of an exercise the app offers to measure that range. Two
or three slow reps, nothing counted; `CalibrationRun` tracks both sides
independently and the wider one wins, so a one-arm movement calibrates from the
arm that worked. A run is only believed at ≥25° of range **and** ≥3 direction
changes.

`deriveCountingBand()` then rewrites the band as percentages of that range:
full range is what you actually reach, a rep counts at **70%** of your own path,
and the latch re-arms once you are back within **15%** of your start. That last
number is not decoration — anchoring the latch on the exact angles seen during
calibration would demand you hit them to the degree on every rep, and the set
would count once and stop. An implausible calibration (too narrow, backwards,
non-numeric) is rejected and the config band is used, because a bad calibration
must never be worse than none. Stored per profile per exercise; a decline is
stored too, so nobody is asked twice.

## Framing

Every exercise declares the `view` it needs. `assessView()` separates a body
seen from the front from one seen from the side using shoulder width against
torso height; anything in between is "oblique" and the app says nothing, because
nagging about an ambiguous reading is worse than silence. `assessFraming()`
returns one sentence, ordered by what actually stops the count: a missing joint
**by name**, then the wrong camera angle, then poor tracking, then frame rate.
It is shown only before the first rep of a set — once someone is moving, the
coaching line belongs to the rep.

Two more rules live in the detection layer:

- **A keypoint below the trusted threshold is still measured.** A hip behind a
  thigh at the bottom of a squat reads 0.3–0.4, and treating 0.5 as a cliff
  threw away the whole set — measured, a hip at 0.55 counted five reps of five
  and at 0.49 counted zero. Below `MIN_KEYPOINT_CONFIDENCE` the reading is used
  and flagged uncertain; only below `KP_CONFIDENCE_HARD` is it discarded, and
  only the two proximal joints can be bridged from history.
- **The model has no tracking, so the app does it.** MoveNet SinglePose reports
  whichever person it finds most prominent, independently, every frame. A torso
  centroid that moves further in one frame than a body physically can is a
  different body, and that frame is dropped.

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

The per-profile prefix has to be **injective**, and deriving it by replacing
every non-alphanumeric character was not: "Jano K", "Jano-K" and "Jano.K"
collapsed onto one prefix, as did "Ivča" and "Ivša", so two people silently
shared one history, one plan list and one weight memory. Prefixes are now
claimed in `dc_profile_ns_v1` — the first profile to claim one keeps the legacy
form, so existing data survives, and a later colliding name gets a hashed
suffix.

## Offline

The two TensorFlow.js scripts and the MoveNet weights come from a CDN, so
without `sw.js` the app is dead exactly where it is used — a gym with one bar of
signal. The worker keeps the app shell on stale-while-revalidate and the
version-pinned CDN URLs plus the model weights on cache-first.

**While developing, an edit lands on the SECOND load.** Bump `CACHE_VERSION` in
`sw.js`, or unregister the worker in DevTools → Application → Service Workers.

Still open, and a decision rather than a fix: the CDN scripts carry no
`integrity` attribute. Adding one needs the exact bytes jsdelivr serves, and a
wrong hash kills the app with nothing but a console message. Vendoring the two
libraries into the repo solves both availability and supply chain, at the cost
of ~2-3 MB in git.
