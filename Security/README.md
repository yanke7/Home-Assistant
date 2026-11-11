# Security dashboard

A compact Home Assistant security dashboard with two camera feeds, full-screen camera viewing, alarm and door status, lighting controls, and a live outside-light countdown.

## Features

- Full camera images without cropping: front door at 4:3 and driveway at 16:9.
- Tap either camera to expand it; use **Back to dashboard** or Escape to return.
- Camera presets: Back, Vehicle, Door, Street, and BBQ.
- Outside Light on/off and a countdown that updates every second, available on Cameras and Security tabs.
- Alarm modes, lock and door status, thermostat and siren detail dialogs.
- Eight light controls and exterior all-on/all-off.
- Compact desktop layout and Cameras / Security / Lighting tabs on smaller screens.
- Shared appearance support with ten palettes and local font options.

## Install

1. Copy `security-console.js` and `yanke-appearance.js` into `/config/www/security/` on your Home Assistant installation.
2. In **Settings → Dashboards → Resources**, add these JavaScript modules:
   - `/local/security/yanke-appearance.js?v=1`
   - `/local/security/security-console.js?v=1`
3. Create a dashboard with URL `security-dash-2`, then paste the contents of `dashboard.json` into its raw configuration editor. JSON is valid YAML.
4. Reload the browser. The view is available at `/security-dash-2/overview`.

The shared appearance module is required for styling. It defaults to Moss / System / 100% without helpers. If it is already registered for another Yanke dashboard, reuse that module instead of loading a duplicate. Optional appearance helpers are `input_select.yanke_colour_palette`, `input_select.yanke_font_family`, and `input_number.yanke_text_size`; their options are defined in the appearance source.

## Adapt to your installation

This is an installation-specific dashboard, not an automatically discovered integration. Replace the entity IDs in `security-console.js` with your own before using the controls:

- `A`, `L`, `P`, and `T` identify the alarm, lock, driveway PTZ selector, and thermostat.
- `doors` and `lights` define the door sensors and lighting controls.
- Camera entities are `camera.front_door_balanced` and `camera.driveway_balanced`.
- Outside controls use `light.outside_outside_light` and `timer.outside_light_timer`.
- The siren uses `siren.driveway_siren`.

Update the camera ratios in both the native camera configuration and the fitting logic if your streams have different proportions. The displayed clock uses `America/Regina`; change it for your timezone. The Original link points to `/security-dash/0`.

The countdown reads the existing timer; it does not create motion automations, start the timer, or change what happens when it finishes. Light buttons operate real devices. Alarm disarming, lock operations, thermostat settings and siren controls open Home Assistant's native details.

## Files

| File | Purpose |
| --- | --- |
| `security-console.js` | Dashboard custom card |
| `yanke-appearance.js` | Shared appearance and viewport support |
| `dashboard.json` | Panel-view configuration |
| `verify.cjs` | Mocked command routing and timer checks |

## Validation

```sh
node --check security-console.js
node --check yanke-appearance.js
node verify.cjs
```

The checks use mocks and do not operate devices. Camera playback depends on your Home Assistant streams and browser. Layout fitting is designed around normal desktop and phone viewports; unusually short screens or large text settings may need further tuning.

When updating the JavaScript files, bump the `?v=` resource version and reload clients. Camera screenshots, credentials, local network addresses, and backup snapshots are deliberately excluded from this public folder.
