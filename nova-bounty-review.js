import {loadStormHistory} from './storm-profile.js?v=20260928';
import {loadTrainHistory} from './train-history.js?v=history-20260927';
import {renderReports} from './player-reports.js?v=report-polish-20260926';
import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';
import {createLeaderboardOcr} from './nova-bounty-ocr.js?v=20260925b';

const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const clean=value=>String(value??'').trim();
const status=message=>$('status').textContent=message;
const profileCache=new Map();
let active=null,draft=null,dirty=false,selected=-1,currentPage=1,extracting=false;

function updateClocks(){
 const now=new Date();
 $('server-time').textContent=now.toLocaleString('en-CA',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' UTC';
 $('local-time').textContent=now.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
}
updateClocks();setInterval(updateClocks,1000);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});

async function call(body){
 if(!user)throw Error('Sign in to the Portal first.');
 const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify(body),signal:AbortSignal.timeout(body.action==='extract-page'?65000:30000)});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Unable to save. Reload the review if another reviewer changed it.');
 return data;
}

function normalizeRow(row){
 const migrated=!!row.checked;
 return {...row,rank:Number(row.rank)||0,page:Number(row.page)||1,score:clean(row.score),name:clean(row.name),alliance:clean(row.alliance),playerAlliance:clean(row.playerAlliance),playerName:clean(row.playerName),playerKey:clean(row.playerKey),playerChecked:row.playerChecked??migrated,allianceChecked:row.allianceChecked??false,scoreChecked:row.scoreChecked??migrated,excluded:!!row.excluded};
}
function rowConfirmed(row){return !!(row.playerKey&&row.playerChecked&&row.allianceChecked&&row.scoreChecked);}
function pageRows(page=currentPage){return (draft?.rows||[]).filter(row=>row.page===page);}
function pageConfirmed(page){const rows=pageRows(page).filter(row=>!row.excluded);return rows.length>0&&rows.every(rowConfirmed);}
function issues(rows){
 const included=rows.filter(row=>!row.excluded),keys=new Set(),ranks=new Set();let duplicates=0;
 for(const row of included){if(ranks.has(row.rank)||(row.playerKey&&keys.has(row.playerKey)))duplicates++;ranks.add(row.rank);if(row.playerKey)keys.add(row.playerKey);}
 return {included,duplicates,unmatched:included.filter(row=>!row.playerKey).length,pending:included.filter(row=>!rowConfirmed(row)).length};
}
function rewardPoints(){const input=$('bounty-points');return input.value.trim()===''?NaN:Number(input.value);}
function validReward(){const n=rewardPoints();return Number.isInteger(n)&&n>=0&&n<=10000;}
function decisionReady(){
 if(!active||!draft||!validReward())return false;
 const report=issues(draft.rows),allPages=Array.from({length:active.fileCount},(_,index)=>pageConfirmed(index+1)).every(Boolean);
 return report.included.length>0&&report.pending===0&&report.duplicates===0&&allPages&&[...document.querySelectorAll('.final-check')].every(input=>input.checked);
}
function renderDecision(){
 const ready=decisionReady(),button=$('approve-review');if(!button)return;
 button.disabled=!ready;
 $('decision-help').textContent=ready?'Ready to publish confirmed NvSP rows. Opponent rows remain private review evidence.':'Confirm every included row, screenshot and final review check before publishing.';
}
function markChanged(){dirty=true;renderSummary();renderPages();}
function resetConfirmations(row,...keys){for(const key of keys)row[key]=false;}
function formatScore(value){const number=Number(String(value).replace(/,/g,''));return Number.isFinite(number)?number.toLocaleString():clean(value);}

function renderSummary(){
 if(!draft)return;
 const report=issues(draft.rows),reviewed=Array.from({length:active.fileCount},(_,index)=>index+1).filter(pageConfirmed).length;
 $('counts').textContent=`${draft.rows.length} suggested rows · ${report.included.length} included · ${report.unmatched} unmatched · ${report.pending} awaiting confirmation · ${report.duplicates} duplicate conflicts`;
 $('coverage').textContent=`${active.fileCount} uploaded files · ${draft.rows.length} leaderboard rows found · ${reviewed} pages fully confirmed · ${report.duplicates} possible overlaps or duplicate conflicts.`;
 $('page-progress').textContent=`${reviewed} / ${active.fileCount} screenshots reviewed`;
 $('save').textContent=dirty?'Save review draft':'Draft saved';
 const alliances=[...new Set(draft.rows.map(row=>row.alliance).filter(Boolean))];
 $('batch-alliance').textContent=alliances.length?`Alliance names in evidence: ${alliances.join(' · ')}`:'Alliance names will appear after screenshot suggestions are generated.';
 const confirmed=pageConfirmed(currentPage),indicator=$('page-state');
 indicator.className=`review-indicator ${confirmed?'approved':'pending'}`;
 indicator.firstChild.nodeValue=confirmed?'✓':'●';
 indicator.querySelector('.review-tooltip').textContent=confirmed?'Confirmed':'Needs confirmation';
 renderDecision();
}

async function evidence(page){
 try{
  $('image-status').textContent=`Loading page ${page}…`;
  const {url}=await call({action:'evidence',batchId:active.id,sequence:page});
  const image=el('img');image.alt=`Submitted leaderboard screenshot page ${page}`;
  image.onload=()=>{$('image-status').textContent=`Original file ${page} of ${active.fileCount}`;};
  image.onerror=()=>{$('image-status').textContent='Image unavailable. Select the page again to retry.';};
  image.src=url;$('image').replaceChildren(image);
 }catch(error){status(error.message);}
}
async function evidenceUrl(page){return (await call({action:'evidence',batchId:active.id,sequence:page})).url;}

function renderPages(){
 const pages=$('pages');pages.replaceChildren();
 if(!active)return;
 for(let page=1;page<=active.fileCount;page++){
  const button=el('button',`Page ${page}`),indicator=el('span',pageConfirmed(page)?'✓':'●');
  indicator.className=`review-indicator ${pageConfirmed(page)?'approved':'pending'}`;indicator.title=pageConfirmed(page)?'Confirmed':'Pending review';button.append(indicator);
  if(page===currentPage)button.classList.add('active');button.setAttribute('aria-pressed',String(page===currentPage));
  button.onclick=()=>selectPage(page);pages.append(button);
 }
}
function selectPage(page){currentPage=page;selected=-1;renderPages();renderRows();renderSummary();evidence(page);$('editor').replaceChildren(el('p','Select a suggested row to search and inspect the private transfer profile.'));}

function checkbox(key,label,row,index){
 const wrapper=el('label'),input=el('input');wrapper.className='r4-row-confirm';input.type='checkbox';input.checked=!!row[key];
 input.onclick=event=>event.stopPropagation();input.onchange=()=>{row[key]=input.checked;markChanged();renderRows();};wrapper.append(input,document.createTextNode(label));return wrapper;
}
function editable(label,value,onchange,type='text'){
 const wrapper=el('label',label),input=el('input');input.type=type;input.value=value??'';input.onclick=event=>event.stopPropagation();
 input.onchange=()=>{onchange(input.value);markChanged();renderRows();};wrapper.append(input);return wrapper;
}
function renderRows(){
 const tbody=$('rows');tbody.replaceChildren();if(!draft)return;
 const query=$('filter').value.toLowerCase();let visible=0;
 draft.rows.forEach((row,index)=>{
  if(row.page!==currentPage)return;
  if(query&&!`${row.name} ${row.alliance} ${row.rank} ${row.playerName} ${row.playerAlliance} ${row.playerKey}`.toLowerCase().includes(query))return;
  visible++;
  const tr=el('tr');tr.className=`${rowConfirmed(row)?'confirmed':'pending'}${index===selected?' selected':''}${row.excluded?' excluded-row':''}`;tr.onclick=()=>selectRow(index);
  const rank=el('td',String(row.rank));rank.className='r4-rank-cell';const data=el('td'),grid=el('div');grid.className='r4-row-grid';
  const identity=el('div');identity.className='r4-row-identity';identity.append(el('strong',row.playerName||row.name||'Unnamed player'),el('span',row.playerAlliance||row.alliance||'Alliance missing'));identity.querySelector('span').className='r4-alliance';
  const name=editable('Suggested player',row.name,value=>{row.name=value;resetConfirmations(row,'playerChecked');});name.className='r4-search-label';
  const alliance=editable('Screenshot alliance',row.alliance,value=>{row.alliance=value;resetConfirmations(row,'allianceChecked');});alliance.className='r4-alliance-label';
  const score=editable('Suggested score',formatScore(row.score),value=>{row.score=value.replace(/,/g,'');resetConfirmations(row,'scoreChecked');});score.className='r4-score-label';
  const state=el('div',row.excluded?'Excluded from review':rowConfirmed(row)?'✓ Confirmed':'● Awaiting R4 confirmation');state.className=`match-state${rowConfirmed(row)?' confirmed':''}`;state.dataset.ready='';
  const actions=el('div');actions.className='r4-row-actions';const search=el('button','Search player');search.onclick=event=>{event.stopPropagation();selectRow(index);};const clear=el('button','Clear match');clear.onclick=event=>{event.stopPropagation();row.playerKey='';row.playerName='';row.playerAlliance='';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();selectRow(index);};actions.append(search,clear);
  grid.append(identity,name,alliance,score,checkbox('playerChecked','Confirm player',row,index),checkbox('allianceChecked','Confirm alliance',row,index),checkbox('scoreChecked','Confirm score',row,index),state,actions);data.append(grid);tr.append(rank,data);tbody.append(tr);
 });
 if(!visible){const tr=el('tr');tr.className='empty-row';const td=el('td',pageRows().length?'No rows match this filter.':'No suggestions for this screenshot yet. Generate suggestions or add a row.');td.colSpan=2;tr.append(td);tbody.append(tr);}
 renderSummary();
}

function profileLine(label,value){const p=el('p');p.append(el('strong',`${label}: `),document.createTextNode(clean(value)||'Unknown'));return p;}
function profileCard(profile,row={}){
 const card=el('div');card.className='profile-card';card.append(profileLine('Alliance',row.playerAlliance||profile.alliance),profileLine('Server',profile.server),profileLine('Profession',profile.profession),profileLine('Hero power',profile.power),profileLine('Known names',[profile.translatedName,...(profile.aliases||[]),...(profile.previousGameNames||[])].filter(Boolean).join(' · ')));return card;
}
function renderProfile(row,profile={}){
 const card=profileCard(profile,row);
 $('profile-heading').textContent=row.playerName||profile.name||row.name||'Player profile';$('profile-preview').replaceChildren(card.cloneNode(true));return card;
}

