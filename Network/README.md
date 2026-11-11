# Network dashboard

A compact, responsive Home Assistant network console with dark styling and cyan accents.

- Download, upload and latency readings
- Recorded 24-hour speed history
- Device location status, batteries and available storage
- Printer toner levels
- Expandable location map and device history
- Entity details on tap

## Installation

1. Copy `network-console.js` to `/config/www/network/network-console.js`.
2. Register `/local/network/network-console.js?v=1` as a **JavaScript module** in Home Assistant dashboard resources.
3. Create a dashboard and paste the contents of `dashboard.json` into its raw configuration editor (JSON is valid YAML).
4. Reload the browser to load the resource.

The panel uses `custom:yanke-network-console`. It includes standalone dark-theme defaults and also supports the optional `window.YankeAppearance` integration when installed.

## Customize

This is a dashboard example based on a specific installation. Replace entity IDs in `network-console.js` with your own:

| Data | Example entities |
| --- | --- |
| Speed test | `sensor.speedtest_download`, `sensor.speedtest_upload`, `sensor.speedtest_ping` |
| WAN address | `sensor.netopia_smartmodem_external_ip` |
| Devices | `device_tracker.kris`, `device_tracker.mac_book` |
| Battery | `sensor.hangmytv_battery_level`, `sensor.mac_book_internal_battery_level` |
| Storage | `sensor.hangmytv_storage` (percentage available) |
| Toner | `sensor.mfc_l3770cdw_<color>_toner_remaining` |

Change the device names, modem/printer labels and branding in the source as needed. Set `local_dashboard_url` on the card to customize its launcher; it defaults to `/lovelace`. Update or remove the original dashboard link (`/network-manager/0`) if that dashboard does not exist on your installation.

History requires Home Assistant recorder data. It refreshes every five minutes and shows an unavailable message when history cannot be read. Missing sensor values display a dash. Smaller phones and expanded details may require scrolling.

The card reads state and history; it does not call device-control services. Styles are scoped to its Shadow DOM. No external JavaScript libraries are required beyond Home Assistant's own map and history cards.

## Public package

Includes the dashboard source and configuration. Live screenshots, private network addresses and local rollback backups are intentionally omitted. The public copy adds default theme values and a configurable launcher URL; it does not modify the installed dashboard.
