/* Almanac: a self-contained sky instrument for Home Assistant.
   Read-only. Computes sun and moon from the home location; calls no services and needs no entities. */
(() => {
const R = Math.PI / 180, DAY = 864e5, STEP = 12e4, OBL = R * 23.4397;
const days = t => t / DAY - 0.5 + 2440588 - 2451545;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const sunC = d => { const M = R * (357.5291 + 0.98560028 * d), L = M + R * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + R * 102.9372 + Math.PI; return { ra: ra(L, 0), dec: dec(L, 0) }; };
const moonC = d => { const L = R * (218.316 + 13.176396 * d), M = R * (134.963 + 13.064993 * d), F = R * (93.272 + 13.22935 * d), l = L + R * 6.289 * Math.sin(M), b = R * 5.128 * Math.sin(F); return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) }; };
function place(c, t, lat, lon) {
  const phi = R * lat, H = R * (280.16 + 360.9856235 * days(t)) + R * lon - c.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI;
  const pa = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
  return { alt: alt / R, az: ((az / R) % 360 + 360) % 360, pa };
}
const sunAt = (t, la, lo) => place(sunC(days(t)), t, la, lo);
const moonAt = (t, la, lo) => { const c = moonC(days(t)), p = place(c, t, la, lo); p.alt -= 0.95 * Math.cos(p.alt * R); p.dist = c.dist; return p; };
function illum(t) {
  const d = days(t), s = sunC(d), m = moonC(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { f: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI, ang };
}
const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
function phaseName(p) {
  for (let i = 0; i < 4; i++) { const d = Math.abs(p - i / 4); if (Math.min(d, 1 - d) < 0.018) return NAMES[i * 2]; }
  return NAMES[Math.floor(p * 4) * 2 + 1];
}
const P16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const P8 = ['northern', 'north-eastern', 'eastern', 'south-eastern', 'southern', 'south-western', 'western', 'north-western'];
const SKY = [[-18, [8, 12, 30]], [-12, [24, 32, 78]], [-6, [82, 66, 128]], [-1, [226, 128, 92]], [4, [245, 190, 120]], [12, [122, 178, 236]], [90, [96, 160, 232]]];
function skyColor(a) {
  if (a <= SKY[0][0]) return `rgb(${SKY[0][1]})`;
  for (let i = 1; i < SKY.length; i++) if (a <= SKY[i][0]) { const [a0, c0] = SKY[i - 1], [a1, c1] = SKY[i], k = (a - a0) / (a1 - a0); return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k))})`; }
  return `rgb(${SKY[SKY.length - 1][1]})`;
}
const MARIA = '<ellipse cx="-17" cy="-24" rx="14" ry="12"/><circle cx="10" cy="-21" r="9"/><ellipse cx="21" cy="-5" rx="11" ry="9"/><circle cx="37" cy="-15" r="5"/><ellipse cx="-32" cy="-2" rx="11" ry="17"/><ellipse cx="-11" cy="23" rx="10" ry="8"/><circle cx="31" cy="10" r="6"/><circle cx="-28" cy="22" r="5"/>';
let uid = 0;
function moonSvg(px, f, rot, detail) {
  const id = 'alm' + (++uid), k = 1 - 2 * f;
  const lit = `M0,-50A50,50 0 0 1 0,50A${(Math.abs(k) * 50).toFixed(2)},50 0 0 ${k > 0 ? 0 : 1} 0,-50Z`;
  return `<svg viewBox="-54 -54 108 108" width="${px}" height="${px}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${lit}"/></clipPath></defs><circle r="50" fill="var(--moon-dark)"/><g transform="rotate(${rot.toFixed(1)})"><g clip-path="url(#${id})"><circle r="50" fill="var(--moon-lit)"/>${detail ? `<g transform="rotate(${(-rot).toFixed(1)})" fill="var(--moon-mare)">${MARIA}</g>` : ''}</g></g><circle r="50" fill="none" stroke="var(--moon-rim)" stroke-width="${detail ? 0.6 : 2}"/></svg>`;
}

const CSS = `
:host{display:block;color-scheme:dark;container-type:inline-size}
*{box-sizing:border-box}
.shell{--serif:ui-serif,"New York","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
 position:relative;overflow:hidden;min-height:calc(100dvh - var(--header-height,56px));padding:clamp(16px,2.4vw,34px) clamp(14px,3vw,44px) 28px;
 font-family:var(--sans);color:var(--ink);background:linear-gradient(180deg,var(--bg1),var(--bg2) 62%,var(--bg3));font-variant-numeric:tabular-nums}