function editPlayerOverview(body,profile,full,onSaved){
 const form=el('form');form.className='overview-inline-actions';form.id='overview-inline-edit';
 const fields=[['name','Player name'],['translatedName','Translated name'],['aliases','Aliases'],['alliance','Alliance'],['server','Server'],['allianceRank','Alliance rank'],['power','Hero power (M)'],['profession','Profession level'],['kills','Kills']];const inputs=new Map();
 for(const [key,label] of fields){const input=el(key==='aliases'?'textarea':key==='allianceRank'?'select':'input');input.setAttribute('aria-label',label);input.setAttribute('form',form.id);if(key==='aliases'){input.rows=3;input.maxLength=8050;input.placeholder='One in-game alias per line';}else if(key==='allianceRank'){for(const rank of ['','R1','R2','R3','R4','R5']){const option=el('option',rank||'Not recorded');option.value=rank;input.append(option);}}else{input.type=['power','profession','kills'].includes(key)?'number':'text';input.maxLength=160;if(input.type==='number'){input.min='0';input.max='1000000000000000';input.step=key==='power'?'any':'1';}}input.value=key==='aliases'?(full.details?.aliases||[]).join('\n'):full.details?.[key]??'';input.required=['name','server'].includes(key);if(key==='server')input.pattern='[0-9]{1,6}';const pair=Array.from(body.querySelectorAll('.player-info-grid dl>div')).find(node=>node.querySelector('dt')?.textContent===label);if(pair)pair.querySelector('dd').replaceChildren(input);inputs.set(key,input);}
 const allianceInput=inputs.get('alliance'),normalizeAlliance=value=>value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const alliances=full.alliances||[],choices=el('datalist');choices.id='player-alliance-options';for(const name of alliances){const option=el('option');option.value=name;choices.append(option);}allianceInput.setAttribute('list',choices.id);allianceInput.placeholder='Search existing alliances';allianceInput.autocomplete='off';allianceInput.parentElement.append(choices);
 const addAlliance=el('button','Add new alliance'),allianceHint=el('small');addAlliance.type='button';allianceInput.parentElement.append(addAlliance,allianceHint);let newAlliance='';
 const checkAlliance=()=>{const value=allianceInput.value.trim(),existing=alliances.find(name=>normalizeAlliance(name)===normalizeAlliance(value));addAlliance.hidden=!value||!!existing;allianceHint.textContent=existing?`Existing alliance: ${existing}`:newAlliance===value?'New alliance selected; review changes to confirm.':'Choose a match, or explicitly add a new alliance.';return existing;};
 allianceInput.oninput=()=>{newAlliance='';checkAlliance();};allianceInput.onchange=()=>{const existing=checkAlliance();if(existing)allianceInput.value=existing;};addAlliance.onclick=()=>{if(normalizeAlliance(allianceInput.value).length<2||allianceInput.value.trim().length>40){allianceHint.textContent='Use 2–40 characters for the alliance name.';return;}newAlliance=allianceInput.value.trim();checkAlliance();};checkAlliance();
 const save=el('button','Review changes'),cancel=el('button','Cancel');cancel.type='button';cancel.onclick=()=>onSaved(profile);const feedback=el('p');feedback.setAttribute('role','status');form.append(save,cancel,feedback);body.querySelector('.player-info-grid').after(form);
 form.onsubmit=async event=>{event.preventDefault();const existingAlliance=checkAlliance();if(existingAlliance)allianceInput.value=existingAlliance;else if(allianceInput.value.trim()&&newAlliance!==allianceInput.value.trim()){feedback.textContent='Choose an existing alliance or select Add new alliance first.';return;}const changes={},lines=[];for(const [key,label] of fields){const input=inputs.get(key),value=key==='aliases'?[...new Set(input.value.split('\n').map(v=>v.trim()).filter(Boolean))]:input.type==='number'?(input.value===''?null:Number(input.value)):input.value.trim(),old=full.details?.[key]??(input.type==='number'?null:'');if(String(value??'')!==String(old??'')){changes[key]=value;lines.push(`${label}: ${old??'Not recorded'} → ${value??'Not recorded'}`);}}
 if(!lines.length){feedback.textContent='No changes to save.';return;}
 save.disabled=true;cancel.disabled=true;for(const input of inputs.values())input.disabled=true;
 const approved=await new Promise(resolve=>{const review=el('section');review.className='player-info-card overview-confirm';review.append(el('h3','Confirm shared player changes'),el('p','These changes will update the same player record used by the Alliance Hub and Transfer Hub.'));for(const line of lines)review.append(el('p',line));const yes=el('button','Confirm and save'),no=el('button','Back to editing');yes.type=no.type='button';yes.onclick=()=>{review.remove();resolve(true);};no.onclick=()=>{review.remove();resolve(false);};review.append(yes,no);form.append(review);yes.focus();});
 for(const input of inputs.values())input.disabled=false;save.disabled=false;cancel.disabled=false;if(!approved)return;
 save.disabled=true;cancel.disabled=true;feedback.textContent='Saving shared player record…';try{const saved=await call({action:'profile',playerKey:profile.key,profileOperation:'save',confirmed:true,allowNewAlliance:!!newAlliance,expectedRevision:full.revision,changes,includeActivity:true});directoryCache.clear();profileCache.clear();onSaved({...profile,...saved.details});}catch(error){feedback.textContent='Not saved. If this player changed elsewhere, reopen the profile before trying again. '+error.message;}finally{save.disabled=false;cancel.disabled=false;}};
}

