const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const oauth = require('../config/oauth');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Short-lived signed "state" so we know which logged-in user is coming
// back from Vercel/Netlify's login screen (redirects can't carry our
// normal Authorization header). Also doubles as the carrier for the PKCE
// code_verifier (Vercel now REQUIRES PKCE - see vercelConnect below) since
// we don't have a session/cookie to stash it in between the two hops.
const makeState = (userId, codeVerifier = null) =>
  jwt.sign({ uid: userId, cv: codeVerifier, purpose: 'oauth-connect' }, process.env.JWT_SECRET, { expiresIn: '10m' });

const readState = (state) => {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.purpose !== 'oauth-connect') throw new Error('Invalid state');
  return { userId: decoded.uid, codeVerifier: decoded.cv || null };
};

// PKCE (RFC 7636) - Vercel's OAuth now requires this (code_challenge on the
// authorize request, matching code_verifier on the token exchange), or the
// token exchange is rejected and the whole login silently ends up on
// /dashboard?error=vercel_failed with no explanation.
const generatePkcePair = () => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
};

// @desc    Which platforms does this user have connected? (no secrets)
// @route   GET /api/auth/connections
exports.getStatus = async (req, res) => {
  res.json({ success: true, data: req.user.connections });
};

// ---------------------------------------------------------------------
// VERCEL - "Login with Vercel" (real OAuth, free)
// ---------------------------------------------------------------------

