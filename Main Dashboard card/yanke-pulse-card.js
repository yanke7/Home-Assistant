/* Yanke Pulse: living hero card. Read-only; taps only open more-info or navigate. */
(() => {
const E = {
 alarm:'alarm_control_panel.qolsys_panel_system', lock:'lock.smart_lock', climate:'climate.hallway_alarm_com_smart_thermostat', sun:'sun.sun',
 weather:['weather.server_set_up_ec_weather_saskatoon_weather','weather.forecast_home'],
 doors:[['Front door','binary_sensor.qolsys_panel_front_door'],['Basement door','binary_sensor.qolsys_panel_basement_door'],['Garage door','binary_sensor.qolsys_panel_garage_door']],
 lights:['switch.quectel_matter_product','light.hallway_hallway','light.office_office_light','light.bedroom_smart_led_classic_a19_cri90','light.outside_entrance_way','light.driveway_floodlight','light.outside_outside_light','light.smart_wi_fi_surge_protector_outlet_2','light.smart_led_strip_5dd0','light.smart_led_strip_6ed4','switch.love_lamp']
};
const NAV = {lights:'/dashboard-light2/lights', weather:'/dashboard-weather2/home'};
const WX = {
 'clear-night':['clear','weather-night','Clear'], sunny:['clear','weather-sunny','Sunny'], partlycloudy:['clear','weather-partly-cloudy','Partly cloudy'],
 cloudy:['cloud','weather-cloudy','Cloudy'], windy:['cloud','weather-windy','Windy'], 'windy-variant':['cloud','weather-windy-variant','Windy'], fog:['fog','weather-fog','Fog'],
 rainy:['rain','weather-rainy','Rain'], pouring:['rain','weather-pouring','Heavy rain'], lightning:['rain','weather-lightning','Thunder'], 'lightning-rainy':['rain','weather-lightning-rainy','Thunderstorm'],
 snowy:['snow','weather-snowy','Snow'], 'snowy-rainy':['snow','weather-snowy-rainy','Sleet'], hail:['snow','weather-hail','Hail'], exceptional:['cloud','alert-circle-outline','Unusual']
};
const bad = s => !s || ['unknown','unavailable',''].includes(s.state);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const pill = (key,icon,label) => `<button class="pill rise" data-key="${key}" data-tone="idle"><span class="ring"><ha-icon icon="mdi:${icon}"></ha-icon></span><span class="pt"><small>${label}</small><strong data-t="${key}">–</strong></span></button>`;

class YankePulseCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this.parts=[];}
 setConfig(config){this.config=config;}
 getCardSize(){return 6;}
 getGridOptions(){return {columns:'full',min_columns:6};}
 set hass(hass){
  if(window.YankeAppearance)window.YankeAppearance.apply(this,hass);
  else if(!this._waiting){this._waiting=true;window.addEventListener('yanke-appearance-ready',()=>{window.YankeAppearance.apply(this,this._hass);this.seed();},{once:true});}
  this._hass=hass;if(!this.built)this.build();this.update();
 }
 connectedCallback(){this.clock=setInterval(()=>{if(this._hass&&this.built)this.tick();},1000);this.run();}
 disconnectedCallback(){clearInterval(this.clock);cancelAnimationFrame(this.raf);this.raf=0;this.ro?.disconnect();this.ro=null;}
 s(id){return this._hass?.states[id];}
 t(key,value){const n=this.shadowRoot.querySelector(`[data-t="${key}"]`);if(n&&n.textContent!==String(value))n.textContent=value;}
 tone(key,tone){const n=this.shadowRoot.querySelector(`[data-key="${key}"]`);if(n&&n.dataset.tone!==tone)n.dataset.tone=tone;}
 icon(key,name){const n=this.shadowRoot.querySelector(`[data-key="${key}"] ha-icon`);if(n&&n.getAttribute('icon')!=='mdi:'+name)n.setAttribute('icon','mdi:'+name);}
 more(id){this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:id},bubbles:true,composed:true}));}
 go(path){history.pushState(null,'',path);window.dispatchEvent(new CustomEvent('location-changed',{bubbles:true,composed:true}));}

 build(){
  this.built=true;
  this.shadowRoot.innerHTML=`<style>${STYLE}</style>
  <section class="hero" data-sky="night" data-wx="clear" aria-label="Home at a glance">
   <div class="sky"></div><div class="orb"></div><div class="cloud c1"></div><div class="cloud c2"></div><div class="glow"></div><canvas aria-hidden="true"></canvas>
   <div class="eyebrow rise"><span class="mark"></span>YANKE HOME<i></i><span class="dl" data-t="date"></span><span class="ds" data-t="date-s"></span></div>
   <button class="wx rise" data-key="wx" aria-label="Open weather"><ha-icon icon="mdi:weather-cloudy"></ha-icon><strong data-t="wx-temp"></strong><span data-t="wx-label"></span></button>
   <div class="lead">
    <h1 class="rise" data-t="greeting"></h1>
    <p class="headline rise" data-tone="ok"><span class="dot"></span><span data-t="headline"></span></p>
   </div>
   <div class="clock rise" aria-hidden="true"><span data-t="hh"></span><b>:</b><span data-t="mm"></span><small data-t="ap"></small></div>
   <div class="pills">${pill('alarm','shield-outline','Alarm')}${pill('lock','lock-outline','Front door')}${pill('doors','door-closed','Entryways')}${pill('lights','lightbulb-outline','Lighting')}${pill('inside','thermometer','Inside')}</div>
  </section>`;
  this.shadowRoot.querySelectorAll('.rise').forEach((n,i)=>n.style.animationDelay=(80+i*70)+'ms');
  this.shadowRoot.addEventListener('click',e=>{
   const key=e.target.closest('[data-key]')?.dataset.key;if(!key)return;
   if(key==='lights')this.go(NAV.lights);else if(key==='wx')this.go(NAV.weather);
   else if(key==='doors')this.more((E.doors.find(([,id])=>this.s(id)?.state==='on')||E.doors[0])[1]);
   else this.more({alarm:E.alarm,lock:E.lock,inside:E.climate}[key]);
  });
  this.canvas=this.shadowRoot.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
  this.ro=new ResizeObserver(()=>this.seed());this.ro.observe(this.canvas);
  this.run();
 }

 tick(){
  const h=this._hass,tz=h.config?.time_zone,lang=h.locale?.language||'en',tf=h.locale?.time_format,key=[tz,lang,tf].join();
  if(this._fmtKey!==key){
   this._fmtKey=key;const o={hour:'numeric',minute:'2-digit',timeZone:tz};if(tf==='12')o.hour12=true;if(tf==='24')o.hour12=false;
   try{this.fTime=new Intl.DateTimeFormat(lang,o);this.fDate=new Intl.DateTimeFormat(lang,{weekday:'long',month:'long',day:'numeric',timeZone:tz});this.fHour=new Intl.DateTimeFormat('en',{hour:'numeric',hourCycle:'h23',timeZone:tz});}
   catch(e){this.fTime=new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit'});this.fDate=new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'});this.fHour=new Intl.DateTimeFormat('en',{hour:'numeric',hourCycle:'h23'});}
  }
  const now=new Date(),p=Object.fromEntries(this.fTime.formatToParts(now).map(x=>[x.type,x.value]));
  this.t('hh',p.hour);this.t('mm',p.minute);this.t('ap',p.dayPeriod||'');this.t('date',this.fDate.format(now));this.t('date-s',new Intl.DateTimeFormat(lang,{weekday:'short',month:'short',day:'numeric',timeZone:tz}).format(now));
  this.hour=Number(this.fHour.format(now))%24;
  const g=this.hour<5?'Good night':this.hour<12?'Good morning':this.hour<17?'Good afternoon':this.hour<22?'Good evening':'Good night';
  const name=(h.user?.name||'').trim().split(/\s+/);
  this.t('greeting',g+(name.length>1?', '+name[0]:'')+'.');
 }

 update(){
  this.tick();
  const hero=this.shadowRoot.querySelector('.hero'),issues=[];let worst='ok';
  const raise=(tone,text)=>{issues.push(text);if(tone==='bad'||worst==='ok')worst=tone;};

  // Sky follows the real sun; weather sets the mood on top.
  const sun=this.s(E.sun),el=Number(sun?.attributes.elevation);let sky;
  if(Number.isFinite(el))sky=el>8?'day':el<-8?'night':sun.attributes.rising?'dawn':'dusk';
  else sky=this.hour<6||this.hour>=21?'night':this.hour<8?'dawn':this.hour<18?'day':'dusk';
  const w=E.weather.map(id=>this.s(id)).find(x=>!bad(x)),wx=WX[w?.state]||['clear','weather-partly-cloudy',w?w.state:'No weather'];
  if(hero.dataset.sky!==sky||hero.dataset.wx!==wx[0]){hero.dataset.sky=sky;hero.dataset.wx=wx[0];this.seed();}
  hero.style.setProperty('--orb-y',(sky==='night'?16:clamp(74-((Number.isFinite(el)?el:30)+8)*1.05,10,74))+'%');
  this.moon(sky==='night');
  const temp=Number(w?.attributes.temperature);
  this.t('wx-temp',Number.isFinite(temp)?Math.round(temp)+'°':'');this.t('wx-label',wx[2]);
  this.icon('wx',sky==='night'&&w?.state==='sunny'?'weather-night':wx[1]);

  const alarm=this.s(E.alarm),a=alarm?.state;
  if(bad(alarm)){this.t('alarm','Offline');this.tone('alarm','idle');}
  else if(a==='triggered'){this.t('alarm','Triggered');this.tone('alarm','bad');this.icon('alarm','shield-alert-outline');raise('bad','Alarm triggered');}
  else if(a==='disarmed'){this.t('alarm','Disarmed');this.tone('alarm','idle');this.icon('alarm','shield-off-outline');}
  else if(a==='arming'||a==='pending'){this.t('alarm',a==='arming'?'Arming…':'Pending…');this.tone('alarm','warn');this.icon('alarm','shield-outline');}
  else{this.t('alarm',{armed_home:'Armed · Stay',armed_away:'Armed · Away',armed_night:'Armed · Night'}[a]||'Armed');this.tone('alarm','ok');this.icon('alarm','shield-check-outline');}

  const lock=this.s(E.lock),l=lock?.state;
  if(bad(lock)){this.t('lock','Offline');this.tone('lock','idle');}
  else if(l==='locked'){this.t('lock','Locked');this.tone('lock','ok');this.icon('lock','lock-outline');}
  else if(l==='jammed'){this.t('lock','Jammed');this.tone('lock','bad');this.icon('lock','lock-alert-outline');raise('bad','Front door lock is jammed');}
  else if(l==='unlocked'||l==='open'){this.t('lock','Unlocked');this.tone('lock','warn');this.icon('lock','lock-open-variant-outline');raise('warn','Front door is unlocked');}
  else{this.t('lock',l==='locking'?'Locking…':'Unlocking…');this.tone('lock','warn');}

  const open=E.doors.filter(([,id])=>this.s(id)?.state==='on').map(([n])=>n);
  this.t('doors',open.length?open.length+' open':'All closed');this.tone('doors',open.length?'warn':'ok');this.icon('doors',open.length?'door-open':'door-closed');
  if(open.length)raise('warn',open.length===1?open[0]+' is open':open.length+' entryways are open');

  const on=E.lights.filter(id=>this.s(id)?.state==='on').length;
  this.t('lights',on?on+' on':'All off');this.tone('lights',on?'lit':'idle');this.icon('lights',on?'lightbulb-on-outline':'lightbulb-outline');

  const c=this.s(E.climate),cur=Number(c?.attributes.current_temperature),act=c?.attributes.hvac_action;
  this.t('inside',Number.isFinite(cur)?(Math.round(cur*10)/10)+'°'+(act==='heating'?' · heating':act==='cooling'?' · cooling':''):'–');
  this.tone('inside',act==='heating'?'lit':act==='cooling'?'cool':'idle');

  const calm=a&&a.startsWith('armed')?'Armed and all secure.':on?'All secure. '+on+(on===1?' light is':' lights are')+' on.':'Everything is closed up and quiet.';
  this.t('headline',issues.length?issues.join(' · '):calm);
  const head=this.shadowRoot.querySelector('.headline');if(head.dataset.tone!==worst)head.dataset.tone=worst;
 }

 // Real moon phase from the synodic cycle (northern-hemisphere orientation).
 moon(night){
  const orb=this.shadowRoot.querySelector('.orb');if(!night){if(this._moon){this._moon='';orb.innerHTML='';}return;}
  const p=(((Date.now()-947182440000)/2551442877)%1+1)%1,q=p<.5?p:1-p,rx=(Math.abs(Math.cos(2*Math.PI*q))*50).toFixed(1),key=(p<.5?'+':'-')+rx;
  if(this._moon===key)return;this._moon=key;
  orb.innerHTML=`<svg viewBox="-50 -50 100 100"${p<.5?'':' style="transform:scaleX(-1)"'}><path d="M0-50A50 50 0 0 1 0 50A${rx} 50 0 0 ${q<.25?0:1} 0-50Z"/></svg><span>${p<.03||p>.97?'New moon':p<.22?'Waxing crescent':p<.28?'First quarter':p<.47?'Waxing gibbous':p<.53?'Full moon':p<.72?'Waning gibbous':p<.78?'Last quarter':'Waning crescent'} · ${Math.round((1-Math.cos(2*Math.PI*p))*50)}%</span>`;
 }

 // Ambient particles: stars on clear nights, snow and rain when the weather says so.
 seed(){
  const c=this.canvas;if(!c)return;const hero=this.shadowRoot.querySelector('.hero'),d=Math.min(devicePixelRatio||1,2),W=c.clientWidth,H=c.clientHeight;
  if(!W||!H)return;c.width=W*d;c.height=H*d;this.ctx.setTransform(d,0,0,d,0,0);
  const wx=hero.dataset.wx,kind=wx==='snow'||wx==='rain'?wx:hero.dataset.sky==='night'&&wx==='clear'?'stars':'';
  const n=kind?clamp(Math.round(W*H/(kind==='stars'?9000:6500)),20,110):0;
  this.kind=kind;this.parts=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H*(kind==='stars'?.75:1),r:.5+Math.random()*(kind==='snow'?2.1:1.1),v:.25+Math.random()*.8,o:Math.random()*6.28}));
  this.ink=hero.dataset.sky==='day'?'60,80,100':'255,255,255';
  this.draw(performance.now());this.run();
 }
 draw(time){
  const x=this.ctx,c=this.canvas;if(!x)return;const W=c.clientWidth,H=c.clientHeight;x.clearRect(0,0,W,H);
  for(const p of this.parts){
   if(this.kind==='stars'){x.fillStyle=`rgba(${this.ink},${.25+.6*Math.abs(Math.sin(time/1400*p.v+p.o))})`;x.beginPath();x.arc(p.x,p.y,p.r,0,6.28);x.fill();}
   else if(this.kind==='snow'){p.y+=p.v*.6;p.x+=Math.sin(time/1100+p.o)*.35;if(p.y>H+4){p.y=-4;p.x=Math.random()*W;}x.fillStyle=`rgba(${this.ink},${.35+p.r*.2})`;x.beginPath();x.arc(p.x,p.y,p.r,0,6.28);x.fill();}
   else{p.y+=p.v*7+5;p.x-=1.2;if(p.y>H){p.y=-12;p.x=Math.random()*(W+40);}x.strokeStyle=`rgba(${this.ink},.28)`;x.lineWidth=1;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(p.x-2,p.y+11);x.stroke();}
  }
 }
 run(){
  if(this.raf||!this.isConnected||!this.ctx||!this.kind||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const loop=time=>{this.raf=0;if(!this.isConnected||!this.kind)return;if(!document.hidden)this.draw(time);this.raf=requestAnimationFrame(loop);};
  this.raf=requestAnimationFrame(loop);
 }
}