function confirmPlanChange(title,lines){return new Promise(resolve=>{const dialog=el('dialog');dialog.className='strategy-dialog';dialog.setAttribute('aria-label',title);dialog.append(el('h2',title));for(const line of lines)dialog.append(el('p',line));const foot=el('footer'),cancel=el('button','Cancel'),save=el('button','Confirm & save');cancel.type=save.type='button';save.className='primary';cancel.onclick=()=>dialog.close();save.onclick=()=>{resolve(true);dialog.close();};dialog.onclose=()=>{resolve(false);dialog.remove();};foot.append(cancel,save);dialog.append(foot);document.body.append(dialog);dialog.showModal();});}
function planFormField(label,type,value){const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;if(type==='checkbox'){input.checked=!!value;wrap.prepend(input);}else{input.value=value||'';wrap.append(input);}input.setAttribute('aria-label',label);return {wrap,input};}
let hintSequence=0,activeHintHide=null;
function attachPlayerHint(marker,heading,detail){
 marker.classList.add('player-hint-trigger');marker.tabIndex=0;
 marker.setAttribute('aria-label',heading+': '+detail);
 let tip=null,hovered=false,focused=false,leaveTimer=null;
 const hide=()=>{clearTimeout(leaveTimer);if(activeHintHide===hide)activeHintHide=null;if(tip){tip.remove();tip=null;}marker.removeAttribute('aria-describedby');window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside,true);};
 const dismiss=()=>{hovered=false;focused=false;hide();};
 const escape=event=>{if(event.key==='Escape')dismiss();};
 const outside=event=>{if(!marker.contains(event.target)&&!tip?.contains(event.target))dismiss();};
 const leave=()=>{clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(!hovered&&!focused)hide();},120);};
 const show=()=>{
  clearTimeout(leaveTimer);if(tip)return;activeHintHide?.();activeHintHide=hide;tip=el('div');tip.className='player-hint';tip.id='player-hint-'+(++hintSequence);tip.setAttribute('role','tooltip');tip.append(el('strong',heading),el('span',detail));
  (marker.closest('dialog')||document.body).append(tip);marker.setAttribute('aria-describedby',tip.id);
  const box=marker.getBoundingClientRect(),size=tip.getBoundingClientRect(),gap=8;
  const left=Math.max(gap,Math.min(box.left+box.width/2-size.width/2,window.innerWidth-size.width-gap));
  const top=box.top-size.height-gap>=gap?box.top-size.height-gap:Math.min(box.bottom+gap,window.innerHeight-size.height-gap);
  tip.style.left=left+'px';tip.style.top=Math.max(gap,top)+'px';
  tip.onpointerenter=()=>{hovered=true;};tip.onpointerleave=()=>{hovered=false;leave();};
  window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside,true);
 };
 marker.onpointerenter=()=>{hovered=true;show();};marker.onpointerleave=event=>{hovered=!!tip?.contains(event.relatedTarget);leave();};
 marker.onfocus=()=>{focused=true;show();};marker.onblur=()=>{focused=false;leave();};
 marker.onclick=()=>{focused=true;show();};
 return marker;
}
function exitCell(profile){const cell=el('td');cell.className='exit-column';if(profile.anticipatedExit){const icon=el('span');icon.className='exit-marker';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M10 3H4v18h6M14 8l5 4-5 4M8 12h11');svg.append(path);icon.append(svg);attachPlayerHint(icon,'Anticipated departure','Expected to leave server 1616; not confirmed.'+(profile.exitLabel?' '+profile.exitLabel+'.':''));cell.append(icon);}else cell.append(el('span','—'));return cell;}
function drawServerPlans(body,profile,full){
 const intro=el('p','Anticipated plans only. These do not approve or confirm a transfer.');body.append(intro);
 const hard=(full.plans||[]).filter(p=>p.kind==='hard_save');const hardBox=el('section');hardBox.className='plan-card';hardBox.append(el('h3','Hard-save initiatives'));if(!hard.length)hardBox.append(el('p','No hard-save initiative memberships.'));for(const p of hard){hardBox.append(el('strong',p.name),el('p',`${p.active?'Member':'Removed'} · ${p.enabled?'Initiative on':'Initiative off'} · ${p.startDate||'No start date'} → ${p.endDate||'No end date'}`));}body.append(hardBox);
 for(const plan of (full.plans||[]).filter(p=>p.kind==='server_exit')){const card=el('section');card.className='plan-card';card.append(el('h3',plan.name));if(!plan.enabled)card.append(el('p','This season plan is disabled by Admin.'));const form=el('form');form.className='plan-form';const active=planFormField('Anticipated leaving 1616','checkbox',plan.active),note=planFormField('Departure notes','textarea',plan.note);note.input.maxLength=4000;note.input.rows=4;const save=el('button','Review changes'),feedback=el('p');feedback.setAttribute('role','status');form.append(active.wrap,note.wrap);if(plan.updatedAt)form.append(el('small',`Updated ${new Date(plan.updatedAt).toLocaleString()} · ${plan.updatedBy}`));form.append(save,feedback);form.onsubmit=async event=>{event.preventDefault();if(!await confirmPlanChange('Confirm server plan',[profile.name,plan.name,active.input.checked?'Anticipated departure: On':'Anticipated departure: Off',note.input.value||'No notes']))return;save.disabled=true;try{const saved=await call({action:'profile',profileOperation:'server-plan-save',id:plan.id,playerKey:profile.key,active:active.input.checked,note:note.input.value,expectedRevision:plan.revision,confirmed:true});Object.assign(profile,{anticipatedExit:saved.anticipatedExit,exitLabel:saved.exitLabel});full.plans=saved.plans;directoryCache.clear();profileCache.clear();body.replaceChildren(el('h2','Server Plans'));drawServerPlans(body,profile,full);}catch(error){feedback.textContent='Not saved. Reload the profile if it changed elsewhere. '+error.message;}finally{save.disabled=false;}};card.append(form);body.append(card);}
 if(!(full.plans||[]).some(p=>p.kind==='server_exit'))body.append(el('p','Create a named season departure plan in Admin first.'));
}
let initiativeLoadId=0;
async function loadInitiativeAdmin(){const root=$('player-initiatives-admin');if(!root||location.hash!=='#admin')return;const request=++initiativeLoadId;root.replaceChildren(el('p','Loading player initiatives…'));try{const list=await call({action:'profile',profileOperation:'initiatives-list'});if(request!==initiativeLoadId)return;renderInitiativeAdmin(root,list);}catch(error){root.replaceChildren(el('p','Unable to load initiatives. '+error.message));}}
function renderInitiativeAdmin(root,list){
 root.replaceChildren();const title=el('header'),heading=el('div'),add=el('button','New initiative');heading.append(el('h2','Player initiatives'),el('p','Manage hard-save orders and named season departure plans.'));title.append(heading,add);root.append(title);add.onclick=()=>editInitiative();
 const filters=el('div');filters.className='initiative-filters';const query=el('input'),type=el('select'),state=el('select'),count=el('p');query.type='search';query.placeholder='Search initiatives';query.setAttribute('aria-label','Search initiatives');type.setAttribute('aria-label','Initiative category');state.setAttribute('aria-label','Initiative status');for(const [v,l] of [['all','All categories'],['hard_save','Hard save'],['server_exit','Season departures']]){const o=el('option',l);o.value=v;type.append(o);}for(const [v,l] of [['all','All statuses'],['on','Enabled'],['off','Disabled']]){const o=el('option',l);o.value=v;state.append(o);}const filter=()=>{let visible=0;for(const card of root.querySelectorAll('.initiative-card')){card.hidden=!(card.dataset.name.includes(query.value.trim().toLowerCase())&&(type.value==='all'||card.dataset.kind===type.value)&&(state.value==='all'||card.dataset.state===state.value));if(!card.hidden)visible++;}count.textContent=visible+' initiative'+(visible===1?'':'s');};query.oninput=type.onchange=state.onchange=filter;filters.append(query,type,state);count.className='initiative-count';count.textContent=list.length+' initiatives';root.append(filters,count);if(!list.length)root.append(el('p','No initiatives yet. Create a hard-save order or season departure plan to get started.'));

 const editInitiative=(item={kind:'hard_save',enabled:true})=>{const dialog=el('dialog');dialog.className='strategy-dialog';dialog.setAttribute('aria-label','Edit initiative');dialog.append(el('h2',item.id?'Edit initiative':'New initiative'));const form=el('form');form.className='plan-form';const kindLabel=el('label','Type'),kind=el('select');kind.setAttribute('aria-label','Initiative type');for(const [v,l] of [['hard_save','Hard save'],['server_exit','Season departure']]){const o=el('option',l);o.value=v;kind.append(o);}kind.value=item.kind;kind.disabled=!!item.id;kindLabel.append(kind);const name=planFormField('Unique initiative name','text',item.name),enabled=planFormField('Initiative enabled','checkbox',item.enabled),start=planFormField('Start date','date',item.startDate),end=planFormField('End date','date',item.endDate);name.input.required=true;name.input.minLength=3;name.input.maxLength=120;const help=el('p','Dates are inclusive in server time (UTC). Leave end date blank for an ongoing initiative.'),feedback=el('p'),foot=el('footer'),cancel=el('button','Cancel'),save=el('button','Review changes');cancel.type='button';cancel.onclick=()=>dialog.close();foot.append(cancel,save);form.append(kindLabel,name.wrap,enabled.wrap,start.wrap,end.wrap,help,feedback,foot);form.onsubmit=async event=>{event.preventDefault();if(start.input.value&&end.input.value&&end.input.value<start.input.value){feedback.textContent='End date must be on or after the start date.';return;}if(!await confirmPlanChange('Confirm initiative',[name.input.value,enabled.input.checked?'Enabled':'Disabled',`${start.input.value||'No start date'} → ${end.input.value||'No end date'}`]))return;save.disabled=true;try{const next=await call({action:'profile',profileOperation:'initiative-save',id:item.id||'',kind:kind.value,name:name.input.value,enabled:enabled.input.checked,startDate:start.input.value,endDate:end.input.value,expectedRevision:item.revision||0,confirmed:true});directoryCache.clear();profileCache.clear();dialog.close();renderInitiativeAdmin(root,next);}catch(error){feedback.textContent='Not saved. Use a unique name and valid dates; reload if another admin changed this initiative. '+error.message;}finally{save.disabled=false;}};dialog.append(form);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();};
 for(const item of list){const card=el('details');card.className='plan-card initiative-card';card.dataset.name=item.name.toLowerCase();card.dataset.kind=item.kind;card.dataset.state=item.enabled?'on':'off';const summary=el('summary',`${item.name} · ${item.enabled?'On':'Off'} · ${item.members.length} players`);card.append(summary,el('p',`${item.kind==='hard_save'?'Hard save':'Season departure'} · ${item.startDate||'No start date'} → ${item.endDate||'No end date'}`));const edit=el('button','Edit settings');edit.onclick=()=>editInitiative(item);card.append(edit);const feedback=el('p');feedback.setAttribute('role','status');
 const mutate=async(player,active)=>{if(!await confirmPlanChange(active?'Add player to initiative':'Remove player from initiative',[player.name,item.name,active?'Add to the initiative.':'End membership; saved history is retained.']))return;try{const next=await call({action:'profile',profileOperation:'initiative-member-save',id:item.id,playerKey:player.key,active,expectedRevision:item.revision,confirmed:true});directoryCache.clear();profileCache.clear();renderInitiativeAdmin(root,next);const updated=Array.from(root.querySelectorAll('details')).find(d=>d.querySelector('summary')?.textContent.startsWith(item.name+' ·'));if(updated)updated.open=true;}catch(error){feedback.textContent='Not saved. Refresh initiatives if changed elsewhere. '+error.message;}};
 const searchForm=el('form');searchForm.className='plan-search';const search=el('input'),find=el('button','Find player'),results=el('div');search.type='search';search.required=true;search.minLength=2;search.placeholder='Search any alliance by player name';search.setAttribute('aria-label',`Find players for ${item.name}`);searchForm.append(search,find);searchForm.onsubmit=async event=>{event.preventDefault();find.disabled=true;results.replaceChildren(el('p','Searching…'));try{const matches=await call({action:'player-search',query:search.value.trim()});results.replaceChildren();for(const p of matches){const button=el('button',`${p.name} · ${p.alliance||'Unknown alliance'} · Server ${p.server||'Unknown'}`);button.disabled=item.members.some(m=>m.key===p.key);button.onclick=()=>mutate(p,true);results.append(button);}if(!matches.length)results.append(el('p','No matching players.'));else if(matches.length===30)results.append(el('p','Showing 30 matches. Refine the name if needed.'));}catch(error){results.replaceChildren(el('p',error.message));}finally{find.disabled=false;}};card.append(searchForm,results,feedback);
 const memberTitle=el('h3','Assigned players');card.append(memberTitle);const members=el('div');members.className='initiative-members';for(const p of item.members){const row=el('div'),name=el('button',p.name),remove=el('button','Remove');name.type='button';name.className='initiative-player-link';name.setAttribute('aria-label',`Open ${p.name} profile`);name.onclick=()=>showDirectoryProfile(p);const alliance=el('small',p.alliance||'Unknown alliance');const identity=el('div');identity.className='initiative-player-identity';identity.append(name,alliance);remove.setAttribute('aria-label',`Remove ${p.name} from ${item.name}`);remove.onclick=()=>mutate(p,false);row.append(identity,remove);members.append(row);}if(!item.members.length)members.append(el('p','No players added yet.'));card.append(members);root.append(card);}
}
window.addEventListener('hashchange',loadInitiativeAdmin);window.addEventListener('nova-initiatives-open',loadInitiativeAdmin);

function drawPlayerBounties(body,full){
 const history=(full.bounties||[]).filter(item=>item.submittedByPlayer);
 body.append(el('p','This player’s submissions only. Scores recorded in someone else’s screenshots appear under the relevant activity tab.'));
 if(!history.length){const box=el('div');box.className='player-empty';box.append(el('h3','No personal bounty submissions'),el('p','Being listed in a leaderboard does not create a submission or award bounty points.'));body.append(box);return;}
 const tools=el('div');tools.className='hr-tools';const search=el('input');search.type='search';search.placeholder='Search bounty or date';search.setAttribute('aria-label','Search bounty history');const filter=el('select');filter.setAttribute('aria-label','Bounty status');for(const v of ['All statuses','approved','submitted','rejected']){const o=el('option',v);filter.append(o);}tools.append(search,filter);body.append(tools);const list=el('div'),pager=el('div');body.append(list,pager);let page=0;
 const render=()=>{list.replaceChildren();pager.replaceChildren();const rows=history.filter(r=>(filter.value==='All statuses'||r.state===filter.value)&&[r.bounty,r.gameDate].join(' ').toLowerCase().includes(search.value.trim().toLowerCase()));page=Math.min(page,Math.max(0,Math.ceil(rows.length/10)-1));
 for(const item of rows.slice(page*10,page*10+10)){const card=el('details');card.className='bounty-history-row';card.append(el('summary',`${item.bounty} · ${item.gameDate||'—'} · ${item.state} · ${item.pointsAwarded??0} points awarded`));card.append(profileLine('Submitted',item.submittedAt?new Date(item.submittedAt).toLocaleString():'Not submitted'),profileLine('Screenshots',String(item.fileCount||0)),profileLine('Reviewed',item.reviewedAt?new Date(item.reviewedAt).toLocaleString():'Awaiting review'));if(item.reviewNote)card.append(el('p',item.reviewNote));list.append(card);}
 if(!rows.length)list.append(el('p','No submissions match these filters.'));const prev=el('button','Previous'),next=el('button','Next');prev.disabled=page===0;next.disabled=(page+1)*10>=rows.length;prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};pager.append(prev,el('span',` ${rows.length} submissions · Page ${page+1} of ${Math.max(1,Math.ceil(rows.length/10))} `),next);};search.oninput=filter.onchange=()=>{page=0;render();};render();
}

function setPlayerPhoto(container,value,name){
 let source='';if(typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))source=value;
 else{try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='lastwar-cdn.akamaized.net')source=url.href;}catch{}}
 if(!source){container.title='No profile photo saved';return;}
 const image=el('img');image.alt=`${name||'Player'} profile photo`;image.referrerPolicy='no-referrer';image.onload=()=>container.replaceChildren(image);image.onerror=()=>{container.title='Profile photo unavailable';};image.src=source;
}

