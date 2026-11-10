# Pandemicradar

A top-down pixel action RPG. Three fictional plagues are crossing a small valley. Walk out of Ashfen, through Whisperwood, Glassport, and the cordon, and reach Safe Haven before the infection meter fills.

The diseases, symptoms, and spread rules are invented for the game. They are not based on real outbreaks. This is not a forecast and not medical advice.

## How to play

- **Move** with WASD or the arrow keys. On a phone, use the pad under the map.
- **Act** with Space, Enter, or E. Talk to people, open locks, and read signs.
- **Dash** with Shift or K.
- **Field Tonic** (U) cuts infection. **Supplies** (I) restore health.
- **Pause** with Esc or P. Progress is stored in this browser: at each gate, when you pick something up, and when you choose Save.

| Plague | What it does |
| --- | --- |
| Sporeveil | Violet ground that creeps a tile at a time while you stay. Standing in it fills infection. It does not chase. |
| Rushfever | People who patrol, sprint when they see you, then have to rest. A touch costs health and infection. |
| Amberhaze | Fog that travels a fixed route. It does not chase. Overlap fills infection. It is slower than you. |

A cloth mask halves infection from Sporeveil and Amberhaze. It does not stop a Rushfever tackle. The Rust Key opens the Old Mill. The Cord Key opens the field lab. The Haven Seal opens Safe Haven.

## Deploy

The site is the `site/` directory: `index.html`, `assets/`, `favicon.svg`, `CNAME`, `robots.txt`, and `sitemap.xml`. There is no build step.

[GitHub Actions](.github/workflows/pages.yml) deploys `site/` to GitHub Pages on every push to `main`, and when the workflow is started by hand. Pages has to be set to **GitHub Actions** once: repository **Settings → Pages → Build and deployment → Source**.

`site/CNAME` contains `pandemicradar.org`, so the custom domain stays attached to the Pages site. Styles and scripts use relative `assets/…` paths.

DNS for the apex domain should point at GitHub Pages:

- `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`

In **Settings → Pages**, set Source to **GitHub Actions**, enter `pandemicradar.org` as the custom domain, and turn on **Enforce HTTPS** after the DNS check succeeds.

To preview locally, from `site/`:

```bash
python3 -m http.server 8765
```
