// ─── Workout export: Garmin / Strava ──────────────────────────────────────────
//
// Why a file and not an API call
// ──────────────────────────────
// Garmin's Connect API is enterprise-only — it needs an approved commercial
// agreement, so no individual can call it. Strava's OAuth token exchange
// requires a client_secret and offers no PKCE flow, so a static page cannot
// hold one safely.
//
// What DOES work for anyone, today, with no signup: a .FIT activity file.
// Garmin Connect and Strava both accept a manual .FIT import, and FIT is the
// only common format that actually models strength training — sets, reps and
// weight survive the trip instead of being flattened into "45 minutes of
// something". A .TCX file is offered as a fallback for anything that chokes
// on FIT.
//
// The Strava one-click path is wired up but dormant; see StravaClient below.

// FIT timestamps count seconds from 1989-12-31T00:00:00Z, not the Unix epoch.
const FIT_EPOCH_OFFSET = 631065600;

// FIT base types (the high bit marks a multi-byte type)
const T_ENUM = 0x00, T_UINT8 = 0x02, T_UINT16 = 0x84, T_UINT32 = 0x86, T_UINT32Z = 0x8C;

// Global message numbers, from the official FIT profile
const MSG_FILE_ID = 0, MSG_SESSION = 18, MSG_LAP = 19, MSG_ACTIVITY = 34, MSG_SET = 225;

// Marks a field as "not present". Garmin renders these as blank rather than 0,
// which is what we want for e.g. a bodyweight set with no weight entered.
const INVALID = { [T_ENUM]: 0xFF, [T_UINT8]: 0xFF, [T_UINT16]: 0xFFFF,
                  [T_UINT32]: 0xFFFFFFFF, [T_UINT32Z]: 0 };

// FIT's own CRC-16 — a nibble-wise variant, not any of the standard CRC16s.
const CRC_TABLE = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,
                   0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];

