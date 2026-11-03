import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitingAcceptanceGroups,awaitingAcceptanceMarkup,outstandingGroupText,installAwaitingAcceptance} from '../awaiting-acceptance.js';

const player=(id,name,extra={})=>({id,name,status:'Approved',group:'Example Group',server:1234,alliance:'ALFA',confirmedSeat:'Blue',...extra});
test('outstanding groups include approved applicants only and preserve source records',()=>{
 const records=[player(1,'B'),player(2,'A'),player(3,'Accepted',{status:'Accepted'}),...['Pending','Under Review','Waitlisted','Declined','Withdrawn','Transferred'].map((status,i)=>player(i+10,status,{status})),...[{deleted:true},{general:true},{prospect:true},{transferDirection:'inbound'},{transferDirection:'outbound'},{mergedInto:1}].map((flags,i)=>player(i+30,'Excluded',flags))];
 const before=structuredClone(records),groups=awaitingAcceptanceGroups(records);
 assert.deepEqual(groups.map(g=>[g.name,g.members.map(p=>p.name)]),[['Example Group',['A','B']]]);
 assert.deepEqual(records,before);
 records[0].status='Accepted';assert.deepEqual(awaitingAcceptanceGroups(records)[0].members.map(p=>p.name),['A']);
});
test('blank and Unknown groups share a clearly labeled fallback, while named groups stay distinct',()=>{
 const groups=awaitingAcceptanceGroups([player(1,'Solo A',{group:''}),player(2,'Solo B',{group:'Unknown'}),player(3,'Tex',{group:' Test Group '}),player(4,'Glass')]);
 assert.deepEqual(groups.map(g=>[g.name,g.members.length]),[['Example Group',1],['Test Group',1],['No group recorded',2]]);
});
test('clipboard uses exact one-per-line format without Server, and confirmed colours only',()=>{
 const rows=[player(1,'Example Player'),player(2,'테스트 Player',{server:'#1235',alliance:'[BETA]',confirmedSeat:'White'}),player(3,'Unknown seat',{confirmedSeat:'',seat:'Gold',power:250}),player(4,'Already accepted',{status:'Accepted'})];
 assert.equal(outstandingGroupText(rows),'#1234 [ALFA] Example Player - Blue\n#1235 [BETA] 테스트 Player - White\n#1234 [ALFA] Unknown seat - Unknown');
 assert.equal(outstandingGroupText([player(5,'Line\nBreak',{server:null,alliance:'A\r\nB',confirmedSeat:'Purple'})]),'#? [A B] Line Break - Purple');
});
test('group copy payloads cannot leak other groups or previously accepted players',()=>{
 const groups=awaitingAcceptanceGroups([player(1,'Glass'),player(2,'Tex',{group:'Test Group'}),player(3,'Accepted',{group:'Test Group',status:'Accepted'})]);
 assert.equal(outstandingGroupText(groups[1].members),'#1234 [ALFA] Tex - Blue');
 groups[1].members[0].status='Accepted';assert.equal(outstandingGroupText(groups[1].members),'');
});
test('rendered names and groups are escaped; empty state has no actionable group copies',()=>{
 const markup=awaitingAcceptanceMarkup(awaitingAcceptanceGroups([player(1,'<img src=x>',{group:'<script>"'})]));
 assert.doesNotMatch(markup.names,/<script>|<img/);assert.match(markup.names,/&lt;img src=x&gt;/);assert.match(markup.names,/aria-label="Copy outstanding · &lt;script&gt;&quot;"/);
 assert.match(awaitingAcceptanceMarkup([]).summary,/No approved applicants awaiting acceptance/);assert.equal(awaitingAcceptanceMarkup([]).names,'');
});

function fakeElement(){return {attributes:{},dataset:{},handlers:{},innerHTML:'',textContent:'',hidden:false,disabled:false,addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(k,v){this.attributes[k]=v;},toggleAttribute(k,v){if(v)this.attributes[k]='';else delete this.attributes[k];},contains(){return false;},focus(){this.focused=true;}};}
function ui(writeClipboard){
 const box=fakeElement(),toggle=fakeElement(),panel=fakeElement(),summary=fakeElement(),names=fakeElement(),feedback=fakeElement(),total=fakeElement(),label=fakeElement();
 const nodes={'[data-toggle-awaiting]':toggle,'[data-awaiting-panel]':panel,'[data-awaiting-groups]':summary,'[data-awaiting-names]':names,'[data-awaiting-feedback]':feedback,'[data-awaiting-total]':total};
 box.querySelector=s=>nodes[s];box.contains=()=>true;toggle.querySelector=()=>label;
 const api=installAwaitingAcceptance({root:{querySelector:()=>box},onOpenPlayer(){},writeClipboard});
 return {api,box,toggle,panel,summary,names,feedback,total,label};
}
test('expansion survives data refresh and collapses safely when outstanding players disappear',()=>{
 const old=globalThis.document;globalThis.document={activeElement:null};
 try{const u=ui(async()=>{});u.api.render([player(1,'A')]);u.toggle.handlers.click();assert.equal(u.toggle.attributes['aria-expanded'],'true');assert.equal(u.panel.attributes['aria-hidden'],'false');u.api.render([player(1,'Renamed')]);assert.equal(u.toggle.attributes['aria-expanded'],'true');u.api.render([player(1,'Renamed',{status:'Accepted'})]);assert.equal(u.total.textContent,'0');assert.equal(u.toggle.hidden,true);assert.equal(u.toggle.attributes['aria-expanded'],'false');assert.equal(u.panel.attributes['aria-hidden'],'true');assert.ok('inert' in u.panel.attributes);}finally{globalThis.document=old;}
});
test('copy reports success only after writing the group payload and reports clipboard failures honestly',async()=>{
 let copied='';const u=ui(async text=>{copied=text;});u.api.render([player(1,'Glass'),player(2,'Tex',{group:'Test Group'})]);
 const button=fakeElement();button.dataset.copyOutstanding='1';const event={target:{closest:s=>s==='[data-copy-outstanding]'?button:null}};
 await u.box.handlers.click(event);assert.equal(copied,'#1234 [ALFA] Tex - Blue');assert.match(u.feedback.innerHTML,/Copied outstanding players/);assert.equal(button.disabled,false);
 const failed=ui(async()=>{throw Error('denied');});failed.api.render([player(1,'Glass'),player(2,'Tex',{group:'Test Group'})]);await failed.box.handlers.click(event);assert.equal(failed.feedback.textContent,'Unable to copy. Please try again.');assert.equal(failed.feedback.innerHTML,'');assert.equal(button.disabled,false);
});
