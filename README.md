# Pandemicradar

A side-scrolling multiplayer RPG in the spirit of a classic 2D platform MMO. The plagues are invented for the game: **Sporeveil** creeps, **Rushfever** sprints, and **Amberhaze** drifts. Nothing here is taken from MapleStory or Nexon.

The browser client is a static site in `site/`. GitHub Pages publishes it to [pandemicradar.org](https://pandemicradar.org). Progress is stored in this browser (`localStorage`). If the game server is down or not configured, the same valley plays offline.

The realtime server is in `server/`. It owns monster positions and hit points, and relays player movement, chat, and parties. There are no accounts: a traveler picks a name for the session.

## How to play

Type a name (2–12 letters or numbers). **Play online** when a server URL is configured. **Play offline** always works.

- Move: arrow keys or A/D
- Jump: Space or W
- Climb a ladder or rope, or talk to someone beside you: Up
- Drop through a thin platform: Down + Jump
- Leave a ladder: Left, Right, or Jump
- Attack: Z or J
- Field Tonic: X or K
- Chat: Enter, type, Enter. `/party Name` invites. `/leave` drops the party. The Invite button next to another traveler does the same.

Walk east through the arches: Ashfen, Whisperwood, Glassport, the cordon, then the top arch to Safe Haven.

Dr. Lumen on Ashfen wants six sporelings. The cloth mask she gives slows Sporeveil and Amberhaze. It does not stop a tackle. Warden Ilya wants four amber mites. Keeper Sol closes the road once you have the mask. Mira sells tonics and bandages for notes that drop from monsters.

On a phone, the pad under the map has Left, Right, Jump, Up, Attack, and Tonic.

## Host the server on Render's free tier

Do this from the GitHub repo. Do not put passwords in the client. The server has none.

1. Sign in at [render.com](https://dashboard.render.com/) and connect the GitHub account that owns this repo.
2. **New → Blueprint**.
3. Select the `pandemicradar` repository. Render reads `render.yaml` at the repo root.
4. Apply the blueprint. It builds `server/Dockerfile` with the repo as the Docker context and starts a **free web service** named `pandemicradar`.
5. Wait until the service is **Live**. Open its URL. You should see `{"ok":true,...}`. The health check path is `/health`.
6. Copy the hostname Render shows, for example `pandemicradar.onrender.com`.
7. The game client needs the **WebSocket** URL, which is the same host with `wss://`:

   `wss://pandemicradar.onrender.com`

   If Render named the service something else, use that hostname. It must be `wss://`, not `ws://`, because the site is HTTPS.
8. Edit `site/assets/config.js` and set `serverUrl` to that value:

   ```js
   window.PR_CONFIG = {
     serverUrl: "wss://pandemicradar.onrender.com"
   };
   ```

9. Commit and push to `main`. GitHub Pages republishes the client. Until that push, the live site stays in offline mode, which is intentional.
10. Free instances sleep after about 15 minutes without traffic. The first **Play online** shows "Waking the server…" for up to 20 seconds, then offers **Play offline**. Try **Play online** again once Render is awake. A local test can pass `?server=ws://127.0.0.1:8080` on an `http://` page.

### Run the server yourself

From `server/`, with Node 20 or newer:

```bash
npm install
npm start
```

It listens on `PORT` or **8080**. `GET /health` returns JSON. The WebSocket is on the same port and path `/`.

### Fly.io

`fly.toml` is at the repo root. From that directory, `fly launch --no-deploy` then `fly deploy` builds `server/Dockerfile`. The client URL is `wss://<app-name>.fly.dev`. The internal port is 8080.

## Deploy the client

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes the `site/` directory to GitHub Pages on every push to `main`, and when the workflow is started by hand. `site/CNAME` stays `pandemicradar.org`.

Pages has to be set to **GitHub Actions** once: repository **Settings → Pages → Build and deployment → Source**.

DNS for the apex domain should point at GitHub Pages:

- `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`

Preview the client from `site/`:

```bash
python3 -m http.server 8765
```