function fitCrc(crc, byte) {
  let tmp = CRC_TABLE[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];
  tmp = CRC_TABLE[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
  return crc & 0xFFFF;
}

function crcOf(bytes) {
  let crc = 0;
  for (const b of bytes) crc = fitCrc(crc, b);
  return crc;
}

const toFitTime = ms => Math.max(0, Math.round(ms / 1000) - FIT_EPOCH_OFFSET);


// ─── FIT encoder ──────────────────────────────────────────────────────────────

class FitEncoder {
  constructor() {
    this.bytes = [];
    this.defined = new Map();   // localType -> definition signature
    this.nextLocal = 0;
  }

  _u8(v)  { this.bytes.push(v & 0xFF); }
  _u16(v) { this._u8(v); this._u8(v >> 8); }                       // little endian
  _u32(v) { this._u16(v); this._u16(v >>> 16); }

  _write(type, value) {
    if (value === null || value === undefined) value = INVALID[type];
    if (type === T_UINT16) this._u16(value);
    else if (type === T_UINT32 || type === T_UINT32Z) this._u32(value >>> 0);
    else this._u8(value);
  }

  // fields: [{ num, type, value }]
  message(globalNum, fields) {
    const sig = globalNum + ':' + fields.map(f => `${f.num}/${f.type}`).join(',');
    let local = [...this.defined.entries()].find(([, s]) => s === sig)?.[0];

    if (local === undefined) {
      // FIT allows 16 concurrent local slots; we reuse round-robin, which is
      // safe because a definition is always re-emitted before its data.
      local = this.nextLocal % 16;
      this.nextLocal++;
      for (const [k, v] of [...this.defined]) if (k === local) this.defined.delete(k);
      this.defined.set(local, sig);

      this._u8(0x40 | local);        // definition record header
      this._u8(0);                   // reserved
      this._u8(0);                   // architecture: little endian
      this._u16(globalNum);
      this._u8(fields.length);
      for (const f of fields) {
        this._u8(f.num);
        this._u8(f.type === T_UINT16 ? 2 : (f.type === T_UINT32 || f.type === T_UINT32Z) ? 4 : 1);
        this._u8(f.type);
      }
    }

    this._u8(local);                 // data record header (bit 6 clear)
    for (const f of fields) this._write(f.type, f.value);
  }

  finish() {
    const data     = this.bytes;
    const header   = [14, 0x20, 0, 0, 0, 0, 0, 0, 0x2E, 0x46, 0x49, 0x54];
    // profile version 21.96, little endian
    header[2] = 2196 & 0xFF; header[3] = (2196 >> 8) & 0xFF;
    const size = data.length;
    header[4] = size & 0xFF;         header[5] = (size >> 8)  & 0xFF;
    header[6] = (size >> 16) & 0xFF; header[7] = (size >> 24) & 0xFF;

    const headerCrc = crcOf(header);            // CRC of the first 12 bytes
    const full = [...header, headerCrc & 0xFF, (headerCrc >> 8) & 0xFF, ...data];
    const fileCrc = crcOf(full);                // CRC of header + data
    full.push(fileCrc & 0xFF, (fileCrc >> 8) & 0xFF);
    return new Uint8Array(full);
  }
}


// ─── Build a strength-training FIT activity from one history entry ────────────

// A history entry records when the workout was SAVED and how long it ran, but
// not when each individual set started. Active-set durations are real; the
// leftover time is spread evenly across the gaps as rest, which reproduces the
// true total duration and a plausible set-by-set timeline.
function buildStrengthFit(entry, opts = {}) {
  const enc       = new FitEncoder();
  const endMs     = entry.date || Date.now();
  const totalSecs = Math.max(1, entry.totalDuration || 0);
  const startMs   = endMs - totalSecs * 1000;

  const allSets = [];
  for (const ex of (Array.isArray(entry.exercises) ? entry.exercises : [])) {
    const cat = EXERCISES.find(e => e.id === ex.exerciseId)?.fitCategory ?? 65534;
    for (const sd of ex.setData || []) allSets.push({ ...sd, category: cat });
  }

  const activeSecs = allSets.reduce((s, d) => s + (d.duration || 0), 0);
  const gaps       = Math.max(1, allSets.length - 1);
  // Guard: sets whose recorded durations already exceed the session length (a
  // clock change mid-workout) must not produce negative rest.
  const restEach   = Math.max(0, (totalSecs - activeSecs) / gaps);

  enc.message(MSG_FILE_ID, [
    { num: 0, type: T_ENUM,    value: 4 },              // file type: activity
    { num: 1, type: T_UINT16,  value: 255 },            // manufacturer: development
    { num: 2, type: T_UINT16,  value: 0 },              // product
    { num: 3, type: T_UINT32Z, value: 0x44430001 },     // serial number
    { num: 4, type: T_UINT32,  value: toFitTime(startMs) },
  ]);

  let cursorMs = startMs;
  let idx      = 0;

  allSets.forEach((s, setIdx) => {
    const dur     = Math.max(1, Math.round(s.duration || 1));
    const setEnd  = cursorMs + dur * 1000;
    const weight  = s.weight > 0 ? Math.min(0xFFFE, Math.round(s.weight * 16)) : null;

    // Active set. Note the profile quirk: in a `set` message the timestamp is
    // field 254 and message_index is field 10 — the opposite of every other
    // message, and silently produces an unreadable file if you assume 253/254.
    enc.message(MSG_SET, [
      { num: 254, type: T_UINT32, value: toFitTime(setEnd) },
      { num: 10,  type: T_UINT16, value: idx++ },
      { num: 6,   type: T_UINT32, value: toFitTime(cursorMs) },
      { num: 0,   type: T_UINT32, value: dur * 1000 },      // scale 1000 → ms
      { num: 3,   type: T_UINT16, value: s.reps ?? null },
      { num: 4,   type: T_UINT16, value: weight },          // scale 16 → kg
      { num: 5,   type: T_UINT8,  value: 1 },               // set_type: active
      { num: 7,   type: T_UINT16, value: s.category },
      { num: 9,   type: T_UINT16, value: 1 },               // display unit: kg
    ]);
    cursorMs = setEnd;

    // Garmin only renders rest correctly when an explicit REST set follows.
    // Never after the final set — that would extend the session past its end.
    const isLast = setIdx === allSets.length - 1;
    const rest   = isLast ? 0 : Math.round(restEach);
    if (rest > 0) {
      const restEnd = cursorMs + rest * 1000;
      enc.message(MSG_SET, [
        { num: 254, type: T_UINT32, value: toFitTime(restEnd) },
        { num: 10,  type: T_UINT16, value: idx++ },
        { num: 6,   type: T_UINT32, value: toFitTime(cursorMs) },
        { num: 0,   type: T_UINT32, value: rest * 1000 },
        { num: 3,   type: T_UINT16, value: null },
        { num: 4,   type: T_UINT16, value: null },
        { num: 5,   type: T_UINT8,  value: 0 },             // set_type: rest
        { num: 7,   type: T_UINT16, value: 65534 },         // category: unknown
        { num: 9,   type: T_UINT16, value: 1 },
      ]);
      cursorMs = restEnd;
    }
  });

  const endFit   = toFitTime(Math.max(cursorMs, endMs));
  const startFit = toFitTime(startMs);
  const elapsed  = Math.max(1, endFit - startFit) * 1000;

  enc.message(MSG_LAP, [
    { num: 253, type: T_UINT32, value: endFit },
    { num: 254, type: T_UINT16, value: 0 },
    { num: 0,   type: T_ENUM,   value: 9 },     // event: lap
    { num: 1,   type: T_ENUM,   value: 1 },     // event_type: stop
    { num: 2,   type: T_UINT32, value: startFit },
    { num: 7,   type: T_UINT32, value: elapsed },
    { num: 8,   type: T_UINT32, value: elapsed },
    { num: 25,  type: T_ENUM,   value: 10 },    // sport: training
    { num: 39,  type: T_ENUM,   value: 20 },    // sub_sport: strength_training
  ]);

  enc.message(MSG_SESSION, [
    { num: 253, type: T_UINT32, value: endFit },
    { num: 254, type: T_UINT16, value: 0 },
    { num: 0,   type: T_ENUM,   value: 8 },     // event: session
    { num: 1,   type: T_ENUM,   value: 1 },     // event_type: stop
    { num: 2,   type: T_UINT32, value: startFit },
    { num: 5,   type: T_ENUM,   value: 10 },
    { num: 6,   type: T_ENUM,   value: 20 },
    { num: 7,   type: T_UINT32, value: elapsed },
    { num: 8,   type: T_UINT32, value: elapsed },
    { num: 25,  type: T_UINT16, value: 0 },     // first_lap_index
    { num: 26,  type: T_UINT16, value: 1 },     // num_laps
  ]);

  enc.message(MSG_ACTIVITY, [
    { num: 253, type: T_UINT32, value: endFit },
    { num: 0,   type: T_UINT32, value: elapsed },
    { num: 1,   type: T_UINT16, value: 1 },     // num_sessions
    { num: 2,   type: T_ENUM,   value: 0 },     // type: manual
    { num: 3,   type: T_ENUM,   value: 26 },    // event: activity
    { num: 4,   type: T_ENUM,   value: 1 },     // event_type: stop
    // local_timestamp lets Garmin show the right wall-clock time
    { num: 5,   type: T_UINT32, value: endFit + (opts.tzOffsetSec ?? 0) },
  ]);

  return enc.finish();
}


// ─── TCX fallback ─────────────────────────────────────────────────────────────
// Loses the set/rep structure Garmin understands, but every platform reads it.

function buildTcx(entry) {
  const esc = str => String(str ?? '').replace(/[<>&'"]/g,
    c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[c]));
  const endMs   = entry.date || Date.now();
  const total   = Math.max(1, entry.totalDuration || 0);
  const startMs = endMs - total * 1000;
  const iso     = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const notes = (Array.isArray(entry.exercises) ? entry.exercises : []).map(ex => {
    const sets = (ex.setData || [])
      .map(d => `${d.reps}×${d.weight > 0 ? d.weight + 'kg' : 'BW'}${d.rpe ? ` @RPE${d.rpe}` : ''}`)
      .join(', ');
    return `${ex.exerciseName}: ${sets}`;
  }).join('\n');

  let cursor = startMs;
  const exercises = Array.isArray(entry.exercises) ? entry.exercises : [];
  // TCX requires at least one Lap per Activity. A session with no recorded
  // exercises used to emit an Activity with none, which every parser rejects.
  const lapSource = exercises.length ? exercises
    : [{ exerciseName: 'Workout', totalReps: 0, setData: [{ duration: total }] }];
  const laps = lapSource.map(ex => {
    const secs = (ex.setData || []).reduce((s, d) => s + (d.duration || 0), 0) || 1;
    // A Lap with no Track is legal by the schema and rejected in practice by a
    // good share of importers, which treat a trackless lap as an empty one.
    // Two bare Trackpoints — start and end — are enough to keep them happy
    // without inventing distance or heart rate we never measured. Element order
    // is fixed by the schema: Track sits after TriggerMethod, before Notes.
    const track = `      <Track>
        <Trackpoint><Time>${iso(cursor)}</Time></Trackpoint>
        <Trackpoint><Time>${iso(cursor + secs * 1000)}</Time></Trackpoint>
      </Track>`;
    const lap  = `    <Lap StartTime="${iso(cursor)}">
      <TotalTimeSeconds>${secs}</TotalTimeSeconds>
      <DistanceMeters>0</DistanceMeters>
      <Calories>0</Calories>
      <Intensity>Active</Intensity>
      <TriggerMethod>Manual</TriggerMethod>
${track}
      <Notes>${esc(ex.exerciseName)} — ${ex.totalReps} reps</Notes>
    </Lap>`;
    cursor += secs * 1000;
    return lap;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Other">
      <Id>${iso(startMs)}</Id>
${laps}
      <Notes>${esc(entry.planName || 'Dumbbell Counter workout')}\n${esc(notes)}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}


// ─── Strava one-click (dormant until configured) ──────────────────────────────
//
// Strava's token exchange needs a client_secret, and its API sends no CORS
// headers, so BOTH the token call and the upload have to go through a proxy you
// control. Fill in STRAVA_CONFIG in config.js and deploy the worker in
// strava-worker.js — until then the app hides the button rather than offering
// something that cannot work.

class StravaClient {
  constructor(cfg) {
    this.cfg       = cfg || {};
    this.KEY       = 'dc_strava_tokens_v1';
    this.STATE_KEY = 'dc_strava_state';
  }

  // OAuth `state`. Without it the page swaps ANY ?code= it is handed for
  // tokens, so a link crafted by someone else can bind this browser to their
  // Strava account and every later upload lands in a stranger's feed.
  _newState() {
    const bytes = new Uint8Array(16);
    (globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(bytes)
      : bytes.forEach((_, i) => bytes[i] = Math.floor(Math.random() * 256)));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  get configured() { return !!(this.cfg.clientId && this.cfg.proxyUrl); }

  _tokens()      { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } }
  _save(t)       { try { localStorage.setItem(this.KEY, JSON.stringify(t)); } catch (_) {} }
  disconnect()   { try { localStorage.removeItem(this.KEY); } catch (_) {} }
  get connected(){ return !!this._tokens()?.refresh_token; }

  // Sends the user to Strava. They come back to this page with ?code=…
  beginAuth() {
    const redirect = location.origin + location.pathname;
    const state    = this._newState();
    try { sessionStorage.setItem(this.STATE_KEY, state); } catch (_) {}
    const url = 'https://www.strava.com/oauth/authorize'
      + `?client_id=${encodeURIComponent(this.cfg.clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirect)}`
      + `&state=${encodeURIComponent(state)}`
      + '&response_type=code&approval_prompt=auto&scope=activity:write';
    location.href = url;
  }

  // Call on load; returns true if it consumed an auth redirect
  async completeAuth() {
    const params = new URLSearchParams(location.search);
    const code   = params.get('code');
    if (!code || !this.configured) return false;
    let expected = null;
    try { expected = sessionStorage.getItem(this.STATE_KEY); } catch (_) {}
    // Strip the code from the URL so a refresh can't replay it
    history.replaceState({}, '', location.origin + location.pathname);
    try { sessionStorage.removeItem(this.STATE_KEY); } catch (_) {}
    // Only finish a flow this tab actually started.
    if (!expected || params.get('state') !== expected) {
      throw new Error('Strava: neplatný stav autorizácie — spusti pripojenie znova');
    }
    const res = await fetch(this.cfg.proxyUrl.replace(/\/$/, '') + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error('Strava token exchange failed (' + res.status + ')');
    this._save(await res.json());
    return true;
  }

  async _accessToken() {
    const t = this._tokens();
    if (!t) throw new Error('Not connected to Strava');
    if (t.expires_at && t.expires_at * 1000 > Date.now() + 60000) return t.access_token;
    const res = await fetch(this.cfg.proxyUrl.replace(/\/$/, '') + '/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    });
    if (!res.ok) throw new Error('Strava token refresh failed (' + res.status + ')');
    const fresh = await res.json();
    this._save(fresh);
    return fresh.access_token;
  }

  async uploadFit(bytes, name) {
    const token = await this._accessToken();
    const form  = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
    form.append('data_type', 'fit');
    form.append('name', name.replace(/\.fit$/i, ''));
    form.append('sport_type', 'WeightTraining');
    const res = await fetch(this.cfg.proxyUrl.replace(/\/$/, '') + '/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: form,
    });
    if (!res.ok) throw new Error('Strava upload failed (' + res.status + ')');
    return res.json();
  }
}
