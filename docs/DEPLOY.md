# Putting Gully Mole online

Two free services, about 15 minutes, no code to write. Everything they need is already in the repo:

| Part | Where | Config file |
| --- | --- | --- |
| **Game server** (Colyseus) | [Render](https://render.com), free web service | `render.yaml` |
| **Website** (what players open) | [Netlify](https://www.netlify.com), free site | `netlify.toml` |

> **Do this first:** merge the M6 pull request on GitHub, so `main` contains `render.yaml` and `netlify.toml`.

---

## 1. Game server on Render

1. Go to **render.com**, then **Get Started**, and sign up with **GitHub**. Free web services shouldn't need a card, but Render's rules can change; if it asks, the free plan still costs $0.
2. Allow Render to see your **gully-mole** repository. Choose "Only select repositories", then `dhiru-7411/gully-mole`.
3. In the Render dashboard, click **New +** and choose **Blueprint**.
4. Pick the **gully-mole** repo. Render reads `render.yaml` and shows one service, **gully-mole-server** (plan: Free).
5. Click **Apply** (or **Deploy Blueprint**). The first build takes about 3–5 minutes. Wait for **Live**.
6. Copy the service's address from the top of its page. It looks like `https://gully-mole-server.onrender.com`, and Render may add a few letters to the name.
7. Check it: open `https://<your-address>/health` in a browser. It should say **ok**.

Keep that address. You'll need it as `wss://<your-address-without-https>`, for example `wss://gully-mole-server.onrender.com`.

## 2. Website on Netlify

1. Go to **netlify.com** and sign up with **GitHub**.
2. Click **Add new site** (or **Add new project**), choose **Import an existing project**, then **GitHub**, and allow access to **gully-mole**.
3. Pick the repo. Netlify reads `netlify.toml`, so the build settings fill themselves in:
   - Base directory: (empty)
   - Build command: `npm ci && npm run build -w client`
   - Publish directory: `client/dist`
4. **Before you deploy**, add an environment variable (on the same page under **Environment variables**, or later in **Site configuration**, then **Environment variables**):
   - Key: `VITE_SERVER_URL`
   - Value: `wss://gully-mole-server.onrender.com` (your Render address, with **wss://** and **no slash at the end**)
5. Click **Deploy**. It takes about 1–2 minutes.
6. Optional: give it a nicer name in **Site configuration**, then **Change site name**, e.g. `gully-mole`. You'd get `https://gully-mole.netlify.app` if it's free.

## 3. Play

1. Open your Netlify address.
2. The first visit after a quiet spell shows **"Waking up the game server…"**. The free Render server sleeps after about 15 minutes with nobody playing, and waking it takes up to a minute. Then **"Server is awake. Have fun!"**
3. Create a room and send friends the invite link (tap the room code). Everyone needs to open the **Netlify** address, on a phone or laptop.

**Bots online:** `render.yaml` sets `ALLOW_BOTS=true`, so the host can still fill up with bots. For real games with friends, turn them off on Render: open **gully-mole-server**, go to **Environment**, set `ALLOW_BOTS` to `false`, then **Save**. Render restarts the server.

---

## Updating the game

Merge a pull request into `main` and **both sites update by themselves** (Render redeploys the server, Netlify rebuilds the website). Rooms in progress end when the server restarts, so update between games.

## Free-plan limits (good to know)

- **Render free:** sleeps after ~15 min idle, and the first visit wakes it in up to about a minute. One always-free service fits within the monthly free hours. A restart (deploy or wake-up) ends any game in progress.
- **Netlify free:** plenty of bandwidth and build minutes for a friends' game.
- The limits above can change. Check each site's pricing page if something stops working.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Can't reach the game server" forever | Check `VITE_SERVER_URL` on Netlify: it must start with `wss://` and have **no** trailing `/`. After changing it, go to **Deploys**, **Trigger deploy**, **Clear cache and deploy site**. |
| `/health` on Render doesn't say ok | Open the service, then **Logs**. A failed build shows the error there; tell me what it says. |
| Works on laptop, not on phone | Make sure the phone opens the **https** Netlify address (not a `localhost` one). |
| Game freezes for everyone suddenly | The server probably restarted (new deploy). Refresh and create a new room. |
| Netlify build fails | Check that `main` has `netlify.toml`, then look at the deploy log. |

## Running locally is unchanged

`npm run dev` still runs everything on your laptop. Locally the website finds the server by itself, and `VITE_SERVER_URL` is only needed online.
