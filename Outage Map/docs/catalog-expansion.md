# Catalog expansion verification

Each candidate was checked from the Home Assistant host. Successful website checks confirm reachability only. Tests are a point-in-time result and may differ by region.

| Added service | Signal | Endpoint check |
| --- | --- | --- |
| Plex | Feed + checks | Official JSON summary returned HTTP 200; HTTP 200 |
| SmartThings | Feed only | Official JSON feed returned HTTP 200 |
| Ring | Feed only | Official JSON feed returned HTTP 200 |
| Sonos | Feed only | Official JSON feed returned HTTP 200 |
| ecobee | Feed only | Official JSON feed returned HTTP 200 |
| Tailscale | Feed only | Official JSON summary returned HTTP 200 |
| Disney+ | Checks only | HTTP 200 |
| Prime Video | Checks only | HTTP 200 |
| Apple TV | Checks only | HTTP 200 |
| YouTube | Checks only | HTTP 200 |
| Paramount+ | Checks only | HTTP 200 |
| Crunchyroll | Checks only | HTTP 200 |
| Tubi | Checks only | HTTP 200 |
| CBC Gem | Checks only | HTTP 200 |
| Crave | Checks only | HTTP 200 |
| Apple Music | Checks only | HTTP 200 |
| YouTube Music | Checks only | HTTP 200 |
| Deezer | Checks only | HTTP 200 |
| SoundCloud | Checks only | HTTP 200 |
| TuneIn | Checks only | HTTP 200 |
| Wyze | Checks only | HTTP 200 |
| tado° | Feed only | Official JSON feed returned HTTP 200 |
| Resideo / Honeywell Home | Feed only | Official JSON feed returned HTTP 200 |
| Philips Hue | Checks only | HTTP 200 |
| Shelly Cloud | Checks only | HTTP 200 |
| Home Assistant services | Feed only | Official JSON feed returned HTTP 200 |
| Peacock | Checks only | HTTP 200 |
| Hulu | Checks only | HTTP 200 |
| Pluto TV | Checks only | HTTP 200 |
| DAZN | Checks only | HTTP 200 |
| The Roku Channel | Checks only | HTTP 200 |
| Ubiquiti / UniFi | Feed only | Official JSON summary returned HTTP 200; no unresolved incidents parsed |
| Bambu Lab | Feed only | Official JSON summary returned HTTP 200; no unresolved incidents parsed |
| Oura | Feed only | Official JSON summary returned HTTP 200; no unresolved incidents parsed |

Candidates left out include Alexa and Xbox (no verified provider signal), TIDAL and HBO Max (HTTP 403 from the test host), Tibber (its page-level indicator reports `major` for single third-party integrations such as one car brand, which would mark the whole service down), and services whose tested URLs returned errors or only exposed marketing pages.
