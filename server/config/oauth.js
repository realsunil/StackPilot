// Central config for "Login with Vercel" / "Login with Netlify" OAuth.
//
// Both are FREE to set up - no paid plan needed on either platform:
//
//  VERCEL:
//   1. vercel.com -> your account/team Settings -> Apps -> Create
//   2. Set "Authorization Callback URL" to:
//        <SERVER_URL>/api/auth/connect/vercel/callback
//   3. Copy the Client ID + Client Secret into .env as
//        VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET
//
//  NETLIFY:
//   1. app.netlify.com -> User settings -> Applications -> New OAuth App
//   2. Set the redirect URI to:
//        <SERVER_URL>/api/auth/connect/netlify/callback
//   3. Copy the Client ID + Client Secret into .env as
//        NETLIFY_CLIENT_ID / NETLIFY_CLIENT_SECRET
//
//  RENDER:
//   Render does not offer a public OAuth app system (only Vercel/Netlify
//   do), so there is no real "Login with Render" button possible. Render
//   is connected with a one-time free API key instead (see
//   connectionController.connectRender) - the user still never has to
//   paste it again after that.

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

module.exports = {
  vercel: {
    clientId: process.env.VERCEL_CLIENT_ID,
    clientSecret: process.env.VERCEL_CLIENT_SECRET,
    authorizeUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/login/oauth/token',
    userInfoUrl: 'https://api.vercel.com/login/oauth/userinfo',
    redirectUri: `${SERVER_URL}/api/auth/connect/vercel/callback`
  },
  netlify: {
    clientId: process.env.NETLIFY_CLIENT_ID,
    clientSecret: process.env.NETLIFY_CLIENT_SECRET,
    authorizeUrl: 'https://app.netlify.com/authorize',
    tokenUrl: 'https://api.netlify.com/oauth/token',
    redirectUri: `${SERVER_URL}/api/auth/connect/netlify/callback`
  }
};
