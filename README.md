#  StackPilot

Upload a ZIP or paste a GitHub URL → StackPilot detects the framework and deploys it
to Vercel, Netlify, or Render.

**Multi-tenant by design, zero manual tokens:** users hit **Login with Vercel** or
**Login with Netlify** on the Dashboard — a real OAuth screen on Vercel/Netlify's own
site — and StackPilot never sees their password, just a token to deploy on their
behalf. Render has no public OAuth system (only Vercel/Netlify offer that), so it's
connected with a free personal API key instead — but still only **once**, from the
same Dashboard, never asked again after that. Every deployment always runs on that
user's own account; the server itself never holds its own deployment-platform tokens.

## Project structure

```
stackpilot/
├── client/   # Vite + vanilla JS frontend
└── server/   # Express + MongoDB backend
```

## 1. Prerequisites

- Node.js 18+
- A MongoDB database (a free MongoDB Atlas cluster works fine)

## 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
MONGODB_URI=your-mongodb-connection-string
CLIENT_URL=http://localhost:3000        # your frontend's URL
SERVER_URL=http://localhost:5000        # this backend's own public URL
JWT_SECRET=long-random-string           # generate with the command below
```

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it:

```bash
npm run dev      # with auto-reload
# or
npm start
```

## 3. Frontend setup

```bash
cd client
npm install
npm run dev
```

By default the frontend talks to the backend at `/api` (proxied to
`http://localhost:5000` in dev via `vite.config.js`). For a production build where
the frontend and backend are hosted separately, set `VITE_API_URL` to the full
backend URL before building:

```bash
VITE_API_URL=https://your-backend.onrender.com/api npm run build
```

This produces a static `dist/` folder you can host anywhere (Netlify, Vercel, etc.).

## 4. Enable "Login with Vercel" / "Login with Netlify" (free)

Without this step, the Dashboard's login buttons will show a friendly "not
configured yet" message — deploys still work once tokens are connected some other
way, but the whole point of this setup is that users never have to touch a token.
Both of these are free, no paid plan needed on either platform.

**Vercel:**
1. Go to `vercel.com` → your account/team **Settings → Apps → Create**.
2. Authorization Callback URL: `<SERVER_URL>/api/auth/connect/vercel/callback`
   (use your real deployed backend URL in production).
3. Copy the **Client ID** and **Client Secret** into `server/.env` as
   `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET`.

**Netlify:**
1. Go to `app.netlify.com` → **User settings → Applications → New OAuth App**.
2. Redirect URI: `<SERVER_URL>/api/auth/connect/netlify/callback`
3. Copy the **Client ID** and **Client Secret** into `server/.env` as
   `NETLIFY_CLIENT_ID` / `NETLIFY_CLIENT_SECRET`.

**Render:** Render doesn't offer a public OAuth app system (only Vercel and Netlify
do), so a "Login with Render" button isn't possible. Instead, on the Dashboard page
users paste a free personal API key from `dashboard.render.com/u/settings#api-keys`
**once** — it's validated immediately and then never asked for again.

Restart the backend after editing `.env` for these to take effect.

## 5. Deploying this app itself

- **Backend** (`server/`): any Node host that supports a long-running process and
  outbound HTTPS — Render, Railway, Fly.io, a VPS, etc. Set the environment variables
  from `.env.example`, including `SERVER_URL` (this backend's own public URL — used
  to build the OAuth callback URLs above).
- **Frontend** (`client/`): any static host — Vercel, Netlify, Cloudflare Pages, etc.
  Build with `VITE_API_URL` pointing at your backend.
- Update `CLIENT_URL` in the backend's env to match your deployed frontend's URL
  (used for CORS, the Socket.IO handshake, and OAuth redirect-backs).

## 6. How users deploy their own projects

1. Register an account, land on the **Dashboard**.
2. Click **Login with Vercel** and/or **Login with Netlify** — a real OAuth consent
   screen opens on Vercel/Netlify's own site; approving it connects the account with
   no token ever pasted by the user. For **Render**, paste a free API key once (no
   OAuth exists for Render).
3. Upload a ZIP or paste a GitHub URL, pick a platform (or leave it on Auto), and
   deploy. The deployment is created directly on the user's own connected platform
   account — StackPilot's server never touches it beyond relaying the request.
4. **Logout** from the Dashboard clears the session; **Disconnect** on any platform
   card removes just that one connection without logging the user out.

Free-tier users are capped at `maxDeploys` (default 10) deployments, tracked per
account in MongoDB.

## Security notes

- Connected tokens (`tokens.*` on the `User` document) are marked `select: false` in
  Mongoose so they're never returned by `/api/auth/me` or any other normal API
  response — only the deploy flow explicitly re-fetches them server-side.
- Deployment tokens are stored in MongoDB as-is. If you're running this for real
  users at scale, consider encrypting `tokens.*` at rest (e.g. with
  `mongoose-encryption` or field-level KMS encryption) rather than storing them
  in plaintext.
- Rotate `JWT_SECRET` and your MongoDB credentials if this repository (or its
  `.env` file) has ever been shared or committed anywhere.
- Rate limiting is enabled globally (100 req/15 min) and more strictly on the
  deploy endpoint (5 deploys/hour) — tune these in `server/server.js` as needed.

