# Main Dashboard card (Yanke Pulse)

A hero card for a Home Assistant dashboard. Read-only: taps open an entity's detail popup or jump to another dashboard, and never switch a device.

- Sky follows the real sun: night, dawn, day and dusk
- Moon drawn in its current phase, with a phase label on wide screens
- Stars on clear nights, snow and rain when the weather says so, drifting cloud when overcast
- Large clock, time-of-day greeting and date
- One-line status headline plus pills for alarm, front door, entryways, lighting and indoor temperature

## Files

- `yanke-pulse-card.js`: the card
- `preview.html`: a local test page with mock data (`?s=night|snow|day|dusk|rain`, `&p=Moss|Linen|Indigo`)

## Install

1. Copy `yanke-pulse-card.js` to `/config/www/` on Home Assistant.
2. Add it under Settings → Dashboards → Resources as a JavaScript module: `/local/yanke-pulse-card.js`.
3. Add a card with `type: custom:yanke-pulse-card`.

Entity IDs and the two dashboard links are set at the top of the file (`E` and `NAV`); change them to match your own setup.
