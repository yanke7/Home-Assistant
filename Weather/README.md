# Atmosphere weather dashboard

A compact Home Assistant dashboard with live weather, hourly and daily forecasts, precipitation radar, and garbage, recycling, and yard/food-waste collection dates.

Desktop shows forecast and radar side by side. Mobile keeps current weather and pickups visible while Hourly, Daily, and Radar share one tabbed panel. Tested at desktop size and at 390×844 and 375×667. Very short screens or enlarged text may require scrolling.

## Files

- `atmosphere-card.js` — custom Lovelace card.
- `dashboard.json` — example panel dashboard configuration.
- `verify.cjs` — dependency-free Node.js checks.

## Installation

1. Install the community `weather-radar-card` in Home Assistant and confirm its JavaScript resource is loaded. The dashboard embeds this card for radar.
2. Copy `atmosphere-card.js` into `/config/www/Weather/` (create the folder if needed).
3. Register `/local/Weather/atmosphere-card.js?v=1` as a **JavaScript module** in your dashboard Resources settings.
4. Create an empty dashboard and take control if it is automatically generated. Open its raw configuration editor and paste the contents of `dashboard.json` (JSON is valid YAML).
5. Replace `weather.forecast_home` and `calendar.waste` in that configuration with your weather and collection-calendar entity IDs. The weather integration must support hourly and daily forecasts. The card also reads `sun.sun`.
6. Reload the browser. Increment the resource URL version after replacing the JavaScript file to avoid stale browser caches.

Do not install this module alongside another module registering `yanke-atmosphere-card`; update the existing resource instead.

## Collection schedule

The card queries the selected calendar for the next 60 days and refreshes every five minutes. Event titles are matched case-insensitively:

| Category | Matching event title |
| --- | --- |
| Garbage | Contains `Garbag` (including `Garbage`), or exactly `Waste` / `General Waste` |
| Recycling | Contains `recycl` |
| Yard & food | Contains `yard`, `food`, or `organic` |

Today's pickups disappear at 10 am in Home Assistant's configured time zone. Adjust the matching expressions and cutoff in `collection()` / `render()` if your schedule differs. Selecting a collection opens the calendar entity's native details. An empty category displays “No pickup in 60 days”; failed requests display “Schedule unavailable”.

## Customization

The header uses `YANKE HOME`; edit that text to personalize it. The `Original` link points to `/dashboard-weather/0`; replace it with your own dashboard path or remove the link.

This public copy includes standalone color fallbacks. An existing `window.YankeAppearance` integration is optional; its CSS variables can override the colors, font, scaling, and available height. No separate appearance module is required.

The example radar uses OSM map tiles, retains the radar card's attribution, and sets its height to `100%` to fit the panel. Map and radar availability depend on the installed card and its providers. Forecast periods and units come from the weather entity; the footer credits met.no, so update that text if using another provider. No forecast values or pickup dates are hardcoded.

## Verification

With Node.js installed:

```sh
node --check atmosphere-card.js
node verify.cjs
```

Checks cover collection classification, unavailable numeric values, HTML escaping, and clearing stale calendar results after a failed fetch.

This folder contains no credentials, private server addresses, live-state screenshots, or dashboard backups. To remove it, remove the card from dashboards before deleting its resource registration and JavaScript file.