// @desc    Kick off Vercel login. Public page (not protected by the
//          normal Bearer-token middleware) - it reads the user's token
//          from the query string because this is a full-page redirect.
// @route   GET /api/auth/connect/vercel?token=<jwt>
exports.vercelConnect = (req, res) => {
  if (!oauth.vercel.clientId) {
    return res.status(500).send('Vercel login is not configured on this server yet (missing VERCEL_CLIENT_ID).');
  }
  try {
    const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
    // PKCE: generate a fresh verifier/challenge pair per login attempt and
    // carry the verifier inside the signed state (see comment above).
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = makeState(decoded.id, codeVerifier);
    const url = new URL(oauth.vercel.authorizeUrl);
    url.searchParams.set('client_id', oauth.vercel.clientId);
    url.searchParams.set('redirect_uri', oauth.vercel.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Deliberately NOT setting `scope` here: Vercel Apps have their scopes
    // configured on vercel.com (App -> Permissions tab), not in the
    // authorize request. Passing scopes here that aren't enabled on the
    // app itself is exactly what causes `invalid_scope`. Omitting it lets
    // Vercel grant whatever the app is configured for.
    res.redirect(url.toString());
  } catch (err) {
    res.redirect(`${CLIENT_URL}/login`);
  }
};

// @desc    Vercel redirects back here after the user clicks "Allow"
// @route   GET /api/auth/connect/vercel/callback
exports.vercelCallback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    // Vercel sends back `error` + `error_description` when it rejects the
    // request itself (bad redirect_uri, bad client_id, etc.) - not just
    // when the user clicks "Cancel". Log both so we can tell them apart.
    console.error('❌ Vercel sent back an error before login:', error, req.query.error_description || '');
    return res.redirect(`${CLIENT_URL}/dashboard?error=vercel_denied`);
  }

  try {
    const { userId, codeVerifier } = readState(state);

    const tokenRes = await axios.post(
      oauth.vercel.tokenUrl,
      new URLSearchParams({
        code,
        client_id: oauth.vercel.clientId,
        client_secret: oauth.vercel.clientSecret,
        redirect_uri: oauth.vercel.redirectUri,
        code_verifier: codeVerifier || '',
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    const teamId = tokenRes.data.team_id || null;

    let accountName = null;
    try {
      // Vercel's OAuth userinfo endpoint (not the plain REST /v2/user,
      // which isn't guaranteed to accept this token's scopes).
      const who = await axios.get(oauth.vercel.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      accountName = who.data.preferred_username || who.data.name || who.data.email || null;
    } catch (_) { /* non-fatal, dashboard still works without a display name */ }

    await User.findByIdAndUpdate(userId, {
      $set: {
        'tokens.vercel': accessToken,
        'connections.vercel': { connected: true, accountName, teamId, connectedAt: new Date() }
      }
    });

    res.redirect(`${CLIENT_URL}/dashboard?connected=vercel`);
  } catch (err) {
    // Log the REAL reason server-side - Vercel's token endpoint returns a
    // specific error (invalid_grant, invalid_client, redirect_uri_mismatch,
    // etc.) that the user-facing redirect can't carry.
    console.error('❌ Vercel OAuth callback failed:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}/dashboard?error=vercel_failed`);
  }
};

// ---------------------------------------------------------------------
// NETLIFY - "Login with Netlify" (real OAuth, free)
// ---------------------------------------------------------------------

// @route   GET /api/auth/connect/netlify?token=<jwt>
exports.netlifyConnect = (req, res) => {
  if (!oauth.netlify.clientId) {
    return res.status(500).send('Netlify login is not configured on this server yet (missing NETLIFY_CLIENT_ID).');
  }
  try {
    const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
    const state = makeState(decoded.id); // Netlify doesn't require PKCE
    const url = new URL(oauth.netlify.authorizeUrl);
    url.searchParams.set('client_id', oauth.netlify.clientId);
    url.searchParams.set('redirect_uri', oauth.netlify.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (err) {
    res.redirect(`${CLIENT_URL}/login`);
  }
};

// @route   GET /api/auth/connect/netlify/callback
exports.netlifyCallback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/dashboard?error=netlify_denied`);

  try {
    const { userId } = readState(state);

    const tokenRes = await axios.post(
      oauth.netlify.tokenUrl,
      new URLSearchParams({
        code,
        client_id: oauth.netlify.clientId,
        client_secret: oauth.netlify.clientSecret,
        redirect_uri: oauth.netlify.redirectUri,
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;

    let accountName = null;
    try {
      const who = await axios.get('https://api.netlify.com/api/v1/user', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      accountName = who.data.full_name || who.data.email || null;
    } catch (_) { /* non-fatal */ }

    // Look up the user's PERSONAL account slug so every site we create
    // lands there explicitly. Without this, POST /sites falls back to
    // whichever team the token defaults to, which can silently differ
    // from the team the user has open in their dashboard - the deploy
    // "succeeds" but the site is nowhere the user is looking.
    let accountSlug = null;
    try {
      const accounts = await axios.get('https://api.netlify.com/api/v1/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const personal = accounts.data.find(a => a.type === 'PERSONAL') || accounts.data[0];
      accountSlug = personal?.slug || null;
    } catch (_) { /* non-fatal - we just fall back to Netlify's own default */ }

    await User.findByIdAndUpdate(userId, {
      $set: {
        'tokens.netlify': accessToken,
        'tokens.netlifyAccountSlug': accountSlug,
        'connections.netlify': { connected: true, accountName, connectedAt: new Date() }
      }
    });

    res.redirect(`${CLIENT_URL}/dashboard?connected=netlify`);
  } catch (err) {
    console.error('❌ Netlify OAuth callback failed:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}/dashboard?error=netlify_failed`);
  }
};

// ---------------------------------------------------------------------
// RENDER - no public OAuth exists (Render only exposes personal API
// keys), so this is a one-time "paste your free API key" connect - the
// user still never has to touch it again after this single step.
// ---------------------------------------------------------------------

// @desc    Connect Render with an API key (validated before saving)
// @route   POST /api/auth/connect/render
exports.connectRender = async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, message: 'API key is required' });

    let accountName = null;
    try {
      const who = await axios.get('https://api.render.com/v1/owners', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      accountName = who.data?.[0]?.owner?.name || who.data?.[0]?.owner?.email || null;
    } catch (err) {
      return res.status(400).json({ success: false, message: 'That Render API key looks invalid. Get a free one from dashboard.render.com/u/settings#api-keys' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        'tokens.render': apiKey,
        'connections.render': { connected: true, accountName, connectedAt: new Date() }
      }
    });

    res.json({ success: true, message: 'Render connected!', data: { accountName } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------
// Disconnect any provider / logout
// ---------------------------------------------------------------------

// @desc    Disconnect a platform (removes the saved token)
// @route   DELETE /api/auth/connect/:provider
exports.disconnect = async (req, res) => {
  const { provider } = req.params;
  if (!['vercel', 'netlify', 'render'].includes(provider)) {
    return res.status(400).json({ success: false, message: 'Unknown provider' });
  }

  await User.findByIdAndUpdate(req.user._id, {
    $set: {
      [`tokens.${provider}`]: null,
      [`connections.${provider}`]: { connected: false, accountName: null, connectedAt: null }
    }
  });

  res.json({ success: true, message: `${provider} disconnected` });
};

// @desc    Logout (JWTs are stateless - this just confirms to the client
//          it's safe to drop the token; kept as a real endpoint so the
//          dashboard has a proper "Logout" action to call).
// @route   POST /api/auth/logout
exports.logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out' });
};