const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
let Card;
vm.runInNewContext(fs.readFileSync(__dirname+'/yanke-home-card.js','utf8'), {
 HTMLElement: class {attachShadow(){this.shadowRoot={};}},
 customElements:{get(){},define(name,c){Card=c;}},window:{},Date,Intl,Set,Number,String,Math,JSON
});
(async()=>{
 const card=new Card(),calls=[],more=[],errors=[];
 card.update=()=>{};card.more=id=>more.push(id);card.notify=m=>errors.push(m);
 card._hass={states:{},callService:async(...args)=>calls.push(args)};
 const put=(id,state,attributes={})=>card._hass.states[id]={state,attributes};
 put('light.test','off');await card.action('toggle','light.test');
 assert.deepEqual(JSON.parse(JSON.stringify(calls.pop())),['light','turn_on',{}, {entity_id:'light.test'}]);
 put('light.test','unavailable');await card.action('toggle','light.test');assert.equal(calls.length,0);
 put('climate.test','heat',{temperature:35,min_temp:1.7,max_temp:35});await card.action('temp-up','climate.test');assert.equal(calls.pop()[2].temperature,35);
 put('climate.test','heat',{temperature:1.7,min_temp:1.7,max_temp:35});await card.action('temp-down','climate.test');assert.equal(calls.pop()[2].temperature,1.7);
 put('select.test','power_off',{options:['power_off','Watch Smart TV']});await card.action('activity','select.test',{value:'invalid'});assert.equal(calls.length,0);
 await card.action('tv','select.test');assert.equal(calls.pop()[2].option,'Watch Smart TV');
 put('alarm_control_panel.test','disarmed',{code_arm_required:true});await card.action('alarm_arm_home','alarm_control_panel.test');assert.equal(more.pop(),'alarm_control_panel.test');assert.equal(calls.length,0);
 put('timer.test','active',{finishes_at:new Date(Date.now()+61000).toISOString()});assert.match(card.timer('timer.test'),/^1:0[01] left$/);
 put('timer.test','paused');assert.equal(card.timer('timer.test'),'Timer paused');
 put('light.test','off');card._hass.callService=async()=>{throw new Error('Device offline');};await card.action('toggle','light.test');assert.equal(errors.pop(),'Device offline');assert.equal(card.pending.size,0);
 console.log('PASS: entity targeting, unavailable handling, temperature limits, activity validation, alarm code flow, countdowns, service errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
