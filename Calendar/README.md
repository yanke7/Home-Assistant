# Yanke Planner

A compact Home Assistant dashboard built around [Calendar Card Pro](https://github.com/alexpfau/calendar-card-pro), with an olive/lime theme and an **Up next** panel.

## Features

- Multiple calendar sources, each with its own color and icon.
- Shared calendar configuration for the main calendar and Up next.
- Calendar filters, date navigation, and list/column/time-grid views supplied by Calendar Card Pro.
- Duplicate event filtering for overlapping feeds.
- Responsive default layout designed to fit one screen. Agenda mode shows up to three events across seven days; busy calendars, alternate views, text scaling, or smaller screens may need more room.
- Up next searches 60 days ahead and includes ongoing events.
- Event details and supported editing actions depend on calendar permissions.

## Install

1. Install **Calendar Card Pro v5.1 or compatible** using Home Assistant Marketplace/HACS. Its JavaScript resource must be registered and loaded.
2. Copy `yanke-planner-card.js` to `/config/www/yanke-planner-card.js`.
3. In **Settings → Dashboards → Resources**, add `/local/yanke-planner-card.js?v=1` as a **JavaScript module**. Resource settings may require Advanced Mode in your profile.
4. Create a dashboard and use the contents of `dashboard.example.json` in its raw configuration editor (JSON is valid YAML).
5. Replace the example `calendar.*` entities with entities from your own installation. These are placeholders, not supplied calendars.
6. Reload the browser. Increase the resource URL version after later updates.

The resource uses Home Assistant's card helpers to create Calendar Card Pro instances; it does not bundle third-party card code.

## Google Calendar

Connect the official [Google Calendar integration](https://www.home-assistant.io/integrations/google/), complete OAuth authorization, then add the resulting entities to the card's `entities` array. Both panels use that array. Existing calendars refresh through Home Assistant; newly imported calendars must be added to the configuration.

Never put OAuth secrets, tokens, or private event data in dashboard files or this repository.

## Customize

- Edit each entity's `name`, `accent_color`, and `label` in the example configuration.
- The Home link currently targets `/dashboard-home2/home`; replace it with your dashboard's path if needed. The original calendar link targets `/calendar`.
- Dates use Home Assistant's configured timezone, with America/Regina as a fallback.
- The public module includes dark olive theme fallbacks. If an optional `window.YankeAppearance` controller is installed, its CSS variables can override those defaults.
- The built-in calendar toolbar includes an action to add another Google account.

## Files

- `yanke-planner-card.js`: custom dashboard card.
- `dashboard.example.json`: configuration with sample calendar entities.

The example omits private account identifiers, home addresses, local network URLs, runtime logs, and installation-specific backups. Installing this example does not create or modify calendar events.
