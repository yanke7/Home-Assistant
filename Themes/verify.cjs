const fs=require('fs'),vm=require('vm'),assert=require('assert');
const classes=new Map();const ctx={HTMLElement:class{},window:{dispatchEvent(){}},Event:class{},customElements:{get:n=>classes.get(n),define:(n,c)=>classes.set(n,c)}};
vm.runInNewContext(fs.readFileSync(__dirname+'/yanke-appearance.js','utf8'),ctx);
const api=ctx.window.YankeAppearance;
function lum(hex){const rgb=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){let x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
let min=100;
for(const [name,p] of Object.entries(api.palettes)){
 for(const bg of p.slice(0,3))for(const fg of p.slice(3,6)){const c=contrast(bg,fg);assert(c>=4.5,`${name}: ${fg} on ${bg} = ${c}`);min=Math.min(min,c);}
 assert(contrast(p[5],p[6])>=4.5,name+' accent text');
 const props={},attrs={},host={style:{setProperty:(k,v)=>props[k]=v},setAttribute:(k,v)=>attrs[k]=v};
 for(const font of Object.keys(api.fonts))for(const size of [90,100,120]){
  api.apply(host,{states:{[api.ids.palette]:{state:name},[api.ids.font]:{state:font},[api.ids.size]:{state:String(size)}}});
  assert.equal(attrs['data-yanke-palette'],name);assert.equal(props['--yanke-scale'],String(size/100));assert.equal(props['--yanke-font'],api.fonts[font]);
 }
}
assert.equal(Object.keys(api.palettes).length,10);
assert.equal(api.selection({states:{}}).palette,'Moss');
const C=classes.get('yanke-appearance-card'),calls=[];const card=Object.create(C.prototype);card._hass={callService:(...args)=>calls.push(args)};
(async()=>{await card.write('palette','Ocean');await card.write('font','Classic');await card.write('size',110);assert.deepEqual(calls.map(c=>c[0]),['input_select','input_select','input_number']);assert.equal(calls[0][2].entity_id,api.ids.palette);console.log('PASS: 10 palettes, 150 font/scale combinations, >=4.5:1 text contrast (minimum '+min.toFixed(2)+'), helper-only service routing.');})();