.shell[data-sky=night]{--bg1:#04060d;--bg2:#080d1d;--bg3:#0e1630;--ink:#eceff8;--mute:#929cb8;--line:#ffffff1f;--panel:#ffffff0a;--sun:#ffb454;--moon:#d9e2f5;--moon-lit:#f3efe2;--moon-dark:#1a2136;--moon-mare:#8d8a8055;--moon-rim:#ffffff30;--glow:#cfdcff40;--stars:.9}
.shell[data-sky=twilight]{--bg1:#0a1030;--bg2:#2a2757;--bg3:#6b4468;--ink:#f3f0fa;--mute:#b6b1d3;--line:#ffffff26;--panel:#0a0c2455;--sun:#ffbd74;--moon:#e4e8f8;--moon-lit:#f5f1e6;--moon-dark:#232547;--moon-mare:#8d8a8055;--moon-rim:#ffffff35;--glow:#dfe4ff38;--stars:.45}
.shell[data-sky=golden]{--bg1:#22346b;--bg2:#8b5273;--bg3:#e79158;--ink:#fff8f0;--mute:#f1dcd4;--line:#ffffff33;--panel:#160f2e66;--sun:#ffd08a;--moon:#f1f1fa;--moon-lit:#fffaf0;--moon-dark:#ffffff1c;--moon-mare:#a59a9044;--moon-rim:#ffffff55;--glow:#fff0d030;--stars:0}
.shell[data-sky=day]{color-scheme:light;--bg1:#86b9ea;--bg2:#b9d7f3;--bg3:#e4eff9;--ink:#0b1b35;--mute:#3a5275;--line:#0b1b3526;--panel:#ffffff73;--sun:#c2570a;--moon:#4f6187;--moon-lit:#ffffff;--moon-dark:#3f578233;--moon-mare:#9fb3cf66;--moon-rim:#3f578280;--glow:#ffffff00;--stars:0}
.stars{position:absolute;inset:0;pointer-events:none;opacity:var(--stars);transition:opacity .6s}
.stars i{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff}
main{position:relative;max-width:1680px;margin:auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute)}
.top a{color:inherit;text-decoration:none;padding:8px 0 8px 12px;cursor:pointer}
.top a:hover{color:var(--ink)}
a:focus-visible,button:focus-visible,.chart:focus-visible{outline:2px solid var(--sun);outline-offset:3px;border-radius:6px}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(26px,3.3vw,46px);line-height:1.12;letter-spacing:-.015em;margin:clamp(14px,2vw,26px) 0 6px;max-width:26ch;text-wrap:balance}
h1 em{font-style:normal;white-space:nowrap;color:var(--sun)}h1 em.m{color:var(--moon)}
.sub{color:var(--mute);font-size:13px;margin:0 0 clamp(14px,1.8vw,22px)}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:30px;margin-bottom:6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.key{display:flex;gap:16px}.key span::before{content:"";display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:7px;vertical-align:middle;background:var(--sun)}.key span.m::before{background:var(--moon)}
.live{display:flex;align-items:center;gap:8px}.live::before{content:"";width:7px;height:7px;border-radius:50%;background:#4ade80}
.live.off::before{background:var(--sun)}
button{font:inherit;letter-spacing:inherit;text-transform:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:6px 12px;cursor:pointer}
.chart{position:relative;touch-action:pan-y;cursor:ew-resize;user-select:none;-webkit-user-select:none;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.chart svg{display:block;width:100%}
.chart text{font-family:var(--sans);font-size:11px;fill:var(--mute)}
.hint{font-size:11px;color:var(--mute);margin:8px 0 0}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:clamp(16px,2vw,26px)}
.p{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:20px 20px 18px;min-width:0}
.lab{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin:0 0 12px}
.big{font-family:var(--serif);font-size:clamp(40px,4vw,58px);line-height:1;letter-spacing:-.02em}
.big.s{color:var(--sun)}
.cap{color:var(--mute);font-size:13px;margin:8px 0 16px}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;border-top:1px solid var(--line);padding-top:14px;margin:0}
.stats div{min-width:0}.stats dt{font-size:11px;color:var(--mute);margin-bottom:3px}.stats dd{margin:0;font-size:16px}.stats small{color:var(--mute);font-size:11px}
.moonrow{display:flex;align-items:center;gap:18px;margin-bottom:16px}
.moonrow svg{flex:none;filter:drop-shadow(0 0 16px var(--glow))}
.moonrow .name{font-family:var(--serif);font-size:clamp(22px,2vw,28px);line-height:1.1}
.moonrow .cap{margin:6px 0 0}
.map{display:block;width:100%;max-width:300px;margin:0 auto}
.map text{font-family:var(--sans);font-size:11px;fill:var(--mute)}
.next{list-style:none;margin:0 0 14px;padding:0}
.next li{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:14px}
.next li span{flex:1;min-width:0}.next li small{color:var(--mute);font-size:12px;white-space:nowrap}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:8px 2px;border-top:1px solid var(--line);padding-top:14px}
.cal div{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:var(--mute);padding:3px 0;border-radius:8px}
.cal div.t{color:var(--ink);box-shadow:inset 0 0 0 1px var(--line);background:var(--panel)}
.cal div.k{color:var(--ink);font-weight:600}
@container(min-width:1100px){@media(min-height:680px){
.shell{height:calc(100dvh - var(--header-height,56px));min-height:0;padding:14px clamp(16px,2.2vw,36px) 16px}
main{height:100%;display:flex;flex-direction:column}
h1{font-size:clamp(22px,2.3vw,34px);max-width:none;margin:8px 0 4px}
.sub{margin:0 0 6px}.hint{display:none}
.chart{flex:1 1 0;min-height:130px}#plot{position:absolute;inset:0}
.grid{flex:none;margin-top:12px;gap:12px}
.p{padding:14px 16px;border-radius:16px}.lab{margin-bottom:8px}.big{font-size:40px}.cap{margin:5px 0 10px}
.stats{gap:7px 12px;padding-top:10px}.stats dd{font-size:14px}
.moonrow{margin-bottom:10px}.moonrow svg{width:84px;height:84px}
.map{max-width:190px}#map .cap{display:none}
.next{margin-bottom:8px}.next li{padding:3px 0;font-size:12.5px;gap:8px}.next li span{white-space:nowrap}.next li small{font-size:11px}
.cal{gap:3px 2px;padding-top:8px}.cal svg{width:19px;height:19px}.cal div{padding:2px 0;gap:1px}
}}
@container(max-width:1099px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container(max-width:640px){.grid{grid-template-columns:1fr}.key{display:none}.top{font-size:10px;letter-spacing:.12em}.p{padding:18px 16px}}
@media(prefers-reduced-motion:reduce){.stars{transition:none}}
`;

class AlmanacSky extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); this.cache = new Map(); this.scrub = null; this.W = 0; }
  setConfig(c) { this.config = c || {}; }
  getCardSize() { return 14; }
  set hass(h) {
    const key = [h.config.latitude, h.config.longitude, h.config.time_zone, h.locale?.language, h.locale?.time_format].join();
    this._hass = h;
    if (key !== this.key) { this.key = key; this.cache.clear(); this.cycleKey = null; this.init(); }
  }
  connectedCallback() { this.timer = setInterval(() => { if (this.scrub == null) this.draw(); }, 30000); if (this.key) this.init(); }
  disconnectedCallback() { clearInterval(this.timer); this.ro?.disconnect(); }

  init() {
    const h = this._hass; if (!h || !this.isConnected) return;
    this.lat = h.config.latitude; this.lon = h.config.longitude; this.tz = h.config.time_zone;
    const lang = h.locale?.language || 'en', tf = h.locale?.time_format, h12 = tf === '24' ? false : tf === '12' ? true : undefined;
    const F = o => new Intl.DateTimeFormat(lang, { timeZone: this.tz, ...o });
    this.fT = F({ hour: 'numeric', minute: '2-digit', hour12: h12 }); this.fH = F({ hour: 'numeric', hour12: h12 });
    this.fD = F({ weekday: 'long', month: 'long', day: 'numeric' }); this.fS = F({ weekday: 'short', month: 'short', day: 'numeric' });
    this.fN = F({ day: 'numeric' }); this.fM = F({ month: 'short', day: 'numeric' });
    this.fP = new Intl.DateTimeFormat('en-US', { timeZone: this.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const stars = Array.from({ length: 70 }, () => `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 70).toFixed(1)}%;opacity:${(0.25 + rnd() * 0.7).toFixed(2)}${rnd() > 0.8 ? ';width:3px;height:3px' : ''}"></i>`).join('');
    const ns = this.lat >= 0 ? 'N' : 'S', ew = this.lon >= 0 ? 'E' : 'W';
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="shell" data-sky="night"><div class="stars">${stars}</div><main>
<div class="top"><span>Almanac · ${Math.abs(this.lat).toFixed(2)}° ${ns} · ${Math.abs(this.lon).toFixed(2)}° ${ew}</span><a id="home" href="${this.config.home_path || '/dashboard-home2/home'}">← Home</a></div>
<h1 id="head"></h1><p class="sub" id="sub"></p>
<div class="bar"><div class="key"><span>Sun</span><span class="m">Moon</span></div><div class="live" id="live"></div></div>
<div class="chart" id="chart" tabindex="0" role="slider" aria-label="Time of day. Drag or use arrow keys to preview the sky; Escape returns to now."><div id="plot"></div></div>
<p class="hint">Drag across the day to see the sky at any hour.</p>
<div class="grid"><section class="p" id="sun"></section><section class="p" id="moon"></section><section class="p" id="map"></section><section class="p" id="cycle"></section></div>
</main></div>`;
    const $ = id => this.shadowRoot.getElementById(id);
    $('home').addEventListener('click', e => { e.preventDefault(); history.pushState(null, '', e.currentTarget.getAttribute('href')); window.dispatchEvent(new CustomEvent('location-changed')); });
    const chart = $('chart');
    const seek = e => { const r = chart.getBoundingClientRect(), k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); this.scrub = this.dayStart(Date.now()) + Math.round(k * 288) * 3e5; this.draw(); };
    chart.addEventListener('pointerdown', e => { chart.setPointerCapture(e.pointerId); this.drag = true; seek(e); });
    chart.addEventListener('pointermove', e => { if (this.drag) seek(e); });
    const end = () => { this.drag = false; };
    chart.addEventListener('pointerup', end); chart.addEventListener('pointercancel', end);
    chart.addEventListener('keydown', e => {
      const d0 = this.dayStart(Date.now()), step = { ArrowLeft: -6e5, ArrowRight: 6e5, PageDown: -36e5, PageUp: 36e5 }[e.key];
      if (step) { e.preventDefault(); this.scrub = Math.min(d0 + DAY, Math.max(d0, (this.scrub ?? Math.round(Date.now() / 6e5) * 6e5) + step)); this.draw(); }
      else if (e.key === 'Escape' && this.scrub != null) { this.scrub = null; this.draw(); }
    });
    $('live').addEventListener('click', e => { if (e.target.closest('button')) { this.scrub = null; this.draw(); chart.focus(); } });
    this.ro?.disconnect();
    this.ro = new ResizeObserver(en => { const w = Math.round(en[0].contentRect.width), hh = Math.round(en[0].contentRect.height); if (w && (w !== this.W || hh !== this.Hc)) { this.W = w; this.Hc = hh; this.draw(); } });
    this.ro.observe(chart);
  }

  dayStart(t) {
    const p = {}; for (const x of this.fP.formatToParts(new Date(t))) p[x.type] = +x.value;
    const off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
    return Math.floor((t + off) / DAY) * DAY - off;
  }
  day(d0) {
    let d = this.cache.get(d0); if (d) return d;
    const n = DAY / STEP, t = [], sa = [], ma = [], sz = [], mz = [];
    for (let i = 0; i <= n; i++) { const x = d0 + i * STEP, s = sunAt(x, this.lat, this.lon), m = moonAt(x, this.lat, this.lon); t.push(x); sa.push(s.alt); sz.push(s.az); ma.push(m.alt); mz.push(m.az); }
    const cross = (a, thr) => { const o = []; for (let i = 1; i < a.length; i++) { const p = a[i - 1] - thr, q = a[i] - thr; if ((p < 0) !== (q < 0)) o.push({ t: t[i - 1] + STEP * p / (p - q), up: q >= 0 }); } return o; };
    const first = (l, up) => l.find(e => e.up === up)?.t, last = (l, up) => [...l].reverse().find(e => e.up === up)?.t;
    const h = cross(sa, -0.833), c = cross(sa, -6), g = cross(sa, 6);
    let ni = 0; sa.forEach((v, i) => { if (v > sa[ni]) ni = i; });
    d = { d0, t, sa, ma, sz, mz, rise: first(h, true), set: last(h, false), dawn: first(c, true), dusk: last(c, false), golden: last(g, false), noon: t[ni], noonAlt: sa[ni], moonEv: cross(ma, -0.833) };
    d.len = d.rise && d.set ? d.set - d.rise : null;
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(d0, d); return d;
  }
  dur(ms) { const m = Math.round(Math.abs(ms) / 6e4), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} m` : `${m} m`; }
  tm(t) { return t ? this.fT.format(t) : '—'; }
  dayTag(t, d0) { const n = Math.round((this.dayStart(t) - d0) / DAY); return n === 1 ? 'tomorrow' : n > 1 ? this.fS.format(t) : ''; }

  draw() {
    const root = this.shadowRoot, $ = id => root.getElementById(id); if (!$('plot')) return;
    const now = Date.now(), T = this.scrub ?? now, d0 = this.dayStart(now), D = this.day(d0);
    const s = sunAt(T, this.lat, this.lon), m = moonAt(T, this.lat, this.lon), il = illum(T), name = phaseName(il.phase);
    root.querySelector('.shell').dataset.sky = s.alt > 6 ? 'day' : s.alt > -4 ? 'golden' : s.alt > -12 ? 'twilight' : 'night';
    const mEv = [...D.moonEv, ...this.day(d0 + DAY).moonEv, ...this.day(d0 + 2 * DAY).moonEv].filter(e => e.t > T);
    const mRise = mEv.find(e => e.up)?.t, mSet = mEv.find(e => !e.up)?.t;
    const mRose = [...this.day(d0 - DAY).moonEv, ...D.moonEv].filter(e => e.up && e.t <= T).pop()?.t;
    const sunUp = s.alt > -0.833, moonUp = m.alt > -0.833, pct = Math.round(il.f * 100);
    const full = /moon|quarter/.test(name) ? name.toLowerCase().replace('quarter', 'quarter moon') : name.toLowerCase() + ' moon';

    // headline
    let a;
    if (sunUp && D.set) a = `The sun is up for another <em>${this.dur(D.set - T)}</em>.`;
    else if (D.rise && T < D.rise) a = `Sunrise in <em>${this.dur(D.rise - T)}</em>.`;
    else if (D.set) a = `The sun set <em>${this.dur(T - D.set)}</em> ago.`;
    else a = sunUp ? 'The sun stays up all day.' : 'The sun stays down all day.';
    const tag = mRise ? this.dayTag(mRise, d0) : '';
    const b = moonUp ? `The ${full} is in the <em class="m">${P8[Math.round(m.az / 45) % 8]} sky</em>.`
      : mRise ? `The ${full} rises at <em class="m">${this.tm(mRise)}</em>${tag ? ' ' + tag : ''}.` : `The ${full} stays below the horizon.`;
    $('head').innerHTML = `${a} ${b}`;
    $('sub').textContent = `${this.fD.format(T)} · ${this.tm(T)}`;
    $('live').className = 'live' + (this.scrub == null ? '' : ' off');
    $('live').innerHTML = this.scrub == null ? 'Live' : `Preview ${this.tm(T)} <button type="button">Back to now</button>`;
    $('chart').setAttribute('aria-valuetext', this.tm(T));

    this.plot(D, T, s, m);

    // sun
    const Y = this.day(d0 - DAY), diff = D.len != null && Y.len != null ? D.len - Y.len : null;
    const ds = diff == null ? '—' : `${diff < 0 ? '−' : '+'}${Math.floor(Math.abs(diff) / 6e4)} m ${Math.round(Math.abs(diff) % 6e4 / 1e3)} s`;
    const st = (k, v, x) => `<div><dt>${k}</dt><dd>${v}${x ? ` <small>${x}</small>` : ''}</dd></div>`;
    const deg = v => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°`;
    $('sun').innerHTML = `<p class="lab">Sun</p><div class="big s">${deg(s.alt)}</div>
<p class="cap">${sunUp ? 'above' : 'below'} the horizon · ${P16[Math.round(s.az / 22.5) % 16]} ${Math.round(s.az)}°</p>
<dl class="stats">${st('Sunrise', this.tm(D.rise))}${st('Sunset', this.tm(D.set))}${st('First light', this.tm(D.dawn))}${st('Last light', this.tm(D.dusk))}${st('Solar noon', this.tm(D.noon), `${D.noonAlt.toFixed(0)}° high`)}${st('Golden hour', this.tm(D.golden))}${st('Daylight', D.len == null ? '—' : this.dur(D.len))}${st('Since yesterday', ds)}</dl>`;

    // moon
    const rot = -((il.ang - m.pa) / R) - 90;
    $('moon').innerHTML = `<p class="lab">Moon</p><div class="moonrow">${moonSvg(118, il.f, rot, true)}<div><div class="name">${name}</div><p class="cap">${pct}% lit · ${il.phase < 0.5 ? 'waxing' : 'waning'}</p></div></div>
<dl class="stats">${st('Altitude', deg(m.alt), moonUp ? 'up' : 'down')}${st('Direction', `${P16[Math.round(m.az / 22.5) % 16]} ${Math.round(m.az)}°`)}${moonUp && mRose ? st('Rose', this.tm(mRose), mRose < d0 ? 'yesterday' : '') : st('Rises', this.tm(mRise), mRise ? this.dayTag(mRise, d0) : '')}${st('Sets', this.tm(mSet), mSet ? this.dayTag(mSet, d0) : '')}${st('Age', `${(il.phase * 29.53).toFixed(1)} days`)}${st('Distance', `${Math.round(m.dist / 100) * 100 >= 1e3 ? (Math.round(m.dist / 100) * 100).toLocaleString('en-US') : m.dist} km`)}</dl>`;

    // sky map
    const pt = (alt, az, r = 100) => { const q = (90 - Math.max(0, alt)) / 90 * r; return [q * Math.sin(az * R), -q * Math.cos(az * R)]; };
    const arc = (al, az) => { let d = '', pen = false; for (let i = 0; i < al.length; i += 3) { if (al[i] > 0) { const [x, y] = pt(al[i], az[i]); d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; pen = true; } else pen = false; } return d; };
    const dot = (p, up, col, r) => { const [x, y] = pt(p.alt, p.az); return up ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r + 5}" fill="${col}" opacity=".22"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="2.5 2.5"/>`; };
    $('map').innerHTML = `<p class="lab">Where to look</p><svg class="map" viewBox="-128 -128 256 256" role="img" aria-label="Sky map: sun ${sunUp ? 'up' : 'down'} toward ${P16[Math.round(s.az / 22.5) % 16]}, moon ${moonUp ? 'up' : 'down'} toward ${P16[Math.round(m.az / 22.5) % 16]}">
<circle r="100" fill="none" stroke="var(--ink)" stroke-opacity=".45"/><circle r="66.7" fill="none" stroke="var(--line)"/><circle r="33.3" fill="none" stroke="var(--line)"/><path d="M-100,0H100M0,-100V100" stroke="var(--line)"/>
<text y="-108" text-anchor="middle">N</text><text y="119" text-anchor="middle">S</text><text x="112" y="4" text-anchor="middle">E</text><text x="-112" y="4" text-anchor="middle">W</text>
<path d="${arc(D.sa, D.sz)}" fill="none" stroke="var(--sun)" stroke-width="2" stroke-linecap="round"/><path d="${arc(D.ma, D.mz)}" fill="none" stroke="var(--moon)" stroke-width="2" stroke-linecap="round"/>
${dot(s, sunUp, 'var(--sun)', 6)}${dot(m, moonUp, 'var(--moon)', 5)}</svg>
<p class="cap" style="margin:10px 0 0;text-align:center">Centre is straight overhead; the rim is the horizon. Dashed markers are below it.</p>`;

    if (this.cycleKey !== d0) { this.cycleKey = d0; this.cycle(now, d0); }
  }

  plot(D, T, s, m) {
    const W = this.W; if (!W) return;
    const fit = getComputedStyle(this.shadowRoot.getElementById('plot')).position === 'absolute', H = fit ? Math.max(130, this.Hc || 0) : W < 600 ? 220 : 270, top = 22, bot = H - 24, d0 = D.d0;
    const max = Math.max(20, ...D.sa, ...D.ma) + 8, min = -max * 0.55;
    const x = t => (t - d0) / DAY * W, y = a => top + (max - Math.max(min, Math.min(max, a))) / (max - min) * (bot - top), y0 = y(0);
    const path = a => { let d = ''; for (let i = 0; i < a.length; i += 5) d += `${i ? 'L' : 'M'}${x(D.t[i]).toFixed(1)},${(top + (max - a[i]) / (max - min) * (bot - top)).toFixed(1)}`; return d; };
    const ps = path(D.sa), pm = path(D.ma);
    let stops = ''; for (let i = 0; i <= 48; i++) stops += `<stop offset="${(i / 48 * 100).toFixed(2)}%" stop-color="${skyColor(D.sa[i * 15])}"/>`;
    let ticks = ''; const every = W < 600 ? 6 : 3;
    for (let h = 0; h <= 24; h += every) { const X = h / 24 * W; ticks += `<path d="M${X},${top}V${bot}" stroke="var(--line)" stroke-dasharray="2 5"/>` + (h < 24 ? `<text x="${X + 5}" y="${H - 7}">${this.fH.format(d0 + h * 36e5)}</text>` : ''); }
    const lab = (t, yy, col, txt) => { if (!t) return ''; const X = x(t), end = X > W - 70, start = X < 70; return `<circle cx="${X.toFixed(1)}" cy="${y0}" r="3.5" fill="${col}" stroke="var(--bg2)" stroke-width="1.5"/><text x="${(X + (end ? -6 : start ? 6 : 0)).toFixed(1)}" y="${yy}" text-anchor="${end ? 'end' : start ? 'start' : 'middle'}" style="fill:${col}">${txt}</text>`; };
    const mev = D.moonEv.map(e => lab(e.t, y0 + 34, 'var(--moon)', `${e.up ? '↑' : '↓'} ${this.tm(e.t)}`)).join('');
    const X = x(Math.min(d0 + DAY, Math.max(d0, T))), end = X > W - 60, start = X < 60;
    this.shadowRoot.getElementById('plot').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
<defs><linearGradient id="ribbon">${stops}</linearGradient><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient><mask id="fm"><rect width="${W}" height="${y0}" fill="url(#fade)"/></mask>
<clipPath id="up"><rect width="${W}" height="${y0}"/></clipPath><clipPath id="dn"><rect y="${y0}" width="${W}" height="${bot - y0}"/></clipPath></defs>
<rect width="${W}" height="${y0}" fill="url(#ribbon)" mask="url(#fm)" opacity=".38"/>${ticks}
<g clip-path="url(#dn)" fill="none" stroke-width="1.5" stroke-dasharray="3 5" opacity=".55"><path d="${pm}" stroke="var(--moon)"/><path d="${ps}" stroke="var(--sun)"/></g>
<g clip-path="url(#up)"><path d="${pm}V${y0}H0Z" fill="var(--moon)" opacity=".1"/><path d="${ps}V${y0}H0Z" fill="var(--sun)" opacity=".16"/><path d="${pm}" fill="none" stroke="var(--moon)" stroke-width="2.5"/><path d="${ps}" fill="none" stroke="var(--sun)" stroke-width="3"/></g>
<rect y="${y0 - 3}" width="${W}" height="6" rx="3" fill="url(#ribbon)"/>
${lab(D.rise, y0 + 19, 'var(--sun)', `↑ ${this.tm(D.rise)}`)}${lab(D.set, y0 + 19, 'var(--sun)', `↓ ${this.tm(D.set)}`)}${mev}
<path d="M${X.toFixed(1)},${top - 4}V${bot}" stroke="var(--ink)" stroke-width="1.5"/>
<text x="${(X + (end ? -7 : 7)).toFixed(1)}" y="13" text-anchor="${end ? 'end' : 'start'}" style="fill:var(--ink);font-weight:600;letter-spacing:.08em">${this.scrub == null ? 'NOW' : this.tm(T)}</text>
<circle cx="${X.toFixed(1)}" cy="${y(m.alt).toFixed(1)}" r="6" fill="var(--moon)" stroke="var(--bg2)" stroke-width="2"/><circle cx="${X.toFixed(1)}" cy="${y(s.alt).toFixed(1)}" r="7.5" fill="var(--sun)" stroke="var(--bg2)" stroke-width="2"/></svg>`;
  }

  cycle(now, d0) {
    const ev = [], t0 = Math.floor(now / 36e5) * 36e5; let prev = illum(t0).phase;
    for (let i = 1; i <= 24 * 31 && ev.length < 4; i++) {
      const t = t0 + i * 36e5, p = illum(t).phase;
      for (let q = 0; q < 4; q++) { const a = ((prev - q / 4) % 1 + 1.5) % 1 - 0.5, b = ((p - q / 4) % 1 + 1.5) % 1 - 0.5; if (a < 0 && b >= 0 && b - a < 0.2) ev.push({ t: t - 36e5 + 36e5 * a / (a - b), q }); }
      prev = p;
    }
    const keyDays = new Map(ev.map(e => [this.dayStart(e.t), e.q]));
    const when = t => { const n = Math.round((this.dayStart(t) - d0) / DAY); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
    const list = ev.map(e => `<li>${moonSvg(22, [0, 0.5, 1, 0.5][e.q], e.q === 3 ? 180 : 0)}<span>${NAMES[e.q * 2]}</span><small>${this.fS.format(e.t)} · ${when(e.t)}</small></li>`).join('');
    let cal = '';
    for (let i = 0; i < 28; i++) { const d = d0 + i * DAY, il = illum(d + DAY / 2), n = this.fN.format(d + DAY / 2); cal += `<div class="${i ? '' : 't'}${keyDays.has(d) ? ' k' : ''}" title="${this.fS.format(d + DAY / 2)}: ${phaseName(il.phase)}, ${Math.round(il.f * 100)}% lit">${moonSvg(24, il.f, il.phase < 0.5 ? 0 : 180)}<span>${n === '1' ? this.fM.format(d + DAY / 2) : n}</span></div>`; }
    this.shadowRoot.getElementById('cycle').innerHTML = `<p class="lab">The next four weeks</p><ul class="next">${list}</ul><div class="cal">${cal}</div>`;
  }
}
if (!customElements.get('almanac-sky-card')) customElements.define('almanac-sky-card', AlmanacSky);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'almanac-sky-card', name: 'Almanac Sky', description: 'Self-contained sun and moon instrument with a scrubbable day' });
})();
