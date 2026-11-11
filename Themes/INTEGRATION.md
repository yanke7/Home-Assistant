# Custom-card integration

The resource exposes `window.YankeAppearance`. Its settings are read from the `hass` object supplied by Home Assistant. No separate subscription, polling, or theme automation is required.

## Lifecycle

Merge these methods into your existing custom card; preserve its existing rendering, update, and cleanup logic. Register the readiness listener before applying so resource loading order does not matter. Call `apply()` before rendering and on every `hass` update.

```js
constructor() {
  super();
  this.attachShadow({ mode: 'open' });
  this._appearanceReady = () => {
    if (this.isConnected && this._hass) {
      window.YankeAppearance?.apply(this, this._hass);
    }
  };
}

connectedCallback() {
  window.addEventListener('yanke-appearance-ready', this._appearanceReady);
  this._appearanceReady();
  // Keep existing connectedCallback work here.
}

set hass(hass) {
  this._hass = hass;
  window.YankeAppearance?.apply(this, hass);
  // Keep existing render/update work here.
}

disconnectedCallback() {
  window.removeEventListener('yanke-appearance-ready', this._appearanceReady);
  window.YankeAppearance?.releaseViewport(this);
  // Keep existing disconnectedCallback cleanup here.
}
```

## CSS contract

Use variables in the card's own shadow-root stylesheet. Give fallback values so the card remains readable before the shared resource loads:

```css
:host {
  display: block;
  color: var(--yanke-text, #f1f5eb);
  font-family: var(--yanke-font, system-ui, sans-serif);
  color-scheme: var(--yanke-scheme, dark);
}
.page { background: var(--yanke-bg, #101611); }
.card { background: var(--yanke-surface, #1b251c); }
.raised { background: var(--yanke-raised, #28372a); }
.secondary { color: var(--yanke-muted, #bdcbb8); }
p { font-size: calc(14px * var(--yanke-scale, 1)); }
h2 { font-size: calc(22px * var(--yanke-scale, 1)); }
button {
  font: inherit;
  background: var(--yanke-accent, #d0e997);
  color: var(--yanke-on-accent, #16200d);
}
button:focus-visible {
  outline: 2px solid var(--yanke-accent, #d0e997);
  outline-offset: 3px;
}
```

Additional tokens: `--yanke-line`, `--yanke-shadow`, `--yanke-success`, `--yanke-warning`, `--yanke-danger`, and `--yanke-chart-pink`. Use status colours for their semantic purpose and always retain text/icon labels for state meaning.

`apply()` also sets native HA text, accent, surface, and font variables on the card host, allowing embedded cards that respect these variables to inherit the settings. A child card's own explicit styles can still override inheritance.

## API

- `apply(host, hass)`: apply current selections as host CSS variables; repeated unchanged selections are inexpensive.
- `selection(hass)`: return validated `{palette, font, size}` with defaults.
- `palettes`, `fonts`, `ids`: shared palette definitions, font stacks, and helper IDs.
- `fitViewport(host)` / `releaseViewport(host)`: optional viewport measurement and cleanup. Measurement is restricted to the four card tags in `viewportCards`; other cards keep ordinary scrolling. A participating card consumes `--yanke-available-height` and may use the `data-yanke-short` attribute. Always release the observer when disconnected.

## Testing integration

Check a dark palette and a light palette, then change fonts and text size while the card stays open. Verify visible labels, selected buttons, switch knobs, charts, native embedded cards, and dialogs. Test the largest text setting on a narrow screen. Keep contrast checks alongside the palette definitions when changing colours.
