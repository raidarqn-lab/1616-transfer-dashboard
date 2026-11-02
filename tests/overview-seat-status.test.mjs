import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const context=vm.createContext({esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
vm.runInContext(html.slice(html.indexOf('function overviewSeatStatusPlayers('),html.indexOf('function closeOverviewSeatRosters(')),context);
const count=(records,status)=>JSON.parse(JSON.stringify(context.overviewSeatStatusCounts(records,status)));
test('overview counts mutually exclusive current statuses with confirmed colours only',()=>{
 const records=[{status:'Approved',confirmedSeat:'Blue',power:250},{status:'Accepted',confirmedSeat:'White',power:250},{status:'Approved',confirmedSeat:'Unknown',power:200},{status:'Accepted',power:200},...['Pending','Under Review','Waitlisted','Declined','Withdrawn','Transferred'].map(status=>({status,confirmedSeat:'Gold'}))];
 assert.deepEqual(count(records,'Approved'),{Gold:0,Purple:0,Blue:1,White:0,total:2,unknown:1});
 assert.deepEqual(count(records,'Accepted'),{Gold:0,Purple:0,Blue:0,White:1,total:2,unknown:1});
 records[0].status='Accepted';
 assert.equal(count(records,'Approved').Blue,0);assert.equal(count(records,'Accepted').Blue,1);
 assert.equal(count(records,'Accepted').Gold,0);
});
test('non-applicants, deleted records and outbound transfers never enter either panel',()=>{
 for(const status of ['Approved','Accepted']){
  const records=[{deleted:true},{general:true},{prospect:true},{transferDirection:'outbound'}].map(flags=>({status,confirmedSeat:'Purple',...flags}));
  assert.deepEqual(count(records,status),{Gold:0,Purple:0,Blue:0,White:0,total:0,unknown:0});
 }
});
test('all four confirmed colours and empty cohorts reconcile with panel totals',()=>{
 const records=['Gold','Purple','Blue','White'].map(confirmedSeat=>({status:'Accepted',confirmedSeat}));
 assert.deepEqual(count(records,'Accepted'),{Gold:1,Purple:1,Blue:1,White:1,total:4,unknown:0});
 assert.equal(count([],'Approved').total,0);
});
test('hover list membership matches each colour, total and unknown count without changing records',()=>{
 const records=[{name:'Zed',server:1627,status:'Approved',confirmedSeat:'Blue'},{name:'Amy',server:1581,status:'Approved',confirmedSeat:'Blue'},{name:'Unknown seat',status:'Approved'},{name:'Accepted',status:'Accepted',confirmedSeat:'Blue'},{name:'Withdrawn',status:'Withdrawn',confirmedSeat:'Blue'}];
 const before=structuredClone(records);
 for(const status of ['Approved','Accepted'])for(const colour of ['Gold','Purple','Blue','White','all','unknown']){
  const expected=count(records,status)[colour==='all'?'total':colour];
  assert.equal(context.overviewSeatStatusPlayers(records,status,colour).length,expected);
 }
 assert.deepEqual(Array.from(context.overviewSeatStatusPlayers(records,'Approved','Blue'),p=>p.name),['Amy','Zed']);
 assert.deepEqual(records,before);
});
test('roster formats source server, current alliance and player name safely, including missing values and empty seats',()=>{
 const records=[{status:'Accepted',confirmedSeat:'White',server:'#1581',alliance:'[SoAP]',name:'Star <script>',destinationAlliance:'NvSP'}];
 const markup=context.overviewSeatRosterMarkup(records,'Accepted','White');
 assert.match(markup,/Server<\/span> <span translate="no">#1581 \[SoAP\] Star &lt;script&gt;/);
 assert.doesNotMatch(markup,/<script>|NvSP|\[\[SoAP\]\]/);
 assert.match(markup,/aria-controls="overview-roster-Accepted-White"/);
 assert.match(context.overviewSeatRosterMarkup([], 'Approved','Gold'),/No players in this category\./);
 assert.match(context.overviewSeatRosterMarkup([{status:'Approved',name:'Only name'}],'Approved','unknown'),/— \[—\] Only name/);
});
test('hover opens an accessible list; leave closes it, while clicks pin it and Escape dismisses it',()=>{
 const handlers={},timers=new Map();let timerId=0;
 const panel={hidden:true,style:{}},button={attributes:{},setAttribute(k,v){this.attributes[k]=v;},getBoundingClientRect:()=>({top:150,bottom:188,right:350}),closest:()=>wrapper};
 const wrapper={dataset:{},querySelector:s=>s==='.overview-seat-popover'?panel:button,contains:t=>t===button||t===panel,closest:()=>wrapper};
 button.closest=s=>s==='.overview-seat-roster'?wrapper:s==='.overview-seat-count'?button:null;
 const root={querySelectorAll:()=>[wrapper],addEventListener:(type,fn)=>handlers[type]=fn};
 const document={activeElement:null,addEventListener:(type,fn)=>handlers['document:'+type]=fn};
 const c=vm.createContext({root,document,window:{innerWidth:360,innerHeight:800,addEventListener(){}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(html.slice(html.indexOf('function closeOverviewSeatRosters('),html.indexOf('function renderOverviewStatusSeats(')),c);
 handlers.pointerover({target:button,relatedTarget:null});assert.equal(panel.hidden,false);assert.equal(button.attributes['aria-expanded'],'true');assert.equal(panel.style.left,'12px');
 handlers.pointerout({target:button,relatedTarget:null});for(const fn of timers.values())fn();assert.equal(panel.hidden,true);
 handlers.click({target:button});assert.equal(wrapper.dataset.pinned,'true');assert.equal(panel.hidden,false);
 handlers.pointerout({target:button,relatedTarget:null});for(const fn of timers.values())fn();assert.equal(panel.hidden,false);
 handlers['document:keydown']({key:'Escape'});assert.equal(panel.hidden,true);assert.equal(button.attributes['aria-expanded'],'false');
});
