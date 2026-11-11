# Astra Dashboard

A responsive Home Assistant dashboard with animated Yanke Home branding, a compact desktop overview, and fixed mobile section navigation.

## Features

- Home security, alarm modes, front door lock status and live battery percentage.
- Door contact status, thermostat controls and fan speed.
- Room lighting, timers, LED brightness and colour presets.
- Apple TV information and Harmony activity selection.
- Native Home Assistant camera cards and Home Alone toggle.
- Ten appearance palettes, five font choices and adjustable text size.

The desktop layout is tuned for a single-screen overview; small screens and larger text settings can scroll. Mobile navigation stays below the native Home Assistant header. Lock details and other entity details open native Home Assistant dialogs.

## Files

| File | Purpose |
| --- | --- |
| `yanke-home-card.js` | Dashboard card, including its embedded animated logo |
| `yanke-appearance.js` | Required shared styles and optional appearance settings card |
| `dashboard.json` | Lovelace panel configuration |
| `verify-card.cjs` | Mocked control-routing regression checks |

The existing `yanke-*` element names are retained for compatibility. Astra Dashboard is the package name.

## Installation

1. Copy both JavaScript files into `/config/www/astra-dashboard/` on Home Assistant.
2. Register both resources as **JavaScript modules** in dashboard resource settings, in this order:
   - `/local/astra-dashboard/yanke-appearance.js?v=1`
   - `/local/astra-dashboard/yanke-home-card.js?v=1`
3. Create an empty dashboard, open its raw configuration editor, and paste the contents of `dashboard.json` (JSON is valid YAML). This replaces that dashboard's configuration, so save any previous configuration first.
4. Refresh the browser. When updating the JavaScript later, increment the `v` query parameter on its resource URL to invalidate cached files.

If these custom elements are already registered from another installation, update the existing resources rather than registering a second copy.

## Entity mapping

This is the Yanke Home implementation, not an automatically discovered dashboard. Before using it in another home, edit the `E`, `rooms` and `extras` constants near the beginning of `yanke-home-card.js` to match your entities. Also review the Harmony activity options and the greeting/branding for your home. The card does not accept entity overrides through YAML.

The front door battery is read from `E.lockBattery`, rounded to a whole percentage and shown beneath the lock's name. Unknown or unavailable readings display “Unavailable”.

Controls operate real entities when installed. The verification script uses mocks and does not connect to Home Assistant or operate devices. Camera availability depends on your integration and browser.

## Appearance

The appearance module supplies Moss / System / 100% defaults without any helpers. For persistent controls, create these helpers using Home Assistant's Helpers UI with the exact IDs below:

- `input_select.yanke_colour_palette`: Moss, Ocean, Indigo, Amethyst, Rose, Ember, Amber, Graphite, Linen, Glacier.
- `input_select.yanke_font_family`: System, Humanist, Rounded, Classic, Monospace.
- `input_number.yanke_text_size`: minimum 90, maximum 120, step 5.

To display appearance controls, add a manual card with `type: custom:yanke-appearance-card`. These helper values are shared by other installed Yanke cards that use the module.

## Validation

Run from this folder with Node.js:

```sh
node --check yanke-home-card.js
node --check yanke-appearance.js
node verify-card.cjs
```

No credentials, Home Assistant configuration backups, live camera screenshots or private server addresses are included in this folder. The logo artwork is embedded in the card; no external image hosting is required.