function drawPlayerHR(body,profile,full){
 body.classList.add('hr-workspace');
 const message=el('p','Keep leadership aligned on attendance, support, recognition and follow-ups.');body.append(message);
 const summary=el('div');summary.className='hr-summary';body.append(summary);
 const composer=el('details');composer.className='hr-composer';composer.open=!(full.hr||[]).length;composer.append(el('summary','＋ Add a leadership record'));body.append(composer);
 const form=el('form');form.className='player-info-card hr-form';form.append(el('h3','Add a record'));
 const field=(label,type,value='')=>{const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;wrap.append(input);form.append(wrap);return input;};
 const author=field('Your in-game name','text',full.viewerName||'Leadership');author.readOnly=true;author.title='Managed in Admin → Leadership & Access';
 const categoryWrap=el('label','Category'),category=el('select');for(const name of ['General','Attendance','Performance','Recognition','Conduct','Roster change']){const option=el('option',name);option.value=name;category.append(option);}categoryWrap.append(category);form.append(categoryWrap);
 const title=field('Title','text');title.required=true;title.maxLength=160;
 const details=field('Notes','textarea');details.required=true;details.maxLength=8000;details.rows=4;
 const date=field('Event date','date',new Date().toISOString().slice(0,10));date.required=true;
 const followUp=field('Follow-up date (optional)','date');
 const save=el('button','Save record');save.type='submit';const status=el('p');status.setAttribute('role','status');form.append(save,status);composer.append(form);
 const tools=el('div');tools.className='hr-tools';
 const search=el('input');search.type='search';search.placeholder='Search notes, titles or authors';search.setAttribute('aria-label','Search HR history');
 const filter=el('select');filter.setAttribute('aria-label','Filter HR history');for(const value of ['All records','Open','In progress','Resolved','Overdue']){const option=el('option',value);filter.append(option);}
 tools.append(search,filter);body.append(tools);const history=el('div');history.className='hr-history';body.append(history);
 const today=new Date().toLocaleDateString('en-CA'),overdue=record=>record.status!=='Resolved'&&record.follow_up&&record.follow_up<today;
 category.onchange=()=>{details.placeholder=({General:'Context, decision and next steps…',Attendance:'Dates affected, availability and agreed return date…',Performance:'Observed results, agreed targets and support offered…',Recognition:'Contribution or achievement to recognize…',Conduct:'What happened, discussion and agreed follow-up…','Roster change':'Change, effective date and handover details…'})[category.value];};category.onchange();
 search.oninput=()=>render();filter.onchange=()=>render();
 const render=()=>{
 const all=full.hr||[];summary.replaceChildren();for(const [label,count] of [['Active follow-ups',all.filter(r=>r.status!=='Resolved').length],['Overdue',all.filter(overdue).length],['Resolved',all.filter(r=>r.status==='Resolved').length]]){const stat=el('div');stat.append(el('strong',String(count)),el('span',label));summary.append(stat);}
 history.replaceChildren(el('h3','Leadership history'));
 const query=search.value.trim().toLowerCase();const records=all.filter(r=>(filter.value==='All records'||(filter.value==='Overdue'?overdue(r):r.status===filter.value))&&[r.title,r.details,r.author_name,r.category].join(' ').toLowerCase().includes(query));
 if(!records.length){const empty=el('div');empty.className='player-empty';empty.append(el('h3',all.length?'No matching records':'Start this player’s leadership history'),el('p',all.length?'Try another filter or search.':'Record a conversation, recognize a contribution, or set a follow-up date.'));history.append(empty);return;}
 for(const record of records){const card=el('section');card.className='player-info-card hr-entry';card.dataset.status=record.status;const heading=el('div');heading.className='hr-entry-heading';const badge=el('span',overdue(record)?'Overdue':record.status);badge.className='hr-badge'+(overdue(record)?' hr-overdue':'');heading.append(el('h3',record.title),badge);card.append(heading,el('small',`${record.category} · Event: ${record.event_date}`));const notes=el('p',record.details);notes.style.whiteSpace='pre-wrap';card.append(notes,el('p',`Added by ${record.author_name} · ${new Date(record.created_at).toLocaleString()}`));if(record.follow_up)card.append(el('p',`Follow-up: ${record.follow_up}`));
 const label=el('label','Status'),select=el('select');for(const value of ['Open','In progress','Resolved']){const option=el('option',value);option.value=value;select.append(option);}select.value=record.status;label.append(select);card.append(label);const feedback=el('p');feedback.setAttribute('role','status');card.append(feedback);
 select.onchange=async()=>{select.disabled=true;try{const data=await call({action:'profile',playerKey:profile.key,hrOperation:'status',entryId:record.id,revision:record.revision,status:select.value});full.hr=data.hr;render();}catch(error){select.value=record.status;feedback.textContent='Unable to update. Reopen the profile if another leader changed this record. '+error.message;}finally{select.disabled=false;}};
 if(record.revision>1)card.append(el('small',`Updated ${new Date(record.updated_at).toLocaleString()} by ${record.updated_by}`));history.append(card);
 }};
 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;status.textContent='Saving…';try{const data=await call({action:'profile',playerKey:profile.key,hrOperation:'create',authorName:author.value,category:category.value,title:title.value,details:details.value,eventDate:date.value,followUp:followUp.value});full.hr=data.hr;title.value='';details.value='';followUp.value='';status.textContent='Saved to player record.';search.value='';filter.value='All records';render();}catch(error){status.textContent='Not saved. '+error.message;}finally{save.disabled=false;}};
 render();
}

async function showDirectoryProfile(profile,initialTab='all'){
 profileCache.set(profile.key,profile);const out=$('directory-profile');document.body.append(out);out.replaceChildren();
 const header=el('header'),identity=el('div'),avatar=el('div',(profile.name||'?').trim().slice(0,1).toUpperCase()),title=el('div'),heading=el('h2',profile.name||'Player profile');header.className='player-header';identity.className='player-identity';avatar.className='player-avatar';title.append(el('small','ALLIANCE HUB · PLAYER RECORD'),heading,el('p',`[${profile.alliance||'Unknown'}] · Server ${profile.server||'—'}${profile.allianceRank?' · '+profile.allianceRank:''}`));identity.append(avatar,title);header.append(identity);const close=el('button','Close ×');close.className='player-close';close.onclick=()=>out.close?out.close():out.replaceChildren();header.append(close);out.append(header);out.setAttribute('aria-label',`${profile.name||'Player'} profile`);if(out.showModal&&!out.open)out.showModal();
 const layout=el('div'),tabs=el('nav'),body=el('section');layout.className='player-layout';tabs.className='player-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Player profile sections');body.className='player-body';body.setAttribute('role','tabpanel');layout.append(tabs,body);out.append(layout);body.textContent='Loading player record…';
 try{const full=await call({action:'profile',playerKey:profile.key,includeActivity:true});if(!heading.isConnected)return;Object.assign(profile,full.details||{});heading.textContent=profile.name||'Player profile';setPlayerPhoto(avatar,full.avatarUrl,profile.name);const badges=el('div');badges.className='profile-access-badges';const rankValue=/^R[1-5]$/.test(profile.allianceRank||'')?profile.allianceRank:null;const rank=el('span',rankValue||'Rank not recorded');rank.className=rankValue?'alliance-rank-badge':'rank-unrecorded';rank.title='Alliance membership rank (R1–R5). This does not grant portal access.';badges.append(rank);if(['R4','R5'].includes(rankValue))badges.append(el('span','Leader'));title.querySelector('p').textContent=`[${profile.alliance||'Unknown'}] · Server ${profile.server||'—'}`;const portal=full.portalAccess;for(const [label,key] of [['Alliance Hub','allianceHub'],['Transfer Portal','transferPortal']]){const badge=el('span',label+': '+(portal?.linked?portal[key]:'Not linked'));badge.title=portal?.linked?'Verified account access. Alliance rank does not grant portal permissions.':'No admin account has been linked to this player yet.';badges.append(badge);}title.append(badges);const choices=[['all','Overview'],['vs','Alliance Duel'],['donations','Alliance Donations'],['desert_storm','Desert Storm'],['canyon_storm','Canyon Storm'],['bounties','Bounties'],['trains','Trains'],['hr','Human Resources'],['server_plans','Server Plans'],['reports','Reports']];
 const facts=(label,values)=>{const section=el('section');section.className='player-info-card';section.append(el('h3',label));const list=el('dl');for(const [key,value] of values){const pair=el('div');pair.append(el('dt',key),el('dd',value===undefined||value===null||value===''?'Not recorded':String(value)));list.append(pair);}section.append(list);return section;};
 const empty=(title,description)=>{const box=el('div');box.className='player-empty';box.append(el('h3',title),el('p',description));body.append(box);};
 const draw=key=>{body.classList.remove('hr-workspace','participation-reports');body.replaceChildren();for(const button of tabs.children)button.setAttribute('aria-selected',String(button.dataset.key===key));const name=choices.find(c=>c[0]===key)[1];body.append(el('h2',name));
 if(key==='desert_storm')loadStormHistory(body,call,profile.key);
 if(key==='trains'){loadTrainHistory(body,call,profile.key);return;}
 if(key==='reports'){renderReports(body,full);return;}
 if(key==='server_plans'){drawServerPlans(body,profile,full);return;}
 if(key==='hr'){drawPlayerHR(body,profile,full);return;}
 if(key==='bounties'){drawPlayerBounties(body,full);return;}
 if(key==='all'){const edit=el('button','Edit player details');edit.className='overview-edit';edit.onclick=()=>{if(!body.querySelector('form'))editPlayerOverview(body,profile,full,updated=>showDirectoryProfile(updated));};body.append(edit);const grid=el('div');grid.className='player-info-grid';grid.append(facts('Player details',[['Player name',profile.name],['Translated name',profile.translatedName],['Alliance',profile.alliance],['Alliance rank',profile.allianceRank],['Hard save',profile.hardSave?(profile.hardSaveLabel||'Active hard-save order'):'No active order'],['Server',profile.server],['Aliases',(profile.aliases||[]).join(' · ')],['Previous in-game names',(profile.previousGameNames||[]).map(n=>typeof n==='string'?n:[n.name,n.date?new Date(n.date).toLocaleDateString():null].filter(Boolean).join(' · ')).join(' / ')]]),facts('Game statistics',[['Hero power (M)',profile.power],['Profession level',profile.profession],['Kills',profile.kills==null?null:formatScore(profile.kills)]]));body.append(grid);const hardSavePair=Array.from(grid.querySelectorAll('dl>div')).find(node=>node.querySelector('dt')?.textContent==='Hard save');if(profile.hardSave&&hardSavePair)hardSavePair.querySelector('dd').prepend(hardSaveMarker(profile),document.createTextNode(' '));return;}
 else body.append(el('p',key==='vs'?'Daily target: 7,200,000 · Six play days each week':key==='donations'?'Weekly target: 35,000 · One weekly donation screenshot':'Approved event results linked to this player.'));
 const rows=(full.activity||[]).filter(item=>key==='all'||item.metric===key);if(!rows.length){empty('No confirmed activity yet','Approved results will appear here. Pending screenshot submissions are kept in review until confirmed.');return;}const table=el('table');table.className='player-activity-table';const head=el('tr');for(const label of ['Event','Game date','Period','Score','Details'])head.append(el('th',label));table.append(head);for(const item of rows){const tr=el('tr');for(const value of [choices.find(c=>c[0]===item.metric)?.[1]||item.metric,item.date,item.period,formatScore(item.score)])tr.append(el('td',value));const cell=el('td'),details=el('details');details.append(el('summary','Full details'));const evidence=(full.bounties||[]).find(b=>b.bounty===item.bounty&&b.gameDate===item.date);details.append(profileLine('Source',item.bounty),profileLine('Record','Confirmed leaderboard score · no bounty reward for being listed'));if(evidence){details.append(profileLine('Screenshots',String(evidence.fileCount||0)),profileLine('Review status',evidence.state),profileLine('Reviewed',evidence.reviewedAt?new Date(evidence.reviewedAt).toLocaleString():'Not recorded'));if(evidence.reviewNote)details.append(el('p',evidence.reviewNote));}cell.append(details);tr.append(cell);table.append(tr);}body.append(table);};
 for(const [key,label] of choices){const button=el('button',label);button.type='button';button.dataset.key=key;button.setAttribute('role','tab');button.onclick=()=>draw(key);tabs.append(button);}draw(initialTab);
 }catch(error){body.replaceChildren(el('h2','Unable to load player record'),el('p',error.message));}

 if(draft&&selected>=0){const attach=el('button','Use this player for the selected OCR row');attach.className='primary directory-attach';attach.onclick=()=>{const row=draft.rows[selected];row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();renderRows();selectRow(selected);status(`${profile.name} attached as an unconfirmed match. Confirm the player and alliance after checking the evidence.`);};out.append(attach);}
}