const STYLE = `
:host{display:block;container-type:inline-size;font-family:var(--yanke-font,system-ui,sans-serif);color:var(--tx);color-scheme:var(--yanke-scheme,dark);
 --tx:var(--yanke-text,#f1f5eb);--mu:var(--yanke-muted,#bdcbb8);--ac:var(--yanke-accent,#d0e997);--bg:var(--yanke-bg,#101611);--sf:var(--yanke-surface,#1b251c);--ln:var(--yanke-line,#65776c);--k:var(--yanke-scale,1)}
*{box-sizing:border-box}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:focus-visible{outline:2px solid var(--ac);outline-offset:3px}
.hero{--bg:#0a0f1f;--tx:#f3f5fc;--mu:#b6bfd6;--sf:#171d31;--ln:#7f8bb0;--ac:color-mix(in srgb,var(--yanke-accent,#d0e997) 60%,#fff);--ok:#a6e4b8;--wn:#ffd091;--bd:#ffb5bd;color:var(--tx)}
.hero[data-sky=dawn]{--bg:#1b1936}.hero[data-sky=dusk]{--bg:#1a1230}
.hero[data-sky=day]{--bg:#d9eaf6;--tx:#14222d;--mu:#41566a;--sf:#ffffff;--ln:#8da3b5;--ac:color-mix(in srgb,var(--yanke-accent,#52652c) 55%,#0d2230);--ok:#1f6a3d;--wn:#8a5600;--bd:#a22535}
.hero{position:relative;isolation:isolate;overflow:hidden;border-radius:28px;padding:clamp(20px,3.2cqw,40px);min-height:clamp(300px,40dvh,430px);display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto 1fr auto;gap:14px 28px;background:var(--bg);
 border:1px solid color-mix(in srgb,var(--ln) 45%,transparent);box-shadow:0 26px 60px -28px var(--yanke-shadow,#0008),inset 0 1px 0 color-mix(in srgb,var(--tx) 12%,transparent)}
.sky,.glow,.orb,.cloud,canvas{position:absolute;pointer-events:none}
.sky{inset:0;z-index:-4;transition:background 2s}
[data-sky=night] .sky{background:radial-gradient(110% 90% at 82% 0%,color-mix(in srgb,#5a6dff 30%,var(--bg)),transparent 62%),linear-gradient(180deg,color-mix(in srgb,#0b1238 55%,var(--bg)),var(--bg))}
[data-sky=dawn] .sky{background:radial-gradient(90% 80% at 70% 105%,color-mix(in srgb,#ff9d6c 55%,var(--bg)),transparent 65%),linear-gradient(180deg,color-mix(in srgb,#5f6fd0 38%,var(--bg)),color-mix(in srgb,#ffb38a 30%,var(--bg)))}
[data-sky=day] .sky{background:radial-gradient(80% 90% at 70% 0%,color-mix(in srgb,#ffe7a0 34%,var(--bg)),transparent 60%),linear-gradient(180deg,color-mix(in srgb,#3fa7ff 40%,var(--bg)),color-mix(in srgb,#8fd3ff 14%,var(--bg)))}
[data-sky=dusk] .sky{background:radial-gradient(90% 80% at 70% 105%,color-mix(in srgb,#ff6f4e 55%,var(--bg)),transparent 65%),linear-gradient(180deg,color-mix(in srgb,#45338f 48%,var(--bg)),color-mix(in srgb,#ff9a6b 32%,var(--bg)))}
.hero:not([data-wx=clear]) .sky{filter:saturate(.55) brightness(.92)}
.orb{z-index:-2;left:46%;top:var(--orb-y,16%);width:clamp(64px,9cqw,116px);aspect-ratio:1;border-radius:50%;transition:top 2s,opacity 2s;background:radial-gradient(circle at 38% 36%,#fffbe6,#ffd76e 70%);box-shadow:0 0 70px 26px #ffcf6a55,0 0 160px 70px #ffb84d2e}
[data-sky=night] .orb{background:color-mix(in srgb,#9aa8d0 7%,transparent);box-shadow:none}
.orb span{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:12px;white-space:nowrap;font-size:calc(10px*var(--k));letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
.orb svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 14px #dfe7ffaa)}.orb path{fill:#f4f6fc}
[data-sky=dawn] .orb,[data-sky=dusk] .orb{background:radial-gradient(circle at 40% 38%,#fff1d0,#ff9f5a 72%);box-shadow:0 0 70px 26px #ff8f5a55,0 0 170px 80px #ff6f4e2e}
.hero:not([data-wx=clear]) .orb{opacity:.3;filter:blur(5px)}.hero[data-sky=night]:not([data-wx=clear]) .orb{opacity:.9;filter:none}
.cloud{z-index:-2;display:none;height:46%;width:70%;border-radius:50%;filter:blur(46px);background:color-mix(in srgb,var(--tx) 16%,transparent);animation:drift 46s ease-in-out infinite alternate}
.hero:not([data-wx=clear]) .cloud{display:block}.c1{top:-16%;left:-8%}.c2{top:6%;left:48%;width:62%;height:38%;animation-duration:64s;animation-direction:alternate-reverse}
[data-wx=fog] .cloud{height:80%;top:10%}
.glow{z-index:-2;left:-12%;bottom:-46%;width:58%;aspect-ratio:1.2;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--ac) 30%,transparent),transparent);animation:breathe 11s ease-in-out infinite alternate}
canvas{inset:0;width:100%;height:100%;z-index:-3}
.eyebrow{display:flex;align-items:center;gap:10px;align-self:center;font-size:calc(11px*var(--k));letter-spacing:.22em;font-weight:600;color:var(--mu);white-space:nowrap;min-width:0}
.ds{display:none}.eyebrow [data-t]{letter-spacing:.08em;font-weight:500;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis}
.eyebrow i{width:22px;height:1px;background:color-mix(in srgb,var(--mu) 60%,transparent)}
.mark{width:9px;height:9px;border-radius:3px;background:var(--ac);box-shadow:0 0 14px var(--ac);transform:rotate(45deg)}
.glass,.wx,.pill{background:color-mix(in srgb,var(--sf) 58%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid color-mix(in srgb,var(--tx) 14%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--tx) 10%,transparent)}
.wx{justify-self:end;display:flex;align-items:center;gap:9px;padding:8px 16px 8px 12px;border-radius:999px;font-size:calc(13px*var(--k));color:var(--mu);transition:transform .25s,border-color .25s}
.wx ha-icon{--mdc-icon-size:22px;color:var(--ac)}.wx strong{font-size:calc(17px*var(--k));font-weight:600;color:var(--tx);font-variant-numeric:tabular-nums}.wx strong:empty{display:none}
.lead{align-self:end;min-width:0}
h1{margin:0;font-size:clamp(calc(30px*var(--k)),5.2cqw,calc(62px*var(--k)));font-weight:600;letter-spacing:-.035em;line-height:1.02;text-wrap:balance}
.headline{display:flex;align-items:center;gap:11px;margin:16px 0 0;font-size:clamp(calc(14px*var(--k)),1.5cqw,calc(18px*var(--k)));color:var(--mu);line-height:1.35}
.dot{position:relative;flex:none;width:9px;height:9px;border-radius:50%;background:var(--t);box-shadow:0 0 12px var(--t)}
.clock{align-self:end;display:flex;align-items:baseline;font-size:clamp(64px,13cqw,168px);font-weight:200;letter-spacing:-.05em;line-height:.82;font-variant-numeric:tabular-nums;text-shadow:0 2px 40px color-mix(in srgb,var(--bg) 70%,transparent)}
.clock b{font-weight:200;margin:0 .02em;transform:translateY(-.06em);color:var(--ac);animation:blink 2s steps(1) infinite}
.clock small{font-size:.16em;font-weight:600;letter-spacing:.12em;margin-left:.5em;color:var(--mu);text-transform:uppercase}.clock small:empty{display:none}
.pills{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.pill{position:relative;display:flex;align-items:center;gap:11px;text-align:left;padding:9px 20px 9px 9px;border-radius:999px;flex:1 1 150px;min-width:0;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,background .25s}
@media(hover:hover){.pill:hover,.wx:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--t,var(--ac)) 60%,transparent)}}
.pill:active,.wx:active{transform:scale(.97)}
.ring{position:relative;flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--t);background:color-mix(in srgb,var(--t) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--t) 50%,transparent);transition:color .4s,background .4s}
.ring ha-icon{--mdc-icon-size:21px}
[data-tone=warn] .ring::after,[data-tone=bad] .ring::after,[data-tone=warn]>.dot::after,[data-tone=bad]>.dot::after{content:'';position:absolute;inset:0;border-radius:50%;border:1.5px solid var(--t);animation:ping 2.2s cubic-bezier(.2,.6,.3,1) infinite}
[data-tone=bad] .ring::after,[data-tone=bad]>.dot::after{animation-duration:1.1s}
.pt{min-width:0}.pt small{display:block;font-size:calc(10px*var(--k));letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
.pt strong{display:block;margin-top:2px;font-size:calc(15px*var(--k));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-tone=idle]{--t:var(--mu)}[data-tone=ok]{--t:var(--ok)}[data-tone=warn]{--t:var(--wn)}[data-tone=bad]{--t:var(--bd)}[data-tone=lit]{--t:var(--wn)}[data-tone=cool]{--t:var(--ac)}
[data-tone=lit] .ring{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--t) 50%,transparent),0 0 22px color-mix(in srgb,var(--t) 45%,transparent)}
.rise{animation:rise .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(16px)}}
@keyframes ping{from{transform:scale(1);opacity:.75}to{transform:scale(1.75);opacity:0}}
@keyframes blink{50%{opacity:.35}}
@keyframes drift{from{transform:translateX(-7%)}to{transform:translateX(9%)}}
@keyframes breathe{from{transform:scale(.9);opacity:.6}to{transform:scale(1.12);opacity:1}}
@container (max-width:720px){.dl,.eyebrow i{display:none}.eyebrow{flex-wrap:wrap;row-gap:5px}.ds{display:block;flex-basis:100%}.orb span{display:none}
 .hero{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto auto auto;border-radius:22px;min-height:0;gap:14px}
 .lead{grid-column:1/-1;margin-top:10px}.clock{grid-column:1/-1;grid-row:2;margin-top:22px;font-size:clamp(72px,25cqw,130px)}
 .orb{left:auto;right:9%}.pills{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pill{padding:7px 12px 7px 7px}.pill:last-child{grid-column:1/-1}.ring{width:36px;height:36px}
}
@container (max-width:300px){.eyebrow [data-t]{display:none}}
@media(prefers-reduced-motion:reduce){*,*::after{animation:none!important;transition:none!important}}
`;
if(!customElements.get('yanke-pulse-card'))customElements.define('yanke-pulse-card',YankePulseCard);
window.customCards=window.customCards||[];window.customCards.push({type:'yanke-pulse-card',name:'Yanke Pulse',description:'Living hero: sky, clock and home status at a glance.'});
})();
