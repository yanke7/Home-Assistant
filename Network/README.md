# Network dashboard

A compact, responsive Home Assistant network console with dark styling and cyan accents.

- Download, upload and latency readings
- Recorded 24-hour speed history
- Live IP scanner: every device on the network, with assignable names, online/dropped-off status and a 24-hour join/drop log
- Device presence, batteries and available storage
- Printer toner levels
- Expandable location map and device history
- Entity details on tap

## Installation

1. Copy `network-console.js` to `/config/www/network/network-console.js`.
2. Register `/local/network/network-console.js?v=2` as a **JavaScript module** in Home Assistant dashboard resources.
3. Create a dashboard and paste the contents of `dashboard.json` into its raw configuration editor (JSON is valid YAML).
4. Reload the browser to load the resource.

The panel uses `custom:yanke-network-console`. Optional config keys:

```yaml
type: custom:yanke-network-console
local_dashboard_url: /lovelace   # launcher button target, default /lovelace
scan_subnet: 192.168.1.0/24              # label shown on the scanner panel
```

It includes standalone dark-theme defaults and also supports the optional `window.YankeAppearance` integration when installed.

## Network scanner setup

The scanner uses Home Assistant's built-in **Nmap Tracker** integration:

1. Settings → Devices & services → Add integration → **Nmap Tracker**.
2. Enter your subnet (for example `192.168.1.0/24`) and exclude your Home Assistant host.
3. Optionally set the scan interval to 60 seconds and "consider home" to 180 seconds in the integration's Configure dialog.

Each device becomes a `device_tracker.*` entity. `home` shows as online, `not_home` as dropped off. Home Assistant registers newly found devices disabled, so enable the ones you want to track. Names set with the card's pencil button are saved to the entity, so they appear everywhere in Home Assistant. Saving a name needs an admin user.

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

Change the device names, modem/printer labels and branding in the source as needed. Update or remove the original dashboard link (`/network-manager/0`) if that dashboard does not exist on your installation.

History requires Home Assistant recorder data. It refreshes every five minutes and shows an unavailable message when history cannot be read. Missing sensor values display a dash.

The card reads state and history. Its only writes are entity-registry updates when you save a device name or start tracking a device, and both happen on a click. Styles are scoped to its Shadow DOM.

## Public package

Includes the dashboard source and configuration. Live screenshots, private network addresses and rollback backups are intentionally omitted.
