# Empire Rewritten Maps (Mode A)

A static, MapLibre GL JS campaign map for historical/fictional storytelling. Includes a demo “Morea Consolidation” campaign with routes, places, and a replay timeline.

## Run locally

You can open the files directly, but some browsers block `fetch` for local files. Recommended:

```bash
python3 -m http.server 8080
```

Then open:
- `http://localhost:8080/index.html`
- `http://localhost:8080/map.html`

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch** and select `main` (or your default branch) and `/ (root)`.
3. Your site will be available at `https://<username>.github.io/<repo>/`.

## How to add new places, routes, and campaigns

### Places
Edit `data/places.json` and add new entries:

```json
{
  "id": "mystras",
  "name": "Mystras",
  "coords": [22.369, 37.076],
  "type": "city",
  "faction": "Byzantium",
  "tags": ["fortress", "capital"],
  "codex": "A hard city of stone above the Eurotas…",
  "chapters": [12, 28, 43]
}
```

### Routes
Edit `data/routes.geojson`. Each feature must include:

```json
"properties": {
  "id": "glarentza_to_corinth",
  "name": "Glarentza to Corinth",
  "faction": "Byzantium",
  "kind": "march",
  "defaultColor": "#c9a85b"
}
```

### Campaigns
Edit `data/campaigns.json` and add new campaigns, clips, and units. Example clip:

```json
{
  "id": "c1",
  "label": "Column departs Glarentza",
  "t0": 0,
  "t1": 12,
  "routeId": "glarentza_to_corinth",
  "unitId": "byz_column_1",
  "camera": { "mode": "follow", "zoom": 7.0, "pitch": 35, "bearing": -10 },
  "events": [
    { "at": 2.5, "type": "label", "text": "Departure at dawn" },
    { "at": 10.0, "type": "battle", "coords": [22.6, 37.5], "text": "Skirmish at the pass" }
  ]
}
```

## Map tiles + attribution

- **Preferred**: MapTiler vector styles (requires API key)
- **Fallback**: OpenStreetMap raster tiles (development/demo)

Attribution (included in the UI):
- © OpenStreetMap contributors
- © MapTiler (when using MapTiler styles)

## How to extend

- Add new routes to `data/routes.geojson` and connect them in `data/campaigns.json` clips.
- Add new banner art under `assets/img/banners/` and reference it by path in `campaigns.json`.
- Customize the map style in `assets/js/app.js` by changing the `STYLE_URLS` config.
