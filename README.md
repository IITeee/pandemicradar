# Pandemicradar

A static pandemic **risk indicator**. It combines published historical base rates with the latest public outbreak reports and is rebuilt every day.

This is not a prediction and not medical advice. Nobody can say exactly where or when the next pandemic will start. The probabilities on the site come from published base rates, and the outbreak scores are estimates from a simple, documented formula.

## Data sources

Live feeds, fetched by `refresh.py` (Python standard library only):

- [WHO Disease Outbreak News](https://www.who.int/emergencies/disease-outbreak-news) — recent reports, used for signals, scores, and country counts
- [ECDC Communicable Disease Threats Report](https://www.ecdc.europa.eu/en/publications-data/monitoring/weekly-threats-reports) — weekly EU/EEA threat summaries
- [CDC Travel Health Notices](https://wwwnc.cdc.gov/travel/notices) — travel notice levels
- [CDC A(H5) bird flu situation summary](https://www.cdc.gov/bird-flu/situation-summary/index.html) — US human H5 cases and the CDC public-risk assessment

Base rates and context cite Marani et al. 2021, Madhav et al. 2017, Allen et al. 2017, World Bank 2008, and the Global Health Security Index 2021. Full citations are on the site.

## Update and deploy

[GitHub Actions](.github/workflows/pages.yml) runs `python3 refresh.py` and then `python3 build_site.py` every day at 05:30 UTC, on every push to `main`, and when you start it by hand from the Actions tab. `refresh.py` writes `out/snapshot.json` and `out/newsletter.md`. `build_site.py` writes `site/assets/data.js`, stamps the time in `site/index.html`, regenerates the disease pages (`/h5n1/`, `/ebola/`, `/mers/`, `/mpox/`, `/measles/`, `/dengue/`), and rewrites `site/robots.txt` and `site/sitemap.xml`. The workflow then deploys the `site/` directory to GitHub Pages.

If a source is down and `refresh.py` exits with an error, the workflow keeps the previous snapshot, rebuilds, and still deploys. A successful refresh is committed back to `main` so the snapshot history is kept.

Pages has to be set to **GitHub Actions** once: repository **Settings → Pages → Build and deployment → Source**.

Local rebuild, from the repository root:

```bash
python3 refresh.py && python3 build_site.py
```

The subscribe form stays on “Coming soon” until `SIGNUP_ENDPOINT` at the top of `site/assets/app.js` points at a form backend.

## Community

The Community section uses [Giscus](https://giscus.app), which stores comments as GitHub Discussions in the **Announcements** category (`DIC_kwDOVnXMjM4DKrkn`). That category is the announcement type, so only maintainers and the giscus app open new threads. The repository id is `R_kgDOVnXMjA`. Both ids live in the `GISCUS` block at the top of `site/assets/app.js`.

Topic tabs (General, H5N1 / bird flu, Ebola, MERS & coronaviruses, Data & methodology) each map to one discussion via `data-mapping="specific"`.

## Custom domain

`site/CNAME` contains `pandemicradar.org`. The Pages artifact is the contents of `site/`, so that file is published at the site root. Styles and scripts use relative `assets/…` paths, which resolve both at `https://pandemicradar.org/` and under `https://iiteee.github.io/pandemicradar/`.

DNS for the apex domain should point at GitHub Pages:

- `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`

In **Settings → Pages**, set Source to **GitHub Actions**, enter `pandemicradar.org` as the custom domain, and turn on **Enforce HTTPS** after the DNS check succeeds. `www` is not listed in `site/CNAME`; point it at GitHub with a DNS `CNAME` to `iiteee.github.io`.
