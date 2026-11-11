/* Shared appearance contract for all Yanke cards. Settings persist in native HA helpers. */
(() => {
const palettes = {
 Moss:     ['#101611','#1b251c','#28372a','#f1f5eb','#bdcbb8','#d0e997','#16200d'],
 Ocean:    ['#0b1720','#142631','#203b49','#edf7fc','#b5cedb','#7edced','#07262d'],
 Indigo:   ['#111524','#1c2439','#2c3650','#f0f3ff','#bcc8e6','#a9c0ff','#172344'],
 Amethyst: ['#191321','#291f35','#3a2e49','#f8f0ff','#d3bddf','#d9adff','#311443'],
 Rose:     ['#211419','#342129','#49303b','#fff0f4','#e2bdcc','#ffb1ce','#3d1526'],
 Ember:    ['#211610','#33251c','#49362a','#fff4e9','#dec5b2','#ffbb8e','#3c1d0e'],
 Amber:    ['#1c1910','#2d291a','#403b26','#fff8e5','#d9cfad','#f4d77b','#342a0b'],
 Graphite: ['#141619','#22262b','#343a41','#f5f6f8','#c2c9d1','#c6d7ec','#18232e'],
 Linen:    ['#f2eee4','#fffcf5','#e9e0cf','#272820','#53584a','#52652c','#ffffff'],
 Glacier:  ['#eaf1f5','#fafdff','#dce8ef','#182c39','#425d6d','#17647b','#ffffff']
};
const fonts={System:'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',Humanist:'"Avenir Next", Avenir, "Segoe UI", sans-serif',Rounded:'"Trebuchet MS", "Segoe UI", sans-serif',Classic:'Georgia, "Times New Roman", serif',Monospace:'ui-monospace, "SFMono-Regular", Consolas, monospace'};
const ids={palette:'input_select.yanke_colour_palette',font:'input_select.yanke_font_family',size:'input_number.yanke_text_size'};
const descriptions={Moss:'Quiet greens · grounded',Ocean:'Deep teal · calm',Indigo:'Midnight blue · focused',Amethyst:'Soft purple · creative',Rose:'Dusty pink · warm',Ember:'Copper glow · cosy',Amber:'Golden tones · uplifting',Graphite:'Cool neutrals · minimal',Linen:'Warm daylight · light',Glacier:'Clear blue · light'};
function selection(hass){const get=id=>hass?.states?.[id]?.state;return {palette:palettes[get(ids.palette)]?get(ids.palette):'Moss',font:fonts[get(ids.font)]?get(ids.font):'System',size:Math.max(90,Math.min(120,Number(get(ids.size))||100))};}
// Only the four single-screen consoles opt in; long dashboards retain normal scrolling.
const viewportCards=new Set(['yanke-mac-studio','yanke-light2-card','yanke-security-console','yanke-atmosphere-card']);
function fitViewport(host){
 if(!viewportCards.has(host.localName)||!host.isConnected||host._yankeViewport)return;
 let frame=0;
 const ancestors=[];
 for(let el=host.parentElement||host.getRootNode().host;el;el=el.parentElement||el.getRootNode().host)ancestors.push(el);
 const measure=()=>{
  frame=0;if(!host.isConnected)return;
  const vv=window.visualViewport;
  // WKWebView can report CSS viewport units larger than its visible viewport.
  const height=Math.min(...[window.innerHeight,document.documentElement.clientHeight,vv?.height].filter(n=>n>0));
  let top=host.getBoundingClientRect().top;
  // Scrolling must not enlarge the dashboard and create a feedback loop.
  for(const el of ancestors)top+=el.scrollTop||0;
  const bottom=(vv?.offsetTop||0)+height;
  const available=Math.max(0,Math.floor(bottom-Math.max(0,top)));
  if(available>0){host.style.setProperty('--yanke-available-height',available+'px');host.toggleAttribute('data-yanke-short',available<650);}
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
 const observer=new ResizeObserver(schedule);
 observer.observe(host);for(const el of ancestors)observer.observe(el);
 window.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 window.visualViewport?.addEventListener('scroll',schedule);
 host._yankeViewport=()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('orientationchange',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);delete host._yankeViewport;};
 schedule();
}
function releaseViewport(host){host._yankeViewport?.();}

function apply(host,hass){
 fitViewport(host);
 const s=selection(hass),key=JSON.stringify(s);if(host._appearanceKey===key)return;host._appearanceKey=key;
 const p=palettes[s.palette],light=['Linen','Glacier'].includes(s.palette);
 const values={bg:p[0],surface:p[1],raised:p[2],text:p[3],muted:p[4],accent:p[5],'on-accent':p[6],'chart-pink':light?'#893374':'#eda9db',line:light?'#9aa6a5':'#65776c',shadow:light?'#00000018':'#00000035',success:light?'#22633b':'#a6e4b8',warning:light?'#805100':'#ffd091',danger:light?'#a22535':'#ffb5bd',font:fonts[s.font],scale:String(s.size/100),scheme:light?'light':'dark'};
 for(const [k,v] of Object.entries(values))host.style.setProperty('--yanke-'+k,v);
 for(const [k,v] of Object.entries({'primary-text-color':p[3],'secondary-text-color':p[4],'primary-color':p[5],'accent-color':p[5],'ha-card-background':p[1],'card-background-color':p[1],'secondary-background-color':p[2],'ha-font-family-body':fonts[s.font],'ha-font-family-heading':fonts[s.font]}))host.style.setProperty('--'+k,v);
 host.setAttribute('data-yanke-palette',s.palette);host.setAttribute('data-yanke-font',s.font);
}
window.YankeAppearance={apply,selection,palettes,fonts,ids,fitViewport,releaseViewport};
window.dispatchEvent(new Event('yanke-appearance-ready'));
class YankeAppearanceCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(c){this.config=c;}
 set hass(h){this._hass=h;apply(this,h);if(!this.built)this.build();this.sync();}
 getCardSize(){return 10;}
 build(){this.built=true;this.shadowRoot.innerHTML=`<style>
 :host{display:block;font-family:var(--yanke-font);color:var(--yanke-text);color-scheme:var(--yanke-scheme)}*{box-sizing:border-box}main{min-height:calc(100dvh - 56px);background:var(--yanke-bg);padding:36px clamp(18px,5vw,72px)}.wrap{max-width:1120px;margin:auto}.top{display:flex;justify-content:space-between;gap:20px;align-items:center;font-size:12px;letter-spacing:2px;color:var(--yanke-muted)}a{color:var(--yanke-accent);text-decoration:none}h1{font-size:clamp(30px,4vw,48px);font-weight:600;letter-spacing:-1.5px;margin:35px 0 10px}p{color:var(--yanke-muted);line-height:1.6;font-size:14px;max-width:700px}h2{font-size:18px;font-weight:600;margin:0 0 20px}section{margin-top:32px}.palettes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}button,select,input{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid var(--yanke-accent);outline-offset:4px}.palette{border:2px solid var(--yanke-line);border-radius:15px;padding:0;overflow:hidden;text-align:left;background:var(--yanke-surface);color:var(--yanke-text);min-height:143px}.palette[aria-pressed=true]{border-color:var(--yanke-accent);box-shadow:0 0 0 1px var(--yanke-accent)}.sample{height:72px;padding:13px;display:flex;align-items:center;gap:8px;background:var(--sample-bg)}.sample i{height:35px;flex:1;border-radius:7px;background:var(--sample-surface)}.sample b{height:25px;width:25px;border-radius:50%;background:var(--sample-accent)}.palette strong{display:block;margin:12px 12px 4px;font-size:14px}.palette small{display:block;margin:0 12px 13px;font-size:11px;color:var(--yanke-muted)}.controls{display:grid;grid-template-columns:1fr 1fr;gap:24px;background:var(--yanke-surface);padding:24px;border:1px solid var(--yanke-line);border-radius:18px}label{display:block;font-size:14px}select{display:block;width:100%;margin-top:12px;padding:12px;background:var(--yanke-raised);color:var(--yanke-text);border:1px solid var(--yanke-line);border-radius:9px}input{width:100%;margin-top:20px;accent-color:var(--yanke-accent)}output{float:right;color:var(--yanke-accent)}.preview{margin-top:24px;padding:24px;border:1px solid var(--yanke-line);border-radius:18px;background:var(--yanke-surface);font-size:calc(14px * var(--yanke-scale));line-height:1.5}.preview strong{display:block;font-weight:600;font-size:calc(24px * var(--yanke-scale));margin-bottom:8px}.preview span{color:var(--yanke-muted)}.preview button{background:var(--yanke-accent);color:var(--yanke-on-accent);border:0;border-radius:9px;padding:10px 14px;margin-top:18px;cursor:default}.bottom{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:22px}.reset{background:none;color:var(--yanke-accent);border:1px solid var(--yanke-line);border-radius:9px;padding:10px 15px}.status{font-size:13px;color:var(--yanke-muted)}.status.error{color:var(--yanke-danger)}button:disabled,select:disabled,input:disabled{opacity:.55;cursor:wait}.links{display:flex;flex-wrap:wrap;gap:18px;margin-top:30px;font-size:13px}
 @media(max-width:850px){.palettes{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:520px){main{padding:22px 16px}.palettes{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.controls{grid-template-columns:1fr;padding:20px}h1{margin-top:26px}.bottom{align-items:start;flex-direction:column}.top{font-size:10px;letter-spacing:1px}}
 </style><main><div class="wrap"><div class="top"><span>YANKE HOME / APPEARANCE</span><a href="/dashboard-home/0">Back home ↗</a></div><h1>A home that feels like you.</h1><p>One palette. One type style. All eight dashboards, together.<br>Changes are saved for everyone and appear on your connected screens.</p><section aria-labelledby="colour-title"><h2 id="colour-title">Choose your mood</h2><div class="palettes">${Object.entries(palettes).map(([name,p])=>`<button type="button" class="palette" data-palette="${name}" aria-label="${name}" aria-pressed="false"><div class="sample" style="--sample-bg:${p[0]};--sample-surface:${p[2]};--sample-accent:${p[5]}"><i></i><i></i><b></b></div><strong>${name}</strong><small>${descriptions[name]}</small></button>`).join('')}</div></section><section aria-labelledby="font-title"><h2 id="font-title">Typography, everywhere</h2><div class="controls"><label>Font family<select aria-label="Font family">${Object.keys(fonts).map(name=>`<option>${name}</option>`).join('')}</select></label><label>Text size <output for="size">100%</output><input id="size" aria-label="Text size" type="range" min="90" max="120" step="5"></label></div></section><div class="preview"><strong>Your home, at a glance.</strong><span>Secondary text stays readable in every palette.</span><br><button type="button" tabindex="-1" aria-label="Accent colour preview">Accent &amp; button text</button></div><div class="bottom"><div class="status" role="status" aria-live="polite">Connected · settings apply globally</div><button class="reset" type="button">Reset appearance</button></div><div class="links">${[['Home','dashboard-home/0'],['Calendar','dashboard-calendar2/'],['Lights','dashboard-light2/lights'],['Media','media-signal/remote'],['Network','dashboard-network2/0'],['Overview','dashboard-overview/overview'],['Security','security-dash-2/overview'],['Weather','dashboard-weather2/home']].map(([n,p])=>`<a href="/${p}">${n} ↗</a>`).join('')}</div></div></main>`;
 this.shadowRoot.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>this.save('palette',b.dataset.palette));
 this.shadowRoot.querySelector('select').onchange=e=>this.save('font',e.target.value);
 const slider=this.shadowRoot.querySelector('input');slider.oninput=e=>{this.shadowRoot.querySelector('output').textContent=e.target.value+'%';};slider.onchange=e=>this.save('size',Number(e.target.value));
 this.shadowRoot.querySelector('.reset').onclick=()=>this.reset();
 }
 sync(){const s=selection(this._hass);this.shadowRoot.querySelectorAll('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===s.palette)));this.shadowRoot.querySelector('select').value=s.font;const slider=this.shadowRoot.querySelector('input');if(this.shadowRoot.activeElement!==slider){slider.value=s.size;this.shadowRoot.querySelector('output').textContent=s.size+'%';}const missing=Object.values(ids).some(id=>!this._hass?.states?.[id]||['unknown','unavailable'].includes(this._hass.states[id].state));this.shadowRoot.querySelectorAll('.palette,select,input,.reset').forEach(e=>e.disabled=!!this.saving||missing||this._hass?.connected===false);if(missing)this.status('Appearance settings are unavailable. Reconnect and try again.',true);}
 status(message,error=false){const el=this.shadowRoot.querySelector('.status');el.textContent=message;el.classList.toggle('error',error);}
 async write(key,value){return this._hass.callService(key==='size'?'input_number':'input_select',key==='size'?'set_value':'select_option',{entity_id:ids[key],[key==='size'?'value':'option']:value});}
 async save(key,value){if(this.saving)return;this.saving=true;this.sync();this.status('Saving…');try{await this.write(key,value);this.status('Saved · applied across all dashboards');}catch(e){this.status('Could not save. Check your connection and try again.',true);}finally{this.saving=false;this.sync();}}
 async reset(){if(this.saving)return;this.saving=true;this.sync();this.status('Resetting…');try{for(const [key,value] of [['palette','Moss'],['font','System'],['size',100]])await this.write(key,value);this.status('Reset to Moss · System · 100%');}catch(e){this.status('Reset was not completed. Please try again.',true);}finally{this.saving=false;this.sync();}}
}
if(!customElements.get('yanke-appearance-card'))customElements.define('yanke-appearance-card',YankeAppearanceCard);
})();
