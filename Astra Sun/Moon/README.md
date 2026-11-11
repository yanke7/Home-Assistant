# Astra Sun / Moon

A Home Assistant Observatory dashboard with a 3D sky dome, brighter lunar phase display, moon horizon graph, and monthly phase calendar. Midnight-blue and gold styling keeps the sun and moon prominent.

The desktop layout fits one screen (checked at 1366 × 768); mobile uses a vertically stacked layout. Location and time zone come from Home Assistant. The only required entity is `sun.sun`; no additional moon sensor is needed.

## Dependencies

Install and register these cards through HACS or the Home Assistant Marketplace:

- [Sun Position Card](https://github.com/jayjojayson/Sun-Position-Card) — built with v_2.3.
- [Lunar Phase Card](https://github.com/ngocjohn/lunar-phase-card) — built with v1.19.1.

This wrapper uses those installed cards. Their source and assets are not bundled here; Lunar Phase Card loads moon images from its upstream CDN.

## Installation

1. Copy `observatory.js` to `/config/www/astra-sun-moon/observatory.js`.
2. Register `/local/astra-sun-moon/observatory.js?v=1` in Settings → Dashboards → Resources as a JavaScript module.
3. Create an empty dashboard and enter the following in its raw configuration editor. The equivalent JSON is supplied in `dashboard.json`.
4. Refresh the browser. Increment the resource URL's version when updating the script to avoid stale caches.

```yaml
views:
  - title: Observatory
    path: sky
    type: panel
    cards:
      - type: custom:yanke-observatory-card
```

## Customization

All CSS is embedded in `observatory.js`; no separate stylesheet is needed.

- The original `yanke-observatory-card` element name and Yanke branding are retained.
- Change the Home link from `/dashboard-home2/home` to your own dashboard path.
- Desktop sizing activates at viewport widths of 1000px and above.
- Moon brightness is controlled by the `observatory-moon-light` style inside `fitCards()`. Its filter brightens the image while retaining the phase shading.

Some desktop refinements style internal Lunar Phase Card elements. An upstream markup change may require adjusting this wrapper. Very short windows or high browser zoom can reduce chart readability.

## Included files

- `observatory.js`: complete dashboard wrapper and styling, including the brighter moon.
- `dashboard.json`: panel-view configuration.

Intermediate builds and original dashboard backups are omitted.
