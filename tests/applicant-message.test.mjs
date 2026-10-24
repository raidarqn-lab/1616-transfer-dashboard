import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applicantConfirmationCode,applicantMessage,installApplicantMessageCopy} from '../applicant-message.js';
const code='1616-EXAMPLE-12345678';
const player={id:7,name:'KaijuX 포효',applicationId:'primary',applicationConfirmations:[{applicationId:'other',confirmationCode:'1616-OTHER-98765432'},{applicationId:'primary',confirmationCode:code}]};
test('copies exact requested wording using current player name and primary application code',()=>{
 assert.equal(applicantMessage(player),`Hi KaijuX 포효, to edit or check the status of your application, you can go to www.join1616.com and use the confirmation code that you received when applying to transfer to the server. For your reference, this code is ${code}`);
 assert.equal(applicantConfirmationCode({...player,applicationConfirmations:[...player.applicationConfirmations].reverse()}),code);
});
test('missing, ambiguous or malformed codes cannot produce a misleading message',()=>{
 for(const p of [{name:'Example'},{...player,applicationId:'absent'},{...player,applicationConfirmations:[{confirmationCode:'broken'}]},{...player,name:''}])assert.equal(applicantMessage(p),null);
 assert.equal(applicantConfirmationCode({...player,applicationId:null,applicationConfirmations:[{confirmationCode:code},{confirmationCode:code}]}),code);
});
test('private copy button is unavailable to support and non-applicants; labels are escaped',()=>{
 const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');const context=vm.createContext({BOOT:{role:'admin'},previewRole:'admin',playerCategory:p=>p.prospect?'Prospect':'Applicant',applicantMessage,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')});
 vm.runInContext(html.slice(html.indexOf('function canCopyApplicantMessage'),html.indexOf('installApplicantMessageCopy(root,')),context);
 assert.match(context.applicantMessageButton({...player,name:'<Example "name">'}),/&lt;Example &quot;name&quot;/);
 for(const p of [{...player,prospect:true},{...player,deleted:true}])assert.equal(context.applicantMessageButton(p),'');
 context.previewRole='support';assert.equal(context.applicantMessageButton(player),'');context.previewRole='admin';context.BOOT.role='support';assert.equal(context.applicantMessageButton(player),'');
});
test('button writes a plain string to writeText without markup or other clipboard formats',async()=>{
 const handlers={},copies=[],nodes=[];
 const root={append:n=>nodes.push(n),contains:()=>true,addEventListener:(type,fn)=>handlers[type]=fn};
 const button={dataset:{copyApplicantMessage:'7'},disabled:false};
 const originalDocument=globalThis.document,originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalTimeout=globalThis.setTimeout;
 globalThis.document={createElement:()=>({setAttribute(){},textContent:''})};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>copies.push(value)}}});globalThis.setTimeout=()=>0;
 try{
  installApplicantMessageCopy(root,{getPlayer:()=>({...player,name:'<b>Example & Name</b>'}),canCopy:()=>true});
  await handlers.click({target:{closest:()=>button},preventDefault(){},stopPropagation(){}});
  assert.deepEqual(copies,[applicantMessage({...player,name:'<b>Example & Name</b>'})]);assert.equal(typeof copies[0],'string');assert.match(nodes[0].textContent,/copied/);assert.equal(button.disabled,false);
 }finally{globalThis.document=originalDocument;globalThis.setTimeout=originalTimeout;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;}
});