let recordsPage=0,recordsQuery='',rosterOnly=false,duelOnly=false,directoryRequestId=0;
let rosterMetric='vs';
// Short-lived, memory-only cache; explicit Search always refreshes live data.
const directoryCache=new Map(),directoryPending=new Map();
let renderedDirectoryKey='';
async function loadDirectory(request,force=false){
 const key=JSON.stringify(request),cached=directoryCache.get(key);
 if(!force&&cached&&Date.now()-cached.savedAt<30000)return cached.players;
 if(directoryPending.has(key))return directoryPending.get(key);
 const pending=(async()=>{
  const players=await call(request);
  if(request.alliance==='NvSP'){
   const pages=Math.ceil((players[0]?.totalCount||players.length)/30);
   // Bound concurrency to three requests while preserving page order.
   for(let page=1;page<pages;page+=3){
    const rest=await Promise.all(Array.from({length:Math.min(3,pages-page)},(_,i)=>call({...request,page:page+i})));
    players.push(...rest.flat());
   }
  }
  if(directoryCache.size>=20)directoryCache.delete(directoryCache.keys().next().value);
  directoryCache.set(key,{players,savedAt:Date.now()});
  return players;
 })();
 directoryPending.set(key,pending);
 try{return await pending;}finally{directoryPending.delete(key);}
}

function mondayOf(value=new Date()){const d=new Date(value);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
let rosterWeek=mondayOf();
function drawDuelStrategy(results,week){
 const box=el('section');box.className='duel-strategy';box.setAttribute('aria-label','Weekly Alliance Duel strategy');box.append(el('span','Loading weekly strategy…'));results.append(box);
 let strategy;
 const labels={unset:'Not set',hold:'Hold / Save',win:'Win week'};
 const descriptions={unset:'Choose the plan for this week.',hold:'Open daily boxes at 7.2M. Save remaining resources.',win:'Secure the matchup. Spend only what is needed.'};
 const weekLabel=new Date(week+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
 const render=()=>{box.replaceChildren();box.dataset.mode=strategy.mode;const top=el('div'),identity=el('div'),badge=el('strong',labels[strategy.mode]),copy=el('span',descriptions[strategy.mode]),edit=el('button',strategy.mode==='unset'?'Set strategy':'Change');top.className='strategy-strip';identity.className='strategy-identity';badge.className='strategy-badge';identity.append(el('span','WEEKLY PLAN'),badge,copy);edit.type='button';edit.setAttribute('aria-label','Change weekly strategy');edit.onclick=editStrategy;top.append(identity,edit);box.append(top);if(strategy.note){const note=el('p',strategy.note);note.className='strategy-leadership-note';box.append(note);}};
 const editStrategy=()=>{
 const dialog=el('dialog');dialog.className='strategy-dialog';dialog.setAttribute('aria-label','Set weekly Alliance Duel strategy');document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());
 let selected=strategy.mode,draftNote=strategy.note;
 const header=()=>{const h=el('header'),titles=el('div'),close=el('button','×');titles.append(el('small',`ALLIANCE DUEL · WEEK OF ${weekLabel.toUpperCase()}`),el('h2','Weekly strategy'));close.type='button';close.setAttribute('aria-label','Close strategy editor');close.onclick=()=>dialog.close();h.append(titles,close);dialog.append(h);};
 const edit=()=>{dialog.replaceChildren();header();const form=el('form'),choices=el('fieldset'),legend=el('legend','What is the plan?');choices.append(legend);choices.className='strategy-choices';
 for(const mode of ['hold','win']){const card=el('label'),radio=el('input'),text=el('span');card.className='strategy-choice';radio.type='radio';radio.name='duel-mode';radio.value=mode;radio.checked=selected===mode;radio.required=true;radio.onchange=()=>{selected=mode;};text.append(el('strong',labels[mode]),el('span',mode==='hold'?'Reach 7,200,000 each day, open boxes, and save resources.':'Win the week against the opponent while conserving resources.'));card.append(radio,text);choices.append(card);}
 const noteLabel=el('label','Leadership note'),optional=el('small','Optional'),note=el('textarea');noteLabel.className='strategy-note-label';noteLabel.append(optional);note.id='strategy-leadership-note';noteLabel.htmlFor=note.id;note.maxLength=1000;note.rows=3;note.placeholder='Opponent, priority days, or when to stop spending…';note.value=draftNote;note.oninput=()=>{draftNote=note.value;};
 const foot=el('footer'),cancel=el('button','Cancel'),next=el('button','Review changes');cancel.type='button';cancel.onclick=()=>dialog.close();next.className='primary';foot.append(cancel,next);form.append(choices,el('p','Daily minimum stays at 7,200,000 in both modes.'),noteLabel,note);if(strategy.updatedAt){const audit=el('details');audit.className='strategy-audit';audit.append(el('summary','Last updated'),el('small',`${new Date(strategy.updatedAt).toLocaleString()} · ${strategy.updatedBy}`));form.append(audit);}form.append(foot);form.onsubmit=event=>{event.preventDefault();review();};dialog.append(form);};
 const review=()=>{dialog.replaceChildren();header();const content=el('section');content.className='strategy-review';content.append(el('small',`WEEK OF ${weekLabel.toUpperCase()}`),el('h3',labels[selected]),el('p',descriptions[selected]));if(draftNote.trim())content.append(el('blockquote',draftNote.trim()));content.append(el('p','This plan will be visible to leadership on the NvSP roster.'));const foot=el('footer'),back=el('button','Back'),save=el('button','Confirm & save'),status=el('p');status.setAttribute('role','status');back.type=save.type='button';save.className='primary';back.onclick=edit;save.onclick=async()=>{save.disabled=back.disabled=true;status.textContent='Saving…';try{strategy=await call({action:'profile',profileOperation:'week-save',week,mode:selected,note:draftNote,expectedRevision:strategy.revision,confirmed:true});if(box.isConnected)render();dialog.close();}catch(error){status.textContent='Not saved. Reload the roster if another leader changed this week. '+error.message;save.disabled=back.disabled=false;}};foot.append(back,save);dialog.append(content,status,foot);};
 edit();dialog.showModal();};
 call({action:'profile',profileOperation:'week-get',week}).then(value=>{if(!box.isConnected)return;strategy=value;render();}).catch(()=>{box.replaceChildren(el('p','Weekly strategy could not be loaded. Refresh the roster to retry.'));});
}
function hardSaveMarker(profile){const marker=el('span',profile.hardSave?'H':'—');marker.className=profile.hardSave?'hard-save-marker':'hard-save-empty';if(profile.hardSave)attachPlayerHint(marker,'Hard save','Conserve resources.'+(profile.hardSaveLabel?' '+profile.hardSaveLabel+'.':''));else marker.setAttribute('aria-label','No hard save order recorded');return marker;}
function hardSaveCell(profile){const cell=el('td');cell.className='hard-save-column';cell.append(hardSaveMarker(profile));return cell;}
const rosterExtras=[['Alliance','alliance'],['Server','server'],['Hero power','power'],['Kills','kills'],['Profession level','profession']];
const viewStorageKey=metric=>'nova-roster-view-v1:'+String(user?.uid||user?.email||'signed-out')+':'+metric;
function rosterPreferences(){const fallback={hidden:rosterExtras.map(x=>x[0]),filter:{mode:'all',children:[]}};try{const value=JSON.parse(localStorage.getItem(viewStorageKey(rosterMetric))||'null');return value&&Array.isArray(value.hidden)&&value.filter?.children?value:fallback;}catch{return fallback;}}
function saveRosterPreferences(prefs){try{localStorage.setItem(viewStorageKey(rosterMetric),JSON.stringify(prefs));}catch{}}
function rosterFilterFields(){const common=[['name','Player name','text'],['allianceRank','Rank','text'],['alliance','Alliance','text'],['server','Server','text'],['hardSave','Hard save','boolean'],['anticipatedExit','Anticipated leaving 1616','boolean'],['power','Hero power (M)','number'],['kills','Kills','number'],['profession','Profession level','number'],['weekly','Weekly total','number']];return rosterMetric==='vs'?[...common,...['Mon','Tue','Wed','Thu','Fri','Sat'].map((day,i)=>['day'+i,day+' score','number']),['below','Days below 7,200,000','number'],['missing','Days not recorded','number']]:[...common,['target','Meets 35,000 target','boolean']];}
function rosterFilterValue(player,key){const summary=player.daily?.[rosterMetric];if(key==='weekly'){if(summary?.weeklyTotal!=null)return Number(summary.weeklyTotal);if(rosterMetric==='donations')return null;const values=Object.values(summary?.days||{}).filter(v=>v!=null);return values.length?values.reduce((n,v)=>n+Number(v),0):null;}if(key==='target')return summary?.weeklyTotal==null?null:Number(summary.weeklyTotal)>=35000;if(key==='below'||key==='missing'){const values=Array.from({length:6},(_,i)=>rosterFilterValue(player,'day'+i));return key==='missing'?values.filter(v=>v==null).length:values.filter(v=>v!=null&&Number(v)<7200000).length;}if(/^day[0-5]$/.test(key)){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+Number(key.slice(3)));return summary?.days?.[d.toISOString().slice(0,10)]??null;}return player[key]??null;}
function rosterMatches(player,node,depth=0){if(depth>3)return true;if(Array.isArray(node.children)){if(!node.children.length)return true;return node.mode==='any'?node.children.some(n=>rosterMatches(player,n,depth+1)):node.children.every(n=>rosterMatches(player,n,depth+1));}const field=rosterFilterFields().find(f=>f[0]===node.field);if(!field)return true;const value=rosterFilterValue(player,node.field),empty=value==null||value==='';if(node.op==='empty')return empty;if(node.op==='notempty')return !empty;if(empty)return false;const a=field[2]==='number'?Number(value):String(value).toLowerCase(),b=field[2]==='number'?Number(node.value):String(node.value??'').toLowerCase();return ({eq:()=>a===b,ne:()=>a!==b,contains:()=>String(a).includes(b),notcontains:()=>!String(a).includes(b),gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b}[node.op]||(()=>true))();}
function drawRosterViewTools(results,players,prefs,config={}){
 const fieldsForFilter=config.filterFields||rosterFilterFields,save=config.save||saveRosterPreferences,redraw=config.redraw||(()=>{results.replaceChildren();drawRoster(players,results);});
 const tools=el('div');tools.className='personal-view-tools';tools.append(el('small','YOUR VIEW'));const filters=el('details'),columns=el('details'),reset=el('button','Reset my view');filters.className=columns.className='view-popover';filters.append(el('summary',prefs.filter.children.length?'Filter · active':'Filter'));columns.append(el('summary','Columns'));const form=el('form');form.className='filter-builder';let draft=JSON.parse(JSON.stringify(prefs.filter));
 const build=()=>{form.replaceChildren();const paint=(group,depth=0)=>{const block=el('fieldset');block.className='filter-group';const join=el('select');join.setAttribute('aria-label','Match conditions');for(const [v,l] of [['all','All conditions (AND)'],['any','Any condition (OR)']]){const o=el('option',l);o.value=v;join.append(o);}join.value=group.mode;join.onchange=()=>group.mode=join.value;block.append(join);group.children.forEach((condition,index)=>{const row=el('div');row.className='filter-condition';if(condition.children)row.append(paint(condition,depth+1));else{const field=el('select'),op=el('select');field.setAttribute('aria-label','Filter field');op.setAttribute('aria-label','Filter operator');for(const [v,l] of fieldsForFilter()){const o=el('option',l);o.value=v;field.append(o);}field.value=condition.field;const type=fieldsForFilter().find(x=>x[0]===field.value)?.[2]||'text';for(const [v,l] of [['eq','is'],['ne','is not'],...(type==='number'?[['gt','is greater than'],['gte','is at least'],['lt','is less than'],['lte','is at most']]:type==='text'?[['contains','contains'],['notcontains','does not contain']]:[]),['empty','is empty'],['notempty','is not empty']]){const o=el('option',l);o.value=v;op.append(o);}op.value=condition.op;const value=el(type==='boolean'?'select':'input');value.setAttribute('aria-label','Filter value');if(type==='boolean'){for(const v of ['true','false']){const o=el('option',v==='true'?'Yes':'No');o.value=v;value.append(o);}}else value.type=type==='number'?'number':'text';value.value=condition.value??(type==='boolean'?'true':'');value.hidden=['empty','notempty'].includes(condition.op);if(type!=='boolean'&&!value.hidden)value.required=true;value.oninput=()=>condition.value=value.value;field.onchange=()=>{condition.field=field.value;condition.op='eq';condition.value=fieldsForFilter().find(x=>x[0]===field.value)?.[2]==='boolean'?'true':'';build();};op.onchange=()=>{condition.op=op.value;build();};row.append(field,op,value);}const remove=el('button','×');remove.type='button';remove.setAttribute('aria-label','Remove condition');remove.onclick=()=>{group.children.splice(index,1);build();};row.append(remove);block.append(row);});const add=el('button','+ Add condition');add.type='button';add.onclick=()=>{group.children.push({field:'name',op:'contains',value:''});build();};block.append(add);if(depth<2){const groupButton=el('button','+ Add group');groupButton.type='button';groupButton.onclick=()=>{group.children.push({mode:'all',children:[{field:'name',op:'contains',value:''}]});build();};block.append(groupButton);}return block;};form.append(paint(draft));const foot=el('div'),clear=el('button','Clear filters'),apply=el('button','Apply filters');clear.type='button';clear.onclick=()=>{draft={mode:'all',children:[]};build();};foot.append(clear,apply);form.append(foot);};build();form.onsubmit=event=>{event.preventDefault();prefs.filter=draft;save(prefs);redraw();};filters.append(form);
 const fields=config.columns|| (rosterMetric==='vs'?['Player','Rank','Hard save','Anticipated leaving 1616','Mon','Tue','Wed','Thu','Fri','Sat','Weekly total']:['Player','Rank','Hard save','Anticipated leaving 1616','Weekly donations','Minimum','Status']);const colOptions=el('div');colOptions.className='view-column-options';for(const label of [...fields,...(config.columns?[]:rosterExtras.map(x=>x[0]))]){const wrap=el('label'),input=el('input');input.type='checkbox';input.checked=!prefs.hidden.includes(label);input.disabled=label==='Player'||label==='Player name';input.setAttribute('role','switch');input.setAttribute('aria-label',label);input.onchange=()=>{prefs.hidden=input.checked?prefs.hidden.filter(x=>x!==label):[...new Set([...prefs.hidden,label])];save(prefs);applyRosterVisibility(results,prefs);};wrap.append(input,document.createTextNode(label));colOptions.append(wrap);}columns.append(colOptions);reset.type='button';reset.onclick=()=>{if(config.reset){config.reset();return;}try{localStorage.removeItem(viewStorageKey(rosterMetric));}catch{}redraw();};tools.append(filters,columns,reset);const count=el('small',config.count??`${players.filter(p=>rosterMatches(p,prefs.filter)).length} of ${players.length} players`);count.className='view-count';count.title='Filters and columns are saved only for your view on this browser.';tools.append(count);results.append(tools);
}
function applyRosterVisibility(results,prefs){results.querySelectorAll('[data-roster-column]').forEach(cell=>cell.hidden=prefs.hidden.includes(cell.dataset.rosterColumn));}
function finishRosterTable(table,players,results,prefs){const heads=Array.from(table.querySelectorAll('th'));for(const th of heads)th.dataset.rosterColumn=th.firstChild?.textContent||th.textContent;const header=table.querySelector('tr');for(const [label] of rosterExtras){const th=el('th',label);th.dataset.rosterColumn=label;header.append(th);}const labels=Array.from(header.children).map(th=>th.dataset.rosterColumn);Array.from(table.querySelectorAll('tr')).slice(1).forEach((row,index)=>{const player=players[index];for(const [label,key] of rosterExtras)row.append(el('td',player[key]==null?'—':key==='kills'?formatScore(player[key]):player[key]));Array.from(row.children).forEach((cell,i)=>cell.dataset.rosterColumn=labels[i]);});results.append(table);applyRosterVisibility(results,prefs);}

