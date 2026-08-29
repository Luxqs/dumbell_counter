/**
 * Strava token-exchange + upload proxy.
 *
 * Why this file has to exist
 * ──────────────────────────
 * Two separate reasons, and each one alone would be enough:
 *
 *   1. Strava's OAuth token exchange requires your client_secret, and Strava
 *      offers no PKCE flow. A secret shipped inside a static page is public,
 *      so the exchange has to happen somewhere you control.
 *   2. Strava's API sends no CORS headers, so a browser cannot call
 *      /api/v3/uploads directly even holding a valid token. The upload has to
 *      be proxied too.
 *
 * Deploy (Cloudflare Workers — free tier is far more than enough):
 *
 *   npx wrangler init dumbbell-strava
 *   # replace src/index.js with this file
 *   npx wrangler secret put STRAVA_CLIENT_ID
 *   npx wrangler secret put STRAVA_CLIENT_SECRET
 *   npx wrangler deploy
 *
 * Then set ALLOWED_ORIGIN below to wherever you host the app, and put the
 * worker URL + your client ID into STRAVA_CONFIG in js/config.js.
 *
 * At Strava (https://www.strava.com/settings/api): set the Authorization
 * Callback Domain to the domain hosting the app — NOT the worker's domain.
 */

// Lock this down to your own origin. '*' would let any site on the internet
// spend your API quota and drive uploads through your credentials.
const ALLOWED_ORIGIN = 'https://example.com';

const cors = origin => ({
  'Access-Control-Allow-Origin':  origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age':       '86400',
  'Vary':                         'Origin',
});

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...cors(origin) },
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const path   = new URL(request.url).pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST')    return json({ error: 'POST only' }, 405, origin);
    // Strict: a MISSING Origin used to pass this check, so any non-browser
    // client could spend your Strava quota. Browsers always send one on a
    // cross-origin POST, so requiring it costs the real app nothing.
    if (origin !== ALLOWED_ORIGIN) return json({ error: 'origin not allowed' }, 403, origin);

    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      return json({ error: 'worker is missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET' }, 500, origin);
    }

    try {
      // ── Authorization code → tokens ────────────────────────────────────────
      if (path.endsWith('/token')) {
        const { code } = await request.json();
        if (!code) return json({ error: 'missing code' }, 400, origin);
        const r = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code,
            grant_type:    'authorization_code',
          }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: 'strava rejected the code', detail: data }, r.status, origin);
        // Only the fields the client needs — never echo the secret back
        return json({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    data.expires_at,
          athlete:       data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname } : null,
        }, 200, origin);
      }

      // ── Refresh an expired access token ────────────────────────────────────
      if (path.endsWith('/refresh')) {
        const { refresh_token } = await request.json();
        if (!refresh_token) return json({ error: 'missing refresh_token' }, 400, origin);
        const r = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token,
            grant_type:    'refresh_token',
          }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: 'refresh failed', detail: data }, r.status, origin);
        return json({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    data.expires_at,
        }, 200, origin);
      }

      // ── Proxy the multipart .FIT upload ────────────────────────────────────
      if (path.endsWith('/upload')) {
        const auth = request.headers.get('Authorization') || '';
        if (!auth.startsWith('Bearer ')) return json({ error: 'missing bearer token' }, 401, origin);
        // The body is passed straight through; the worker never inspects the
        // file and never sees the user's token beyond forwarding it.
        //
        // Content-Type MUST be forwarded. It carries the multipart boundary, and
        // without it Strava receives a body it cannot split into parts and every
        // upload fails — which is exactly what this proxy used to do.
        const contentType = request.headers.get('Content-Type');
        const fwd = { Authorization: auth };
        if (contentType) fwd['Content-Type'] = contentType;
        const r = await fetch('https://www.strava.com/api/v3/uploads', {
          method:  'POST',
          headers: fwd,
          body:    request.body,
        });
        const data = await r.json().catch(() => ({}));
        return json(data, r.status, origin);
      }

      return json({ error: 'unknown route' }, 404, origin);
    } catch (err) {
      return json({ error: 'proxy error', message: String(err && err.message || err) }, 500, origin);
    }
  },
};
