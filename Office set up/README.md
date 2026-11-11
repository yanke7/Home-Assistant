# Office set up

A compact Home Assistant dashboard for a Mac workstation, Office Apple TV, two office lights, room temperature and a Brother printer.

## Features

- Cartoon workstation with Three.js animated screens. The laptop and side monitors follow the Mac; the upper screen follows Apple TV independently.
- Apple TV / Mac tabs preserve the illustration size and position.
- Apple TV power, extended Mac display command, app launchers, navigation, playback and volume controls, and live Now playing details.
- Office Light dimmer and 25/50/100% presets; Office LED brightness and color picker.
- Room temperature, battery, connection and screen status.
- Mac tab: compact battery history beside four Brother toner percentages.
- Shared Appearance colors and typography.

## Install

1. Copy `mac-studio.bundle.js` and `yanke-appearance.js` into `/config/www/office/` using your normal Home Assistant file-management method.
2. Register `/local/office/yanke-appearance.js` and then `/local/office/mac-studio.bundle.js` as JavaScript module dashboard resources. If the shared Appearance resource is already installed, register it only once.
3. Create a dashboard with URL path `dashboard-mac`, then paste the contents of `dashboard.json` into its raw configuration editor.
4. Review the entity mappings below and rebuild after changing the source. Hard-refresh the browser after updating resources; use a version query on resource URLs to avoid stale caching.

No credentials or access tokens are required in these files. The card uses the signed-in Home Assistant session. Do not edit Home Assistant's `.storage` files.

## Entity mappings and prerequisites

This exports the dashboard's current entity names. Adapt them for another installation:

- Mac prefix at the top of `mac-studio.js`: `kriss_macbook_pro`. Requires its connection, battery, volume, mute and command entities.
- Apple TV: `media_player.office` and `remote.office`.
- Lights: `light.office_office_light`, `light.smart_led_strip_6ed4`.
- Temperature: `sensor.room_presence_temperature`.
- Printer: `sensor.mfc_l3770cdw_{black,cyan,magenta,yellow}_toner_remaining`.
- Appearance: helper IDs and available palettes/fonts are defined in `yanke-appearance.js`. Existing Appearance dashboard links use `/dashboard-appearance/settings`; Home uses `/dashboard-home/0`. The shared resource supplies defaults if helpers are absent.

The Mac MQTT integration and host-side commands are prerequisites, not installed by this folder. Extend Mac and Office cameras require the existing Mac helper actions (awake, logged-in Mac with the appropriate macOS permissions). The dashboard alone cannot create an extended display or launch Reolink on the Mac. Sleep/shutdown require physical wake afterward.

Apple TV AirPlay metadata cannot distinguish mirror from extended-display sessions. App launch availability depends on its reported source list. Playback titles depend on the active app. Volume behavior depends on Apple TV's audio/CEC setup. Unavailable readings display a dash instead of zero.

## Build and checks

Python 3 packages the existing WebP artwork; no extra Python packages are required:

```sh
python3 build.py
node --check mac-studio.bundle.js
node verify.cjs
node verify-tv.cjs
node verify-tv-controls.cjs
node verify-light.cjs
```

The bundled file embeds the workstation image and supplied Prime Video icon. Three.js loads from its pinned jsDelivr URL. Other app logos load from Simple Icons v11 and Wikimedia. Keep the source and bundled file together when publishing changes.

## Assets

Workstation illustration generated for this dashboard. Prime Video icon supplied by the dashboard owner and embedded in the source. Streaming-service logos remain trademarks of their respective owners; inclusion does not imply endorsement. Other logo sources: Simple Icons v11 via jsDelivr; Disney+ via Wikimedia Commons.

This folder intentionally excludes local deployment records, raw backups, personal file paths and historical test screenshots.
