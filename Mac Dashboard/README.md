# Mac Dashboard

Home Assistant custom dashboard for a Mac, an Apple TV, and an optional Reolink camera view on an AirPlay extended display.

## Features

- Animated workstation illustration with connection/display feedback and battery history.
- Mac volume, mute, display wake/off, full sleep and shutdown controls.
- Apple TV app launchers, navigation, play/pause and volume controls.
- Extend the Mac desktop to an Apple TV and place Reolink on that display.
- Optional office lights, temperature and printer toner indicators.
- Optional YankeAppearance integration; built-in styling is used when it is absent.

## Public example, not a live configuration

All Mac names and device identifiers are placeholders. No MQTT credentials, Home Assistant tokens, private network addresses, local account paths, logs or deployment records are included. Keep real configuration outside this repository. The `.gitignore` excludes the runtime MQTT configuration, logs and built applications.

## Dashboard installation

1. Configure MQTT and your Mac integration, and configure the Apple TV integration in Home Assistant.
2. Edit `mac-studio.js`: replace `example_macbook` with your actual Mac entity prefix. Map `media_player.office`, `remote.office`, `light.office_light`, `light.office_led`, `sensor.room_presence_temperature`, and `sensor.printer_*` to your own entities. Optional missing entities display as unavailable.
3. Replace `REPLACE_WITH_MAC_DEVICE_ID` in the device-settings link. Adjust the Home and Appearance navigation links for your dashboards.
4. Run `python3 build.py` from this folder. It embeds the illustration in `mac-studio.bundle.js`.
5. Copy the bundle to Home Assistant's `config/www/`, then add `/local/mac-studio.bundle.js` as a JavaScript module under dashboard Resources.
6. Create a dashboard using the `dashboard.json` configuration, or add a panel view with a `custom:yanke-mac-studio` card. Reload the browser after resource updates.

The card uses your existing authenticated Home Assistant frontend session. It does not contain a token. Three.js and several app logos load from public CDNs; the workstation and Prime Video artwork are embedded. Reduced-motion preferences are respected. This is an animated illustration rather than a hardware model.

## Mac background service and AirPlay helper

`mac2mqtt/` contains the customized Go service based on [bessarabov/mac2mqtt](https://github.com/bessarabov/mac2mqtt), plus the Swift Accessibility helper. The upstream MIT license is retained in `mac2mqtt/LICENSE`.

This is source code, not a signed installer. Building and configuring it requires Go, the macOS command-line developer tools and an MQTT broker:

```sh
cd mac2mqtt
go build -o mac2mqtt .
swiftc OfficeMirroring.swift -o office-mirroring -framework AppKit -framework ApplicationServices
cp mac2mqtt.example.yaml mac2mqtt.yaml
chmod 600 mac2mqtt.yaml
```

Fill in the broker settings locally. The service reads `mac2mqtt.yaml` from its working directory. Keep `office-mirroring` beside the `mac2mqtt` executable. For background use, package/sign these executables in an app and configure a user LaunchAgent with that working directory and KeepAlive. Grant the app Local Network and Accessibility permissions when macOS requests them. Rebuilding an ad-hoc-signed app can require removing and re-adding its Accessibility entry.

The MQTT topic prefix is derived from the Mac hostname at runtime. Update `Example-MacBook` and the example identifiers in `discovery.example.json` to match your installation, then publish each payload as JSON to its listed discovery topic with retain enabled. Do not retain command messages. Entity IDs assigned by Home Assistant must match the dashboard mapping.

The Swift helper currently targets an Apple TV named `Office`, including its `Office (AirPlay)` display name, and `/Applications/Reolink.app`. Change these strings for a different target. It supports `start`, `stop`, and `cameras`. It uses English macOS Displays UI labels; other languages or OS layouts may need changes. The camera action waits for Reolink's window and verifies its placement on the extended display. Configure camera credentials in Reolink itself; none belong in this project.

## Alexa

`scripts.example.json` contains per-script configuration examples for Office Cam, Mac Sleep, streaming app launchers, Settings, Play and Pause. Create scripts through the Home Assistant script editor/API using your mapped entity IDs and expose them to Alexa through your configured Home Assistant Cloud integration.

An exact phrase such as “Alexa, netflix tv” requires an Alexa routine: Voice phrase → Smart Home → Scenes → Netflix TV. Merely exposing a script does not create that routine. App launchers open the app; they do not select a movie. The You Tube TV action opens YouTube, not the separate YouTube TV service.

## Behavior and troubleshooting

- Full sleep is different from turning off displays. A USB Ethernet adapter may lose power during sleep; physical wake may be required.
- Staying awake on AC power is a separate macOS setting, not changed by this dashboard.
- AirPlay and camera actions require an awake, logged-in Mac and an available Apple TV.
- Connection status cannot distinguish sleep, shutdown and network failure. Display animation reflects commands, not a hardware display-power sensor.
- If every Mac control is unavailable, check the MQTT service and broker connection. Restarting the service restored a stale offline state observed after a broker timeout; this source does not claim to permanently fix that reconnect edge case.
- Some Apple TV apps report stale active-app metadata even when launch succeeds. Confirm on the TV when needed.

## Validation

```sh
python3 build.py
node --check mac-studio.bundle.js
node verify.cjs
node verify-tv.cjs
node verify-tv-controls.cjs
node verify-light.cjs
```

These checks use mocked Home Assistant state and do not operate real devices. Public-source checks passed during preparation; each installation still needs its own permission, entity mapping and device verification.

Streaming-service names and logos belong to their respective owners. The workstation artwork is generated artwork; no source photograph or live dashboard screenshot is included.
