# Fable Sun Moon

Almanac: a self-contained sun and moon dashboard card for Home Assistant.

It computes the sun and moon positions itself from your Home Assistant location and time zone, so it needs no entities and calls no services.

- Headline sentence ("The sun set 4 h ago. The moon rises at 11:38 AM tomorrow.")
- 24-hour chart of sun and moon altitude. Drag it (or use the arrow keys) to preview the sky at any hour.
- Sun panel: elevation, first and last light, solar noon, golden hour, daylight change since yesterday
- Moon panel: drawn phase with correct tilt, altitude, direction, rise and set, age, distance
- Sky map showing where to look, and a four-week phase calendar
- Page colours follow the sky (night, twilight, golden hour, day)
- Fits a single page on desktop; scrolls on phones

## Install

1. Copy `almanac-sky-card.js` to `/config/www/` (or upload it in the Home Assistant file editor).
2. Settings > Dashboards > Resources > Add resource: `/local/almanac-sky-card.js`, type JavaScript module.
3. Add the card to a panel-type view:

```yaml
views:
  - title: Almanac
    path: sky
    type: panel
    cards:
      - type: custom:almanac-sky-card
        home_path: /dashboard-home2/home   # optional, target of the Home link
```

`preview.html` shows the card with a fake `hass` object. Serve this folder with `python3 -m http.server` and open it.