function drawRoster(players,results){
 const allPlayers=players,prefs=rosterPreferences();
 const controls=el('div');controls.className='roster-controls';
 for(const [metric,label] of (duelOnly?[['vs','Alliance Duel / VS']]:[['vs','Alliance Duel / VS'],['donations','Alliance Donations']])){const b=el('button',label);b.className=metric===rosterMetric?'active':'';b.onclick=()=>{rosterMetric=metric;results.replaceChildren();drawRoster(allPlayers,results);};controls.append(b);}
 const label=el('label','Week of '),date=el('input');date.type='date';date.value=rosterWeek;date.onchange=()=>{if(date.value){rosterWeek=mondayOf(date.value+'T00:00:00Z');searchDirectory();}};label.append(date);controls.append(label);const reports=el('button','Player reports');reports.type='button';reports.onclick=()=>{let picker=results.querySelector('.roster-report-picker');if(picker){picker.remove();return;}picker=el('div');picker.className='roster-report-picker';const select=el('select');select.setAttribute('aria-label','Player for report');for(const p of allPlayers){const option=el('option',p.name);option.value=p.key;select.append(option);}const open=el('button','Open report');open.onclick=()=>showDirectoryProfile(allPlayers.find(p=>String(p.key)===select.value),'reports');picker.append(el('span','Choose a player to chart their actual scores'),select,open);controls.after(picker);};controls.append(reports);results.append(controls);players=allPlayers.filter(p=>rosterMatches(p,prefs.filter));
 if(rosterMetric==='donations'){
  results.append(el('p','Weekly donation minimum: 35,000 points (5,000 × 7). Submit the weekly ranking screenshot before reset. Green: at or above target · Red: below target · —: not confirmed.'));
  drawRosterViewTools(results,allPlayers,prefs);const table=el('table');table.className='r4-table contacts-table roster-grid';const head=el('tr');for(const text of ['Player','Rank','Hard save','Anticipated leaving 1616','Weekly donations','Minimum','Status'])head.append(el('th',text));table.append(head);
  for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.onclick=()=>showDirectoryProfile(profile);name.append(open);const score=profile.daily?.donations?.weeklyTotal,confirmed=score!==null&&score!==undefined,good=confirmed&&Number(score)>=35000,cell=el('td',confirmed?formatScore(score):'—');cell.className=confirmed?(good?'score-good':'score-low'):'score-missing';row.append(name,el('td',profile.allianceRank||'—'),hardSaveCell(profile),exitCell(profile),cell,el('td','35,000'),el('td',confirmed?(good?'Meets target':'Below target'):'Awaiting weekly screenshot'));table.append(row);}finishRosterTable(table,players,results,prefs);return;
 }
 drawDuelStrategy(results,rosterWeek);
 const count=6,minimum=7200000;results.append(el('p',`Daily target: ${formatScore(minimum)} · Green: at or above target · Red: below target · —: not confirmed. Columns use game dates; uploads open two days later.`));
 drawRosterViewTools(results,allPlayers,prefs);const table=el('table');table.className='r4-table contacts-table roster-grid';const thead=el('thead'),head=el('tr');head.append(el('th','Player'),el('th','Rank'),el('th','Hard save'),el('th','Anticipated leaving 1616'));for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const th=el('th',['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]);th.append(el('small',d.toISOString().slice(5,10)));head.append(th);}head.append(el('th','Weekly total'));thead.append(head);table.append(thead);const tbody=el('tbody');
 for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.onclick=()=>showDirectoryProfile(profile);name.append(open);row.append(name,el('td',profile.allianceRank||'—'),hardSaveCell(profile),exitCell(profile));const summary=profile.daily?.[rosterMetric];let total=0,confirmed=0;for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10),score=summary?.days?.[key],cell=el('td');if(score===undefined||score===null){cell.textContent='—';cell.className='score-missing';cell.title='Not confirmed';}else{const n=Number(score);total+=n;confirmed++;cell.textContent=formatScore(n);cell.className=n>=minimum?'score-good':'score-low';cell.title=n>=minimum?'At or above daily target':'Below daily target';}row.append(cell);}const weekly=summary?.weeklyTotal,hasWeekly=weekly!==undefined&&weekly!==null,shownTotal=hasWeekly?Number(weekly):total;const totalCell=el('td',hasWeekly||confirmed?formatScore(shownTotal):'—');totalCell.className='weekly-score '+(hasWeekly||confirmed===count?(shownTotal>=minimum*count?'score-good':'score-low'):'score-missing');totalCell.title=hasWeekly?'Confirmed weekly score · Weekly target '+formatScore(minimum*count):`${confirmed}/${count} days confirmed · Weekly target ${formatScore(minimum*count)}`;if(hasWeekly)totalCell.append(el('small','Confirmed weekly'));else if(confirmed<count&&confirmed)totalCell.append(el('small',`Partial · ${confirmed}/${count} days`));row.append(totalCell);tbody.append(row);}table.append(tbody);finishRosterTable(table,players,results,prefs);
}
const recordColumns=['Player name','Rank','Alliance','Server','Hero power','Kills','Profession level','Hard save','Anticipated leaving 1616'];
const recordFields=()=>[['name','Player name','text'],['allianceRank','Rank','text'],['alliance','Alliance','text'],['server','Server','text'],['power','Hero power (M)','number'],['kills','Kills','number'],['profession','Profession level','number'],['hardSave','Hard save','boolean'],['anticipatedExit','Anticipated leaving 1616','boolean']];
const recordViewKey=()=>viewStorageKey('all-players');
function recordPreferences(){const fallback={hidden:['Hard save','Anticipated leaving 1616'],filter:{mode:'all',children:[]},pageSize:25,sort:'name'};try{const v=JSON.parse(localStorage.getItem(recordViewKey()));return v&&Array.isArray(v.hidden)&&Array.isArray(v.filter?.children)?{...fallback,...v,pageSize:[25,50,100].includes(v.pageSize)?v.pageSize:25}:fallback;}catch{return fallback;}}
function saveRecordPreferences(prefs){try{localStorage.setItem(recordViewKey(),JSON.stringify(prefs));}catch{}}
function drawRecords(players,total,results,prefs){
 const redraw=()=>{recordsPage=0;searchDirectory();};
 drawRosterViewTools(results,players,prefs,{filterFields:recordFields,columns:recordColumns,save:saveRecordPreferences,redraw,reset:()=>{try{localStorage.removeItem(recordViewKey());}catch{}redraw();},count:`${total.toLocaleString()} matching players`});
 const tools=results.querySelector('.personal-view-tools'),label=el('label','Sort '),sort=el('select');sort.setAttribute('aria-label','Sort all players');for(const [v,l] of [['name','Player name'],['server','Server'],['alliance','Alliance']]){const o=el('option',l);o.value=v;sort.append(o);}sort.value=prefs.sort;sort.onchange=()=>{prefs.sort=sort.value;saveRecordPreferences(prefs);redraw();};label.append(sort);tools.append(label);
 const table=el('table');table.className='r4-table contacts-table all-players-grid';const head=el('tr');for(const label of recordColumns){const th=el('th',label);th.dataset.rosterColumn=label;head.append(th);}table.append(head);
 for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.onclick=()=>showDirectoryProfile(profile);name.append(open);row.append(name,el('td',profile.allianceRank||'—'),el('td',profile.alliance||'Unknown'),el('td',profile.server||'Unknown'));for(const field of ['power','kills','profession'])row.append(el('td',profile[field]==null?'—':field==='kills'?formatScore(profile[field]):profile[field]));row.append(hardSaveCell(profile),exitCell(profile));Array.from(row.children).forEach((cell,i)=>cell.dataset.rosterColumn=recordColumns[i]);table.append(row);}const wrap=el('div');wrap.className='records-table-wrap';wrap.append(table);results.append(wrap);applyRosterVisibility(results,prefs);
 if(!players.length)results.append(el('p','No players match these filters. Clear filters or adjust your search.'));
 const pages=Math.max(1,Math.ceil(total/prefs.pageSize)),pager=$('records-page').parentElement;pager.hidden=false;pager.classList.add('records-pagination');pager.replaceChildren();
 const pageButton=(text,page,disabled)=>{const b=el('button',text);b.type='button';b.disabled=disabled;b.onclick=()=>{recordsPage=page;searchDirectory();};return b;};
 const sizeLabel=el('label','Rows per page '),size=el('select');size.setAttribute('aria-label','Rows per page');for(const n of [25,50,100]){const o=el('option',String(n));o.value=n;size.append(o);}size.value=prefs.pageSize;size.onchange=()=>{prefs.pageSize=Number(size.value);saveRecordPreferences(prefs);redraw();};sizeLabel.append(size);
 const pageLabel=el('label','Page '),page=el('input');page.type='number';page.min=1;page.max=pages;page.value=recordsPage+1;page.setAttribute('aria-label','Go to page');const go=el('button','Go');go.type='button';go.onclick=()=>{if(!page.reportValidity())return;recordsPage=Number(page.value)-1;searchDirectory();};page.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go.click();}};pageLabel.append(page,document.createTextNode(` of ${pages.toLocaleString()}`));const marker=el('span');marker.id='records-page';marker.textContent=total?`${(recordsPage*prefs.pageSize+1).toLocaleString()}–${Math.min(total,(recordsPage+1)*prefs.pageSize).toLocaleString()} of ${total.toLocaleString()}`:'0 players';
 pager.append(sizeLabel,marker,pageButton('First',0,recordsPage===0),pageButton('Previous',recordsPage-1,recordsPage===0),pageLabel,go,pageButton('Next',recordsPage+1,recordsPage>=pages-1),pageButton('Last',pages-1,recordsPage>=pages-1));
}
async function searchDirectory(event){
 const requestId=++directoryRequestId;event?.preventDefault();if(event){recordsPage=0;recordsQuery=clean($('directory-query').value);}
 const button=$('directory-search').querySelector('button'),results=$('directory-results');button.disabled=true;$('directory-status').textContent='Loading player records…';$('directory-profile').replaceChildren();
 try{const prefs=recordPreferences(),request={action:'player-search',query:recordsQuery,browse:true,page:recordsPage,alliance:rosterOnly?'NvSP':null,server:'',sort:rosterOnly?'name':prefs.sort,week:rosterWeek,...(!rosterOnly?{directoryView:true,pageSize:prefs.pageSize,filter:prefs.filter}:{})};const key=JSON.stringify(request);if(renderedDirectoryKey!==key){results.replaceChildren();renderedDirectoryKey='';}else $('directory-status').textContent='Refreshing player records…';const data=await loadDirectory(request,!!event);if(requestId!==directoryRequestId)return;results.replaceChildren();renderedDirectoryKey=key;document.querySelector('.records-toolbar')?.setAttribute('hidden','');if(rosterOnly){results.classList.add('roster-results');results.classList.remove('all-players-results');$('directory-status').textContent=`${data.length} NvSP players`;drawRoster(data,results);if($('records-page'))$('records-page').parentElement.hidden=true;return;}results.classList.remove('roster-results');results.classList.add('all-players-results');if(!Array.isArray(data.players))throw new Error('Directory update is not available yet. Please refresh shortly.');const total=Number(data.totalCount)||0,pages=Math.max(1,Math.ceil(total/prefs.pageSize));if(recordsPage>=pages){recordsPage=pages-1;return searchDirectory();}$('directory-status').textContent=`${total.toLocaleString()} matching players`;drawRecords(data.players,total,results,prefs);
 }catch(error){if(requestId===directoryRequestId)$('directory-status').textContent=error.message;}finally{if(requestId===directoryRequestId)button.disabled=false;}
}
if($('records-next')){window.addEventListener('nova-records-open',event=>{rosterOnly=!!event.detail?.roster;duelOnly=!!event.detail?.duel;if(duelOnly)rosterMetric='vs';recordsPage=0;$('directory-title').textContent=duelOnly?'Alliance Duel / Versus (VS)':rosterOnly?'NvSP Roster':'All Players';searchDirectory();});}

