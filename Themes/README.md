# Yanke Themes

Ten coordinated colour palettes, five font families, and a shared text-size control for Yanke custom Home Assistant dashboard cards. Choose a mood once in the Appearance card and connected cards follow it across dashboards, users, and devices.

This is a JavaScript appearance system for compatible custom cards, rather than a native Home Assistant YAML theme. Installing the module alone does not recolour arbitrary third-party cards: each participating card must call the shared API and use its CSS variables.

## Options

| Palette | Mood | Mode |
| --- | --- | --- |
| Moss | Quiet greens, grounded | Dark |
| Ocean | Deep teal, calm | Dark |
| Indigo | Midnight blue, focused | Dark |
| Amethyst | Soft purple, creative | Dark |
| Rose | Dusty pink, warm | Dark |
| Ember | Copper glow, cosy | Dark |
| Amber | Golden tones, uplifting | Dark |
| Graphite | Cool neutrals, minimal | Dark |
| Linen | Warm daylight | Light |
| Glacier | Clear blue | Light |

Fonts: **System**, **Humanist**, **Rounded**, **Classic**, and **Monospace**. These use installed system fonts with fallbacks, so the precise font can differ between operating systems. Text size ranges from **90% to 120%** in 5% steps. Defaults are **Moss / System / 100%**.

## Install

1. Copy [`yanke-appearance.js`](yanke-appearance.js) into `/config/www/yanke-appearance.js` on Home Assistant.
2. Add `/local/yanke-appearance.js?v=1` as a **JavaScript module** dashboard resource under Settings → Dashboards → Resources. If this installation already has an inline Yanke Appearance resource, update/replace that resource instead of registering a duplicate.
3. In Settings → Devices & Services → Helpers, create the three helpers below. Verify their entity IDs match exactly; an existing name can cause Home Assistant to append a suffix.
4. Set text size to **100** after creation. Avoid forced startup values if you want the last selected appearance restored after restart.
5. Create an Appearance dashboard and paste [`dashboard.yaml`](dashboard.yaml) into its raw configuration editor. Alternatively, add a manual card with `type: custom:yanke-appearance-card` to an existing dashboard.
6. Refresh clients once to load the resource. Subsequent setting changes propagate through normal Home Assistant state updates.

### Helpers

| Type | Name | Entity ID | Options / settings |
| --- | --- | --- | --- |
| Dropdown (`input_select`) | Yanke colour palette | `input_select.yanke_colour_palette` | Moss, Ocean, Indigo, Amethyst, Rose, Ember, Amber, Graphite, Linen, Glacier, in that order |
| Dropdown (`input_select`) | Yanke font family | `input_select.yanke_font_family` | System, Humanist, Rounded, Classic, Monospace, in that order |
| Number (`input_number`) | Yanke text size | `input_number.yanke_text_size` | Minimum 90; maximum 120; step 5; slider; unit `%` |

These settings are shared, not per-user preferences. Changing a helper updates every compatible connected card. When helpers are missing, the Appearance controls show an unavailable message; compatible cards can still use the default palette.

The settings card includes shortcuts to the original Yanke dashboard paths. Adjust the links near the end of `build()` if your dashboard URLs differ.

## Connect a custom card

See [INTEGRATION.md](INTEGRATION.md) for the API, lifecycle handling, and CSS variables. Some cards in this repository may already call `window.YankeAppearance`; check their source before adding another hook. Hard-coded colours and fonts inside a card must be replaced with the shared variables for full integration.

Camera images, logos, map tiles, artwork, 3D materials, and physical light-colour swatches are independent assets/data and are not recoloured by this system. Larger text may require scrolling depending on the card layout.

## Customize palettes

Edit the `palettes` object in `yanke-appearance.js`. Each array contains:

```text
[page background, card surface, raised surface, main text, secondary text, accent, text on accent]
```

When adding or renaming a palette, also update the palette helper options and `descriptions`. Add any new light palette to the light-mode selection in `apply()` so its status colours and native controls use the light variants. Font stacks live in `fonts`; keep the font helper options aligned if you change their names.

After editing a file-based resource, increase its version query parameter and refresh clients. Changes to helper selections do not require a resource reload.

## Verify

From this folder, run:

```sh
node --check yanke-appearance.js
node verify.cjs
```

The verification checks all ten palettes, 150 font/size combinations, missing-helper defaults, and settings service targets. Main, secondary, and accent text against the three defined surfaces each meets 4.5:1 contrast; the minimum for these pairs is 4.92:1. Button text against its accent background also passes 4.5:1. These checks cover palette tokens, not arbitrary images, disabled controls, or third-party styling.

## Removal

Restore or remove the appearance hooks in dependent cards before removing the module. Then remove the Appearance card/dashboard and resource through Home Assistant's UI. Remove the three helpers only after checking that nothing else uses them.

Private dashboard snapshots, deployment payloads, household entity mappings, and screenshots are not included in this folder.