function selectRow(index){
 selected=index;const row=draft.rows[index],editor=$('editor');renderRows();editor.replaceChildren();
 const heading=el('h3',`Match rank ${row.rank}: ${row.name||'Unnamed player'}`),line=el('div');line.className='search-line';const label=el('label','Find player by name, alliance, server or ID'),input=el('input');input.value=row.name;label.append(input);const find=el('button','Search transfer directory'),results=el('div');results.className='search-results';line.append(label,find);editor.append(heading,line,results);
 const runSearch=async()=>{
  find.disabled=true;results.replaceChildren(el('p','Searching the private transfer directory…'));
  try{
   const players=await call({action:'player-search',query:input.value});results.replaceChildren();
   if(!players.length)results.append(el('p','No match found. Change the name, alliance or server and search again.'));
   for(const profile of players){const button=el('button',`${profile.name} · ${profile.alliance||'Alliance unknown'} · Server ${profile.server||'unknown'}`);button.onclick=()=>{profileCache.set(profile.key,profile);row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();renderProfile(row,profile);selectRow(index);};results.append(button);}
  }catch(error){status(error.message);results.replaceChildren();}finally{find.disabled=false;}
 };
 find.onclick=runSearch;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}};
 if(row.playerKey){const profile=profileCache.get(row.playerKey)||{};editor.append(renderProfile(row,profile));if(!profileCache.has(row.playerKey))call({action:'player-search',query:row.playerKey}).then(players=>{const found=players.find(item=>item.key===row.playerKey);if(found){profileCache.set(found.key,found);row.playerName=row.playerName||found.name;row.playerAlliance=row.playerAlliance||found.alliance||'';renderProfile(row,found);}}).catch(error=>status(error.message));}
 else{$('profile-heading').textContent=row.name||'Unmatched player';$('profile-preview').replaceChildren(el('p','Search the transfer directory and choose the correct private player profile.'));}
}

async function openBatch(batch){
 if(dirty&&!confirm('Discard unsaved review changes?'))return;
 try{
  const data=await call({action:'review-draft',batchId:batch.id});active=batch;draft={...data,rows:(data.rows||[]).map(normalizeRow)};dirty=false;selected=-1;currentPage=draft.rows[0]?.page||1;$('workspace').hidden=false;
  $('bounty-points').value=String(data.rewardPoints??10);$('bounty-points-code').textContent=batch.bounty;
  $('batch-title').textContent='Daily all-player leaderboard';$('batch-meta').textContent=`${batch.gameDate} · ${batch.fileCount} uploaded screenshots · Submitted by ${batch.profileName||batch.playerKey}`;
  $('evidence-title').textContent=`${batch.bounty} · ${batch.gameDate}`;$('evidence-meta').textContent=`${batch.fileCount} screenshots · ${batch.profileName||batch.playerKey}`;$('evidence-code').textContent=batch.bounty;
  document.querySelectorAll('.r4-queue-item').forEach(button=>button.classList.toggle('active',button.dataset.batch===batch.id));
  renderPages();renderRows();renderSummary();evidence(currentPage);status('Live submission loaded. Yellow dots need review; green checks appear only after the data is confirmed.');
 }catch(error){status(error.message);}
}
async function load(){
 try{
  const rows=await call({action:'review-list'}),profiles=await Promise.all(rows.map(row=>call({action:'profile',playerKey:row.playerKey}).catch(()=>null)));$('queue').replaceChildren();$('queue-count').textContent=rows.length;
  rows.forEach((row,index)=>{row.profileName=profiles[index]?.name||'Member';const button=el('button');button.className='r4-queue-item';button.dataset.batch=row.id;button.append(el('span','Pending review'),el('strong',row.bounty),el('small',`${row.gameDate} · ${row.fileCount} screenshots · ${row.profileName}`));button.onclick=()=>openBatch(row);$('queue').append(button);});
  status(`${rows.length} live submission${rows.length===1?'':'s'} awaiting review.`);if(!rows.length){$('queue').append(el('p','No submissions are awaiting review.'));}
 }catch(error){status(error.message);}
}

async function saveDraft(){if(!validReward())throw Error('Enter whole bounty points from 0 to 10,000.');draft=await call({action:'save-review',batchId:active.id,revision:draft.revision,rows:draft.rows,rewardPoints:rewardPoints(),rewardRevision:draft.rewardRevision??0});draft.rows=draft.rows.map(normalizeRow);dirty=false;renderRows();return draft;}
$('bounty-points').oninput=()=>{dirty=true;renderSummary();};
$('save').onclick=async()=>{try{$('save').disabled=true;await saveDraft();status('Private R4 review draft saved. Scores and rewards remain unpublished.');}catch(error){status(error.message);}finally{$('save').disabled=false;}};
$('extract').onclick=async()=>{
 if(extracting||!active)return;if(draft.rows.length&&!confirm('Replace the current draft rows with new screenshot suggestions? Unsaved matching work will be lost.'))return;
 extracting=true;$('extract').disabled=true;const suggestions=[];let ocr;$('extract-status').textContent='Loading private browser OCR…';
 try{
  ocr=await createLeaderboardOcr((stage,percent)=>{$('extract-status').textContent=`Preparing OCR: ${stage}${percent?` ${percent}%`:''}`;});
  for(let page=1;page<=active.fileCount;page++){
   $('extract-status').textContent=`Reading screenshot ${page} of ${active.fileCount} locally…`;
   for(const row of await ocr.read(await evidenceUrl(page),page))suggestions.push(normalizeRow(row));
  }
  draft.rows=suggestions;dirty=true;selected=-1;renderPages();renderRows();$('extract-status').textContent=`OCR generated ${suggestions.length} unconfirmed suggestions from ${active.fileCount} screenshots. Search Supabase for incorrect names, confirm every field, then save the draft.`;
 }
 catch(error){$('extract-status').textContent=`OCR stopped after ${suggestions.length} suggestions. ${error.message} Nothing was confirmed or awarded.`;}
 finally{await ocr?.terminate();extracting=false;$('extract').disabled=false;}
};
function showPreview(){
 const report=issues(draft.rows),out=$('preview-content');out.replaceChildren(el('div','FINAL REVIEW'),el('h2','Approval preview'),el('p',`${active.bounty}: ${report.included.length} included score rows. ${draft.rows.length-report.included.length} excluded.`),el('p',`${report.unmatched} unmatched, ${report.pending} awaiting confirmation, ${report.duplicates} duplicate conflicts.`),el('p',`Bounty reward: ${validReward()?rewardPoints():'Invalid'} points for the submitter. Suggested default: 10. This preview does not award points.`));
 for(const row of report.included.slice(0,50))out.append(el('p',`${rowConfirmed(row)?'✓':'●'} ${row.playerName||row.name} · ${row.playerAlliance||row.alliance||'Alliance unknown'} → ${row.playerKey||'UNMATCHED'} · ${formatScore(row.score)} points`));
 if(report.included.length>50)out.append(el('p',`…and ${report.included.length-50} more rows.`));$('preview-dialog').showModal();
}
$('preview').onclick=showPreview;$('decision-preview').onclick=showPreview;$('close-preview').onclick=()=>$('preview-dialog').close();
document.querySelectorAll('.final-check').forEach(input=>input.onchange=renderDecision);
$('approve-review').onclick=async()=>{
 if(!decisionReady()||!confirm(`Approve this submission, award ${rewardPoints()} bounty points to the submitter, and publish confirmed NvSP player scores?`))return;
 const button=$('approve-review');button.disabled=true;
 try{
  if(dirty)await saveDraft();
  const result=await call({action:'approve-review',batchId:active.id,revision:draft.revision,rewardRevision:draft.rewardRevision??0,note:clean($('review-note').value)});
  directoryCache.clear();profileCache.clear();dirty=false;active=null;draft=null;$('workspace').hidden=true;
  status(`Approved. ${result.published} NvSP scores published; ${result.opponentRowsRetained} opponent rows retained as private evidence. +${result.pointsAwarded} bounty points awarded.`);await load();
 }catch(error){status(error.message);renderDecision();}
};
$('reject-review').onclick=async()=>{
 const note=clean($('review-note').value);if(note.length<3){status('Add a review note explaining why the submission is rejected.');$('review-note').focus();return;}
 if(!confirm('Reject this submission? No scores or bounty points will be published.'))return;
 const button=$('reject-review');button.disabled=true;
 try{await call({action:'reject-review',batchId:active.id,note});directoryCache.clear();profileCache.clear();dirty=false;active=null;draft=null;$('workspace').hidden=true;status('Submission rejected. No scores or points were published.');await load();}
 catch(error){status(error.message);}finally{button.disabled=false;}
};
$('filter').oninput=renderRows;$('add').onclick=()=>{draft.rows.push(normalizeRow({rank:pageRows().length?Math.max(...pageRows().map(row=>row.rank))+1:1,name:'New row',alliance:'',score:'0',page:currentPage,playerKey:'',excluded:false}));markChanged();selected=draft.rows.length-1;renderRows();selectRow(selected);};
$('confirm-page').onclick=()=>{for(const row of pageRows()){if(row.excluded)continue;row.playerChecked=!!row.playerKey;row.allianceChecked=!!(row.alliance&&row.playerAlliance);row.scoreChecked=!!clean(row.score);}markChanged();renderRows();status(pageConfirmed()?'This screenshot page is fully confirmed. Save the review draft to keep the checks.':'Rows without a matched player, alliance or score remain yellow.');};
$('clear-page').onclick=()=>{for(const row of pageRows()){row.playerChecked=false;row.allianceChecked=false;row.scoreChecked=false;}markChanged();renderRows();status('Confirmation checks cleared for this screenshot page.');};
$('refresh').onclick=load;
$('directory-search').onsubmit=searchDirectory;
load();

loadInitiativeAdmin();

if($('directory-search')){const clear=el('button','Clear search');clear.type='button';clear.onclick=()=>{$('directory-query').value='';recordsQuery='';recordsPage=0;searchDirectory();};$('directory-search').append(clear);}

async function loadAdminIdentities(){const root=$('admin-identities');if(!root||location.hash!=='#admin')return;root.replaceChildren(el('p','Loading admin usernames…'));try{const rows=await call({action:'profile',profileOperation:'admin-identities-list'});renderAdminIdentities(root,rows);}catch(error){root.replaceChildren(el('p','Unable to load admin usernames. '+error.message));}}
function renderAdminIdentities(root,rows){root.replaceChildren(el('h2','Entry author names'),el('p','Only people with active Alliance Hub leadership access appear here. Choose their in-game name for notes and saved entries, and link their player profile. Historical author names are preserved when access ends.'));for(const row of rows){const card=el('details');card.className='plan-card';card.append(el('summary',row.displayName+' · '+(row.playerName?'Linked to '+row.playerName:'Player not linked')));const form=el('form');form.className='plan-form';const name=planFormField('In-game username','text',row.displayName);name.input.required=true;name.input.minLength=2;name.input.maxLength=100;let playerKey=row.playerKey||'';const linked=el('p',row.playerName?'Linked player: '+row.playerName+' · '+(row.alliance||'Unknown alliance'):'No linked player'),search=planFormField('Find player to link','search',''),find=el('button','Find player'),matches=el('div'),unlink=el('button','Unlink player'),save=el('button','Review name changes'),feedback=el('p');find.type=unlink.type='button';save.type='submit';feedback.setAttribute('role','status');unlink.onclick=()=>{playerKey='';linked.textContent='No linked player';};find.onclick=async()=>{if(search.input.value.trim().length<2){feedback.textContent='Enter at least two characters.';return;}find.disabled=true;try{const players=await call({action:'player-search',query:search.input.value.trim()});matches.replaceChildren();for(const p of players){const choose=el('button',`${p.name} · ${p.alliance||'Unknown alliance'} · Server ${p.server||'Unknown'}`);choose.type='button';choose.onclick=()=>{playerKey=p.key;linked.textContent='Linked player: '+p.name+' · '+(p.alliance||'Unknown alliance');matches.replaceChildren();};matches.append(choose);}if(!players.length)matches.append(el('p','No matching players.'));}catch(error){feedback.textContent=error.message;}finally{find.disabled=false;}};form.append(name.wrap,linked,search.wrap,find,matches,unlink,save,feedback);form.onsubmit=async event=>{event.preventDefault();if(name.input.value.includes('@')){feedback.textContent='Use an in-game username, not an email address.';return;}if(!await confirmPlanChange('Confirm admin identity',[row.displayName+' → '+name.input.value,linked.textContent,'Existing and future author labels will use this in-game name. Portal permissions stay the same.']))return;save.disabled=true;try{const next=await call({action:'profile',profileOperation:'admin-identity-save',id:row.id,displayName:name.input.value,playerKey,expectedRevision:row.revision,confirmed:true});profileCache.clear();window.dispatchEvent(new Event('nova-admin-name-changed'));renderAdminIdentities(root,next);}catch(error){feedback.textContent='Not saved. Reload if another admin changed this account. '+error.message;}finally{save.disabled=false;}};card.append(form);root.append(card);}}
window.addEventListener('nova-initiatives-open',loadAdminIdentities);window.addEventListener('hashchange',loadAdminIdentities);loadAdminIdentities();

window.addEventListener('nova-train-player',event=>showDirectoryProfile(event.detail,'trains'));

