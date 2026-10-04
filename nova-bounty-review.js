import {renderScreenshotLaneEvidence} from './screenshot-lanes.js?v=lanes-20261004';
import {openRosterPublisher} from './toolkit-roster-publisher.js?v=dated-20261004';
import {rosterCandidates,validateMatchingRosters,rosterMatchAvailability} from './toolkit-roster-matches.js?v=dated-20261004';
import {openRosterMatchPicker} from './roster-match-picker.js?v=lanes-20261004';
import {nameReadings,mergeReread,unresolvedEvidence,approvalReward} from './review-safety.js?v=workflow-20261003';
import {planPageConfirmation} from './page-confirmation.js?v=workflow-20261003';
import {assessCandidates} from './match-confidence.js?v=workflow-20261003';
const renderSeasonHistory=async(...args)=>(await import('./season-events.js?v=20260930')).renderSeasonHistory(...args);
import {loadTiers,tierOf,powerOf} from './season-events-core.js?v=20260930';
import {allianceGroup,allianceGroups,correctAlliance} from './nova-review-alliances.js?v=set-20260929';
const loadStormHistory=async(...args)=>(await import('./storm-profile.js?v=rotation-20260928')).loadStormHistory(...args);
const loadTrainHistory=async(...args)=>(await import('./train-history.js?v=history-20260927')).loadTrainHistory(...args);
const renderReports=async(...args)=>(await import('./player-reports.js?v=report-polish-20260926')).renderReports(...args);
import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';
import {createLeaderboardOcr} from './nova-bounty-ocr.js?v=toolkit-only-20261003';

const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const clean=value=>String(value??'').trim();
const status=message=>$('status').textContent=message;
const profileCache=new Map();
let active=null,draft=null,dirty=false,selected=-1,currentPage=1,extracting=false,reviewBusy=false;
let rosterPublishAccess=null;
let imageRequest=0,openRequest=0;const saveJobs=new Map();

function updateClocks(){
 const now=new Date();
 $('server-time').textContent=now.toLocaleString('en-CA',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' UTC';
 $('local-time').textContent=now.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
}
updateClocks();setInterval(updateClocks,1000);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});

async function call(body){
 if(!user)throw Error('Sign in to the Portal first.');
 const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify(body),signal:AbortSignal.timeout(body.action==='matching-rosters'?60000:30000)});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Unable to save. Reload the review if another reviewer changed it.');
 return data;
}

function normalizeRow(row){
 const migrated=!!row.checked;
 return {...row,rank:Number(row.rank)||0,page:Number(row.page)||1,score:clean(row.score),name:clean(row.name),alliance:clean(row.alliance),playerAlliance:clean(row.playerAlliance),playerName:clean(row.playerName),playerKey:clean(row.playerKey),playerChecked:row.playerChecked??migrated,allianceChecked:row.allianceChecked??false,scoreChecked:row.scoreChecked??migrated,excluded:!!row.excluded};
}
function rowConfirmed(row){return !!(!unresolvedEvidence(row)&&/^\d{1,12}$/.test(row.score)&&clean(row.alliance)&&row.playerKey&&row.playerChecked&&row.allianceChecked&&row.scoreChecked);}
function pageRows(page=currentPage){return (draft?.rows||[]).filter(row=>row.page===page);}
function pageConfirmed(page){const rows=pageRows(page);return rows.length>0&&rows.every(row=>row.excluded||rowConfirmed(row));}
function issues(rows){
 const included=rows.filter(row=>!row.excluded),keys=new Set(),ranks=new Set();let duplicates=0;
 for(const row of included){if((row.rank>0&&ranks.has(row.rank))||(row.playerKey&&keys.has(row.playerKey)))duplicates++;if(row.rank>0)ranks.add(row.rank);if(row.playerKey)keys.add(row.playerKey);}
 return {included,duplicates,unmatched:included.filter(row=>!row.playerKey).length,pending:included.filter(row=>!rowConfirmed(row)).length};
}
function rewardPoints(){const input=$('bounty-points');return input.value.trim()===''?NaN:Number(input.value);}
function validReward(){const n=rewardPoints();return Number.isInteger(n)&&n>=0&&n<=10000;}
function decisionReady(){
 if(reviewBusy||!active||!draft||!validReward())return false;
 const report=issues(draft.rows),allPages=Array.from({length:active.fileCount},(_,index)=>pageConfirmed(index+1)).every(Boolean);
 return report.included.length>0&&report.pending===0&&report.duplicates===0&&allPages&&[...document.querySelectorAll('.final-check')].every(input=>input.checked);
}
function renderDecision(){
 const ready=decisionReady(),button=$('approve-review');if(!button)return;
 button.disabled=!ready;
 $('decision-help').textContent=ready?'Ready to save both alliances’ player histories and publish the NvSP leaderboard.':'Confirm every included row, screenshot and final review check before publishing.';
}
function markChanged(){dirty=true;renderSummary();renderPages();}
function resetConfirmations(row,...keys){for(const key of keys)row[key]=false;}
function formatScore(value){if(value==null||String(value).trim()==='')return '';const number=Number(String(value).replace(/,/g,''));return Number.isFinite(number)?number.toLocaleString():clean(value);}

function alliancesReady(){return !!draft?.rows?.length&&draft.rows.filter(r=>!r.excluded).every(r=>r.allianceSet&&clean(r.alliance)&&clean(r.allianceServer));}
function renderSetAlliances(){
 const area=$('batch-alliance');area.replaceChildren();area.append(el('span','Step 1 · Confirm the participating alliances'));area.append(el('small','Match against the selected alliances’ dated Toolkit rosters. Saved player matches and confirmed scores stay in place.'));
 const groups=allianceGroups(draft.rows.filter(r=>!r.excluded));for(const group of groups){const wrap=el('div');wrap.className='r4-set-alliance';const label=el('strong',group.label+' · Server '+(group.rows.find(r=>r.allianceServer)?.allianceServer||'not set')+' · '+group.rows.length+' rows'),edit=el('button','Edit alliance');edit.type='button';const confirmed=group.rows.every(r=>r.allianceSet),confirmGroup=el('button',confirmed?'✓ Alliance confirmed':'Confirm alliance');confirmGroup.type='button';confirmGroup.disabled=confirmed||group.key==='unknown';confirmGroup.onclick=()=>{if(!group.rows.every(r=>r.allianceServer)){confirmAlliancesForMatch(null);return;}for(const r of group.rows){r.alliance=group.label;r.allianceSet=true;}candidateCache.clear();markChanged();renderRows();status(alliancesReady()?'Alliances confirmed. Match players within their alliance, then save your review draft.':'Confirm the remaining alliance before matching players.');suggestPageMatches();};wrap.append(label,confirmGroup,edit);edit.onclick=()=>confirmAlliancesForMatch(null);area.append(wrap);}
 const source=el('div');source.className='r4-toolkit-source';source.setAttribute('role','status');
 const refresh=el('button',matchingRosterState.status==='loading'?'Loading published rosters…':matchingRosterState.status==='ready'?'Reload published rosters':'Load published rosters');refresh.type='button';refresh.disabled=!alliancesReady()||matchingRosterState.status==='loading';refresh.onclick=async()=>{matchingRequest++;candidateCache.clear();await loadMatchingRosters(true);renderRows();suggestPageMatches();};
 source.append(refresh);
 if(rosterPublishAccess===true){const publish=el('button','Publish roster export');publish.type='button';publish.className='r4-roster-publish';publish.onclick=()=>openRosterPublisher({call,onPublished:async()=>{matchingRequest++;candidateCache.clear();await loadMatchingRosters(true);renderRows();suggestPageMatches();}});source.append(publish);}
 if(rosterPublishAccess===null){rosterPublishAccess='loading';call({action:'hub-access'}).then(access=>{rosterPublishAccess=!!access?.accountsManage;if(draft)renderSetAlliances();}).catch(()=>{rosterPublishAccess=false;});}

 if(matchingRosterState.key===matchingRosterKey()&&matchingRosterState.status==='ready'){
  for(const roster of matchingRosterState.rosters){source.append(el('small','Dated Toolkit roster · '+roster.tag+' · Server '+roster.server+' · '+roster.members.length+' members · Retrieved '+new Date(roster.retrievedAt).toLocaleString()));source.append(el('small',roster.sourceTime?'Source observation: '+new Date(roster.sourceTime).toLocaleString():'This is a dated snapshot. The source does not report when membership was last observed.'));for(const warning of roster.warnings||[])source.append(el('small',typeof warning==='string'?warning:warning.message||'Source membership may be historical.'));}
 }else source.append(el('small',matchingRosterState.key===matchingRosterKey()&&matchingRosterState.status==='error'?matchingRosterState.error:'Load the published snapshots to see their dates and match players. Your saved review is kept.'));
 area.append(source);
 if(groups.length>2)area.append(el('small','More than two alliance labels were detected. Correct the extra groups to one of the two participating alliances.'));
}
function renderSummary(){
 if(!draft)return;
 const reward=document.querySelector('.r4-reward b');if(reward)reward.textContent='+'+(draft.rewardEligible===false?0:validReward()?rewardPoints():'—');
 const report=issues(draft.rows),reviewed=Array.from({length:active.fileCount},(_,index)=>index+1).filter(pageConfirmed).length;
 $('counts').textContent=`${draft.rows.length} suggested rows · ${report.included.length} included · ${report.unmatched} unmatched · ${report.pending} awaiting confirmation · ${report.duplicates} duplicate conflicts`;
 $('coverage').textContent=`${active.fileCount} uploaded files · ${draft.rows.length} leaderboard rows found · ${reviewed} pages fully confirmed · ${report.duplicates} possible overlaps or duplicate conflicts.`;
 $('page-progress').textContent=`${reviewed} / ${active.fileCount} screenshots reviewed`;
 $('save').textContent=dirty?'Save review draft':'Draft saved';
 renderSetAlliances();const pagePlan=planPageConfirmation(pageRows(),draft.rows,r=>candidateCache.get(candidateKey(r)),rowConfirmed),readyCount=pagePlan.ready.length;$('confirm-page').disabled=!alliancesReady()||!readyCount;$('confirm-page').textContent=pageConfirmed()?'✓ Page confirmed':'Confirm all on this page'+(readyCount?' ('+readyCount+')':'');let pageHelp=$('confirm-page-help');if(!pageHelp){pageHelp=el('p');pageHelp.id='confirm-page-help';pageHelp.setAttribute('role','status');$('confirm-page').after(pageHelp);}pageHelp.textContent=pageConfirmed()?'All included rows confirmed.':readyCount+' ready · '+pagePlan.unresolved+' need attention. Confirms selected players and unique exact matches; saves the draft.';if(!alliancesReady())$('extract-status').textContent='Confirm the participating alliances above before matching players.';
 const confirmed=pageConfirmed(currentPage),indicator=$('page-state');
 indicator.className=`review-indicator ${confirmed?'approved':'pending'}`;
 indicator.firstChild.nodeValue=confirmed?'✓':'●';
 indicator.querySelector('.review-tooltip').textContent=confirmed?'Confirmed':'Needs confirmation';
 renderDecision();
}

async function evidence(page){
 const batch=active,request=++imageRequest;
 const current=()=>request===imageRequest&&active===batch&&currentPage===page;
 $('image').replaceChildren();$('image-status').textContent=`Loading page ${page}…`;
 try{
  const {url}=await call({action:'evidence',batchId:batch.id,sequence:page});if(!current())return;
  const image=el('img');image.dataset.batch=batch.id;image.dataset.page=String(page);image.alt=`Submitted leaderboard screenshot page ${page}`;
  image.onload=()=>{if(current()){$('image-status').textContent=`Original file ${page} of ${batch.fileCount}`;renderLaneEvidence();}};
  image.onerror=()=>{if(current())$('image-status').textContent='Image unavailable. Select the page again to retry.';};
  image.crossOrigin='anonymous';image.src=url;$('image').replaceChildren(image);
 }catch(error){if(current())$('image-status').textContent=error.message;}
}
async function evidenceUrl(page,batchId=active?.id){return (await call({action:'evidence',batchId,sequence:page})).url;}

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
const candidateCache=new Map();let matchingRequest=0;
let matchingRosterState={key:'',status:'idle',rosters:[],error:'',promise:null};
function matchingSelections(){return allianceGroups((draft?.rows||[]).filter(r=>!r.excluded)).map(group=>({server:Number(group.rows[0].allianceServer),tag:group.key==='nvsp'?'NvSP':String(group.label).match(/\[([^\]]+)\]/)?.[1]||String(group.label).trim()}));}
function matchingRosterKey(){return JSON.stringify([active?.id,matchingSelections().sort((a,b)=>a.server-b.server||a.tag.localeCompare(b.tag))]);}
async function loadMatchingRosters(force=false){
 if(!active||!draft||!alliancesReady())return false;
 const key=matchingRosterKey(),batch=active,review=draft,selections=matchingSelections();
 if(matchingRosterState.key===key){if(matchingRosterState.status==='loading')return matchingRosterState.promise;if(!force)return matchingRosterState.status==='ready';}
 const state={key,status:'loading',rosters:[],error:'',promise:null};matchingRosterState=state;candidateCache.clear();
 state.promise=(async()=>{try{
  const result=await call({action:'matching-rosters',batchId:batch.id,selections});
  if(active!==batch||draft!==review||matchingRosterState!==state||matchingRosterKey()!==key)return false;
  state.rosters=validateMatchingRosters(result,selections);state.status='ready';return true;
 }catch(error){if(matchingRosterState===state){state.status='error';state.error=error.message+' Matching is paused; no All Contacts fallback is used.';}return false;
 }finally{if(active===batch&&draft===review&&matchingRosterState===state)renderSummary();}})();
 renderSummary();return state.promise;
}
function candidatesWithinRoster(row,{query,browse=false}={}){
 if(matchingRosterState.key!==matchingRosterKey()||matchingRosterState.status!=='ready')throw Error('The selected LW Toolkit roster is unavailable. Load the roster above before matching.');
 const tag=matchingSelections().find(s=>s.server===Number(row.allianceServer)&&allianceGroup(s.tag)===allianceGroup(row.alliance))?.tag;
 return rosterCandidates(matchingRosterState.rosters,{server:row.allianceServer,tag,names:query===undefined?nameReadings(row):[query],browse});
}
function candidateKey(row){return JSON.stringify([active?.id,nameReadings(row),row.alliance,row.allianceServer,row.score,row.rank]);}
async function suggestPageMatches(){
 if(!active||!draft||!alliancesReady())return;
 const request=++matchingRequest,batch=active,page=currentPage;
 if(!await loadMatchingRosters())return;
 if(request!==matchingRequest||active!==batch||currentPage!==page)return;
 for(const row of pageRows().filter(r=>!r.playerKey&&!r.excluded))candidateCache.set(candidateKey(row),candidatesWithinRoster(row).filter(p=>p.key));
 renderRows();$('extract-status').textContent='Toolkit roster matches ready. Confirm exact matches; compare possible matches before choosing.';
}
function attachCandidate(row,profile){
 if(!draft?.rows.includes(row)||row.excluded)return false;
 let verified;try{verified=rosterMatchAvailability(candidatesWithinRoster(row,{browse:true}),draft.rows,row).find(p=>p.key===profile.key&&p.uid===profile.uid);}catch(error){status(error.message);return false;}
 if(!verified?.key||verified.linkState!=='linked'||verified.alreadyMatched){status('This player is already matched or is no longer available in this alliance roster. Reopen the player list.');return false;}
 document.querySelector('.r4-match-dialog')?.close?.();profileCache.set(verified.key,verified);row.playerKey=verified.key;row.playerName=verified.name;row.playerAlliance=verified.alliance||'';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();renderRows();status('Linked '+verified.name+'. Check the score and screenshot alliance, then confirm and save draft.');return true;
}
function selectPage(page){if(reviewBusy)return;matchingRequest++;currentPage=page;selected=-1;renderPages();renderRows();renderSummary();evidence(page);$('editor').replaceChildren(el('p','Select a player name to search its LW Toolkit roster.'));suggestPageMatches();}

function checkbox(key,label,row,index){
 const wrapper=el('label'),input=el('input');wrapper.className='r4-row-confirm';input.type='checkbox';input.checked=!!row[key];
 wrapper.onclick=event=>event.stopPropagation();input.onclick=event=>event.stopPropagation();input.onchange=()=>{row[key]=input.checked;markChanged();renderRows();};wrapper.append(input,document.createTextNode(label));return wrapper;
}
function editable(label,value,onchange,type='text'){
 const wrapper=el('label',label),input=el('input');input.type=type;input.value=value??'';input.onclick=event=>event.stopPropagation();
 input.oninput=()=>{onchange(input.value);markChanged();};input.onblur=()=>renderRows();wrapper.append(input);return wrapper;
}
function renderLaneEvidence(){
 const candidate=$('image')?.querySelector('img'),image=candidate?.dataset.batch===active?.id&&candidate?.dataset.page===String(currentPage)?candidate:null;
 for(const holder of document.querySelectorAll('.r4-lane-evidence[data-row]')){
  const row=draft?.rows[Number(holder.dataset.row)];if(!row||row.page!==currentPage)continue;
  renderScreenshotLaneEvidence({container:holder,row,rows:pageRows(),image,onOpen:()=>{const full=document.querySelector('.r4-full-evidence');if(full)full.open=true;$('image').scrollIntoView({block:'nearest'});}});
 }
}
function renderRows(){
 if($('rows')?.contains(document.activeElement)&&document.activeElement?.tagName==='INPUT'){renderSummary();return;}
 const tbody=$('rows'),editor=$('editor');if(editor&&tbody.contains(editor)){tbody.closest('.r4-data').append(editor);editor.hidden=true;}tbody.replaceChildren();if(!draft)return;
 const readyRows=new Set(planPageConfirmation(pageRows(),draft.rows,r=>candidateCache.get(candidateKey(r)),rowConfirmed).ready.map(item=>item.row));
 const query=$('filter').value.toLowerCase();let visible=0;
 draft.rows.forEach((row,index)=>{
 if(row.page!==currentPage||query&&!`${row.name} ${row.alliance} ${row.playerName}`.toLowerCase().includes(query))return;visible++;
 const tr=el('tr');tr.dataset.row=String(index);tr.className=`${rowConfirmed(row)?'confirmed':'pending'}${index===selected?' selected':''}${row.excluded?' excluded-row':''}`;
 const data=el('td'),line=el('div');line.className='r4-single-row';
 const group=allianceGroups(draft.rows).find(g=>g.key===allianceGroup(row.alliance));const alliance=el('span',group?.label||row.alliance||'Not detected');alliance.className='r4-alliance-value';alliance.title='Detected: '+row.alliance+'. Edit this alliance for the whole set above.';
 const ready=readyRows.has(row),suggested=assessCandidates(candidateCache.get(candidateKey(row))||[]).candidate;
 const player=el('button');player.append(el('span',row.playerName||(ready?suggested?.name:null)||row.name||'Unnamed player'));const badge=el('span',rowConfirmed(row)?'✓ Confirmed':row.playerKey?'Change player':ready?'✓ Exact match · ready':'⌕ Search Toolkit roster');badge.className=rowConfirmed(row)?'r4-confirmed-badge':'r4-match-prompt';player.append(badge);player.setAttribute('aria-label',(row.playerName||row.name)+' — '+(rowConfirmed(row)?'Confirmed; change match':row.playerKey?'Change match':'Match player'));player.type='button';player.className='r4-inline-player';player.title=row.playerKey?'Linked player — click to change':'Click to match this player';player.disabled=false;player.onclick=()=>selectRow(index);
 const score=editable('Suggested score',formatScore(row.score),value=>{row.score=value.replace(/,/g,'');row.scoreResolved=true;resetConfirmations(row,'scoreChecked');});score.className='r4-inline-field r4-inline-score';
 const actions=el('div');actions.className='r4-inline-actions';
 const issue=row.excluded?'Excluded row':unresolvedEvidence(row)?'Resolve the screenshot reading below':!/^\d{1,12}$/.test(row.score)?'Correct the score':!clean(row.alliance)?'Correct the alliance':'';
 const confirm=el('button',rowConfirmed(row)?'✓ Confirmed':'Confirm');confirm.type='button';confirm.disabled=row.excluded||rowConfirmed(row);confirm.title=issue||'Confirm player, alliance and score';confirm.onclick=async()=>{if(!alliancesReady()){confirmAlliancesForMatch(index);return;}if(issue){status(issue+' before confirming this row.');score.querySelector('input')?.focus();return;}if(!row.playerKey){const profile=assessCandidates(candidateCache.get(candidateKey(row))||[]).candidate;if(!profile||Number(profile.nameSimilarity)!==1){selectRow(index);return;}if(String(profile.server)!==String(row.allianceServer)||draft.rows.some(r=>r!==row&&!r.excluded&&r.playerKey===profile.key)){status('This suggestion needs review because its server or another assigned row conflicts.');selectRow(index);return;}row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';profileCache.set(profile.key,profile);}if(group&&group.key!=='unknown')row.alliance=group.label;row.playerChecked=row.allianceChecked=row.scoreChecked=true;markChanged();renderRows();status('Saving confirmed row…');try{if(await saveDraft())status(dirty?'Confirmed row saved. Newer edits still need saving.':'✓ '+(row.playerName||row.name)+' confirmed and draft saved.');}catch(error){status('Row is checked but could not be saved. '+error.message+' Use Save review draft to retry.');}};
 const more=el('button','Details');more.type='button';more.setAttribute('aria-expanded','false');
 const details=el('div');details.className='r4-inline-details';details.hidden=true;more.onclick=()=>{details.hidden=!details.hidden;more.setAttribute('aria-expanded',String(!details.hidden));};
 details.append(el('p',issue||'Player, alliance and score are ready to confirm.'));
 if(unresolvedEvidence(row)){details.hidden=false;more.setAttribute('aria-expanded','true');}
 if(row.ocrScoreConflict&&!row.scoreResolved){details.append(el('p','The readers disagree about the score. Compare the original and choose a value, or type a correction above.'));for(const value of [...new Set([row.score,...(row.ocrScoreAlternatives||[])])]){const use=el('button','Use '+formatScore(value));use.onclick=()=>{row.score=value;row.scoreResolved=true;row.scoreChecked=false;markChanged();renderRows();};details.append(use);}}
 if(row.ocrRankConflict&&!row.rankResolved){details.append(el('p','The readers disagree about leaderboard position.'));for(const value of [...new Set([row.rank,...(row.ocrRankAlternatives||[])])]){const use=el('button',value?'Position '+value:'Position unreadable');use.onclick=()=>{row.rank=value;row.rankResolved=true;markChanged();renderRows();};details.append(use);}}
 if(row.layoutUncertain&&!row.layoutChecked){const checked=el('button','I checked this row against the screenshot');checked.onclick=()=>{row.layoutChecked=true;markChanged();renderRows();};details.append(el('p','Screenshot layout could not be detected reliably.'),checked);}
 if(row.rereadScore&&String(row.rereadScore)!==String(row.score)){const alternate=el('button','Use reread score '+formatScore(row.rereadScore));alternate.onclick=()=>{row.score=String(row.rereadScore);row.scoreResolved=true;row.scoreChecked=false;markChanged();renderRows();};details.append(el('p','A reread found a different score. Your saved value is kept until you choose.'),alternate);}
 details.append(el('p','Screenshot name: '+row.name+(row.playerKey?' · Linked to '+row.playerName+' · Current alliance: '+row.playerAlliance:'')));
 details.append(el('p',row.rank>0?'Leaderboard position: '+row.rank+' · read from screenshot':'Leaderboard position unreadable · optional; player and score can still be confirmed.'));
 const editName=editable('Screenshot name',row.name,value=>{row.name=value;resetConfirmations(row,'playerChecked');});details.append(editName);

 const exclude=el('button',row.excluded?'Include row':'Exclude duplicate / pinned row');exclude.type='button';exclude.onclick=()=>{row.excluded=!row.excluded;markChanged();renderRows();};details.append(exclude);
 if(!row.playerKey){const candidates=candidateCache.get(candidateKey(row))||[];for(const profile of candidates){const pick=el('button','Use '+profile.name+' · '+profile.alliance+' · '+profile.strength);pick.type='button';pick.onclick=()=>attachCandidate(row,profile);details.append(pick);}}
 const state=el('span',row.excluded?'Excluded':rowConfirmed(row)?'✓ Confirmed':!alliancesReady()?'Confirm alliances to start':row.playerKey||ready?'Ready to confirm':'Needs a match');state.className='r4-row-state '+(rowConfirmed(row)?'is-confirmed':row.playerKey||ready?'is-ready':'is-unmatched');state.setAttribute('role','status');const undo=el('button','Undo');undo.type='button';undo.className='r4-lane-undo';undo.hidden=!rowConfirmed(row);undo.onclick=()=>{resetConfirmations(row,'playerChecked','allianceChecked','scoreChecked');row.checked=false;markChanged();renderRows();status('Confirmation removed. The player match and score are kept. Save the draft to keep this change.');};actions.append(state,confirm,undo,more);const playerCell=el('div');playerCell.className='r4-player-suggestions';playerCell.append(player);const reading=el('small','Screenshot text: '+(row.name||'Unreadable'));reading.dir='auto';playerCell.append(reading);if(row.playerKey){const remove=el('button','Remove match');remove.type='button';remove.className='r4-remove-match';remove.setAttribute('aria-label','Remove match for '+(row.playerName||row.name));remove.onclick=()=>{const previous=row.playerName||row.name;row.playerKey='';row.playerName='';row.playerAlliance='';row.checked=false;resetConfirmations(row,'playerChecked','allianceChecked','scoreChecked');markChanged();renderRows();status('Match removed for '+previous+'. Original screenshot name and score retained. Save review draft to keep this change.');};playerCell.append(remove);}if(!row.playerKey&&!row.excluded&&alliancesReady()){const candidates=candidateCache.get(candidateKey(row));if(candidates){const assessment=assessCandidates(candidates),best=assessment.candidate;playerCell.append(el('small',assessment.label));for(const partial of candidates.filter(p=>p.partialMatch).slice(0,3)){const option=el('button','Partial “'+partial.matchedFragment+'” · Compare '+partial.name);option.type='button';option.className='r4-suggested-player';option.onclick=()=>selectRow(index);playerCell.append(option);}if(best&&!ready){const suggestion=el('button','Compare '+best.name);suggestion.type='button';suggestion.className='r4-suggested-player';suggestion.setAttribute('aria-label','Compare possible player: '+best.name);suggestion.onclick=()=>selectRow(index);playerCell.append(suggestion);}}else playerCell.append(el('small',matchingRosterState.status==='error'?'Toolkit roster unavailable — saved matches kept':'Loading Toolkit roster…'));}const evidence=el('div');evidence.className='r4-lane-evidence';evidence.dataset.row=String(index);const match=el('div');match.className='r4-lane-match';match.append(alliance,playerCell,score);line.append(evidence,match,actions);data.append(line,details);tr.append(data);tbody.append(tr);
 });
 if(!visible){const tr=el('tr'),td=el('td','No rows on this page match.');tr.append(td);tbody.append(tr);}renderLaneEvidence();renderSummary();
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
 save.disabled=true;cancel.disabled=true;feedback.textContent='Saving shared player record…';try{const saved=await call({action:'profile',playerKey:profile.key,profileOperation:'save',confirmed:true,allowNewAlliance:!!newAlliance,expectedRevision:full.revision,changes,includeActivity:true});directoryCache.clear();profileCache.clear();candidateCache.clear();matchingRequest++;onSaved({...profile,...saved.details});suggestPageMatches();}catch(error){feedback.textContent='Not saved. If this player changed elsewhere, reopen the profile before trying again. '+error.message;}finally{save.disabled=false;cancel.disabled=false;}};
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

async function showDirectoryProfile(profile,initialTab='all',matchContext=null){
 profileCache.set(profile.key,profile);const out=$('directory-profile');if(out.parentElement!==document.body)document.body.append(out);out.replaceChildren();
 const header=el('header'),identity=el('div'),avatar=el('div',(profile.name||'?').trim().slice(0,1).toUpperCase()),title=el('div'),heading=el('h2',profile.name||'Player profile');header.className='player-header';identity.className='player-identity';avatar.className='player-avatar';title.append(el('small','ALLIANCE HUB · PLAYER RECORD'),heading,el('p',`[${profile.alliance||'Unknown'}] · Server ${profile.server||'—'}${profile.allianceRank?' · '+profile.allianceRank:''}`));identity.append(avatar,title);header.append(identity);const close=el('button','Close ×');close.className='player-close';close.onclick=()=>out.close?out.close():out.replaceChildren();header.append(close);out.append(header);out.setAttribute('aria-label',`${profile.name||'Player'} profile`);if(out.showModal&&!out.open)out.showModal();
 const layout=el('div'),tabs=el('nav'),body=el('section');layout.className='player-layout';tabs.className='player-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Player profile sections');body.className='player-body';body.setAttribute('role','tabpanel');layout.append(tabs,body);out.append(layout);body.textContent='Loading player record…';
 try{const full=await call({action:'profile',playerKey:profile.key,includeActivity:true});if(!heading.isConnected)return;Object.assign(profile,full.details||{});heading.textContent=profile.name||'Player profile';setPlayerPhoto(avatar,full.avatarUrl,profile.name);const badges=el('div');badges.className='profile-access-badges';const rankValue=/^R[1-5]$/.test(profile.allianceRank||'')?profile.allianceRank:null;const rank=el('span',rankValue||'Rank not recorded');rank.className=rankValue?'alliance-rank-badge':'rank-unrecorded';rank.title='Alliance membership rank (R1–R5). This does not grant portal access.';badges.append(rank);if(['R4','R5'].includes(rankValue))badges.append(el('span','Leader'));title.querySelector('p').textContent=`[${profile.alliance||'Unknown'}] · Server ${profile.server||'—'}`;const portal=full.portalAccess;for(const [label,key] of [['Alliance Hub','allianceHub'],['Transfer Portal','transferPortal']]){const badge=el('span',label+': '+(portal?.linked?portal[key]:'Not linked'));badge.title=portal?.linked?'Verified account access. Alliance rank does not grant portal permissions.':'No admin account has been linked to this player yet.';badges.append(badge);}title.append(badges);if(Number(profile.server)>=1573&&Number(profile.server)<=1700){const tierBadge=el('span','Power class: loading…');badges.append(tierBadge);loadTiers().then(b=>{tierBadge.textContent='Power class: '+tierOf(powerOf(profile),b);tierBadge.title='LWServers THP bands · '+b.generatedAt.slice(0,10)+' · not a spending classification';});}const choices=[['all','Overview'],['vs','Alliance Duel'],['donations','Alliance Donations'],['desert_storm','Desert Storm'],['canyon_storm','Canyon Storm'],['bounties','Bounties'],['trains','Trains'],['season','Season Events'],['hr','Human Resources'],['server_plans','Server Plans'],['reports','Reports']];
 const facts=(label,values)=>{const section=el('section');section.className='player-info-card';section.append(el('h3',label));const list=el('dl');for(const [key,value] of values){const pair=el('div');pair.append(el('dt',key),el('dd',value===undefined||value===null||value===''?'Not recorded':String(value)));list.append(pair);}section.append(list);return section;};
 const empty=(title,description)=>{const box=el('div');box.className='player-empty';box.append(el('h3',title),el('p',description));body.append(box);};
 const draw=key=>{body.classList.remove('hr-workspace','participation-reports');body.replaceChildren();for(const button of tabs.children)button.setAttribute('aria-selected',String(button.dataset.key===key));const name=choices.find(c=>c[0]===key)[1];body.append(el('h2',name));
 if(key==='desert_storm')loadStormHistory(body,call,profile.key);
 if(key==='season'){renderSeasonHistory(body,call,profile.key,profile.power);return;}
 if(key==='trains'){loadTrainHistory(body,call,profile.key);return;}
 if(key==='reports'){renderReports(body,full);return;}
 if(key==='server_plans'){drawServerPlans(body,profile,full);return;}
 if(key==='hr'){drawPlayerHR(body,profile,full);return;}
 if(key==='bounties'){drawPlayerBounties(body,full);return;}
 if(key==='all'){const edit=el('button','Edit player details');edit.className='overview-edit';edit.onclick=()=>{if(!body.querySelector('form'))editPlayerOverview(body,profile,full,updated=>showDirectoryProfile(updated,'all',matchContext));};body.append(edit);const grid=el('div');grid.className='player-info-grid';grid.append(facts('Player details',[['Player name',profile.name],['Translated name',profile.translatedName],['Alliance',profile.alliance],['Alliance rank',profile.allianceRank],['Hard save',profile.hardSave?(profile.hardSaveLabel||'Active hard-save order'):'No active order'],['Server',profile.server],['Aliases',(profile.aliases||[]).join(' · ')],['Previous in-game names',(profile.previousGameNames||[]).map(n=>typeof n==='string'?n:[n.name,n.date?new Date(n.date).toLocaleDateString():null].filter(Boolean).join(' · ')).join(' / ')]]),facts('Game statistics',[['Hero power (M)',profile.power],['Profession level',profile.profession],['Kills',profile.kills==null?null:formatScore(profile.kills)]]));body.append(grid);const hardSavePair=Array.from(grid.querySelectorAll('dl>div')).find(node=>node.querySelector('dt')?.textContent==='Hard save');if(profile.hardSave&&hardSavePair)hardSavePair.querySelector('dd').prepend(hardSaveMarker(profile),document.createTextNode(' '));return;}
 else body.append(el('p',key==='vs'?'Daily target: 7,200,000 · Six play days each week':key==='donations'?'Weekly target: 35,000 · One weekly donation screenshot':'Approved event results linked to this player.'));
 const rows=(full.activity||[]).filter(item=>key==='all'||item.metric===key);if(!rows.length){empty('No confirmed activity yet','Approved results will appear here. Pending screenshot submissions are kept in review until confirmed.');return;}const table=el('table');table.className='player-activity-table';const head=el('tr');for(const label of ['Event','Game date','Period','Score','Details'])head.append(el('th',label));table.append(head);for(const item of rows){const tr=el('tr');for(const value of [choices.find(c=>c[0]===item.metric)?.[1]||item.metric,item.date,item.period,formatScore(item.score)])tr.append(el('td',value));const cell=el('td'),details=el('details');details.append(el('summary','Full details'));const evidence=(full.bounties||[]).find(b=>b.bounty===item.bounty&&b.gameDate===item.date);details.append(profileLine('Source',item.bounty),profileLine('Record','Confirmed leaderboard score · no bounty reward for being listed'));if(evidence){details.append(profileLine('Screenshots',String(evidence.fileCount||0)),profileLine('Review status',evidence.state),profileLine('Reviewed',evidence.reviewedAt?new Date(evidence.reviewedAt).toLocaleString():'Not recorded'));if(evidence.reviewNote)details.append(el('p',evidence.reviewNote));}cell.append(details);tr.append(cell);table.append(tr);}body.append(table);};
 for(const [key,label] of choices){const button=el('button',label);button.type='button';button.dataset.key=key;button.setAttribute('role','tab');button.onclick=()=>draw(key);tabs.append(button);}draw(initialTab);
 }catch(error){if(!heading.isConnected)return;const retry=el('button','Try again');retry.type='button';retry.onclick=()=>showDirectoryProfile(profile,initialTab,matchContext);body.replaceChildren(el('h2','Unable to load player record'),el('p',error.message),retry);}

 if(matchContext){const attach=el('button','Select this player');attach.type='button';attach.className='primary directory-attach';attach.onclick=()=>{if(matchContext.select()!==false)out.close();};out.append(attach);}
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
 const count=6,minimum=7200000;results.append(el('p',`Daily target: ${formatScore(minimum)} · Green: at or above target · Red: below target · —: not confirmed. Columns use game dates; uploads open at the next reset for 24 hours.`));
 drawRosterViewTools(results,allPlayers,prefs);const table=el('table');table.className='r4-table contacts-table roster-grid';const thead=el('thead'),head=el('tr');head.append(el('th','Player'),el('th','Rank'),el('th','Hard save'),el('th','Anticipated leaving 1616'));for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const th=el('th',['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]);th.append(el('small',d.toISOString().slice(5,10)));head.append(th);}head.append(el('th','Weekly total'));thead.append(head);table.append(thead);const tbody=el('tbody');
 for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.type='button';open.setAttribute('aria-label',`Open ${profile.name||'player'} profile`);open.onclick=()=>showDirectoryProfile(profile,'vs');name.append(open);if(duelOnly&&!['nvsp','novasapphire','nvspnovasapphire'].includes(String(profile.alliance||'').toLowerCase().replace(/[^a-z0-9]/g,''))){const membership=el('small',`Now ${profile.alliance||'tagless'} · NvSP scores this week`);membership.style.display='block';name.append(membership);}row.append(name,el('td',profile.allianceRank||'—'),hardSaveCell(profile),exitCell(profile));const summary=profile.daily?.[rosterMetric];let total=0,confirmed=0;for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10),score=summary?.days?.[key],cell=el('td');if(score===undefined||score===null){cell.textContent='—';cell.className='score-missing';cell.title='Not confirmed';}else{const n=Number(score);total+=n;confirmed++;cell.textContent=formatScore(n);cell.className=n>=minimum?'score-good':'score-low';cell.title=n>=minimum?'At or above daily target':'Below daily target';}row.append(cell);}const weekly=summary?.weeklyTotal,hasWeekly=weekly!==undefined&&weekly!==null,shownTotal=hasWeekly?Number(weekly):total;const totalCell=el('td',hasWeekly||confirmed?formatScore(shownTotal):'—');totalCell.className='weekly-score '+(hasWeekly||confirmed===count?(shownTotal>=minimum*count?'score-good':'score-low'):'score-missing');totalCell.title=hasWeekly?'Confirmed weekly score · Weekly target '+formatScore(minimum*count):`${confirmed}/${count} days confirmed · Weekly target ${formatScore(minimum*count)}`;if(hasWeekly)totalCell.append(el('small','Confirmed weekly'));else if(confirmed<count&&confirmed)totalCell.append(el('small',`Partial · ${confirmed}/${count} days`));row.append(totalCell);tbody.append(row);}table.append(tbody);finishRosterTable(table,players,results,prefs);
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
 try{const prefs=recordPreferences(),request={action:'player-search',query:recordsQuery,browse:true,page:recordsPage,alliance:rosterOnly?'NvSP':null,server:'',sort:rosterOnly?'name':prefs.sort,week:rosterWeek,duelView:duelOnly,...(!rosterOnly?{directoryView:true,pageSize:prefs.pageSize,filter:prefs.filter}:{})};const key=JSON.stringify(request);if(renderedDirectoryKey!==key){results.replaceChildren();renderedDirectoryKey='';}else $('directory-status').textContent='Refreshing player records…';const data=await loadDirectory(request,!!event);if(requestId!==directoryRequestId)return;results.replaceChildren();renderedDirectoryKey=key;document.querySelector('.records-toolbar')?.setAttribute('hidden','');if(rosterOnly){results.classList.add('roster-results');results.classList.remove('all-players-results');$('directory-status').textContent=duelOnly?`${data.length} players · Current NvSP roster and this week’s recorded NvSP participants`:`${data.length} NvSP players`;drawRoster(data,results);if($('records-page'))$('records-page').parentElement.hidden=true;return;}results.classList.remove('roster-results');results.classList.add('all-players-results');if(!Array.isArray(data.players))throw new Error('Directory update is not available yet. Please refresh shortly.');const total=Number(data.totalCount)||0,pages=Math.max(1,Math.ceil(total/prefs.pageSize));if(recordsPage>=pages){recordsPage=pages-1;return searchDirectory();}$('directory-status').textContent=`${total.toLocaleString()} matching players`;drawRecords(data.players,total,results,prefs);
 }catch(error){if(requestId===directoryRequestId)$('directory-status').textContent=error.message;}finally{if(requestId===directoryRequestId)button.disabled=false;}
}
if($('records-next')){window.addEventListener('nova-records-open',event=>{rosterOnly=!!event.detail?.roster;duelOnly=!!event.detail?.duel;if(duelOnly)rosterMetric='vs';recordsPage=0;$('directory-title').textContent=duelOnly?'Alliance Duel / Versus (VS)':rosterOnly?'NvSP Roster':'All Players';searchDirectory();});}

function allianceLookupField(group,position){
 const wrap=el('section');wrap.className='r4-alliance-lookup';const label=el('label',group.rows.length+' screenshot rows · Alliance'),input=el('input');input.value=group.key==='unknown'?'':group.label;input.required=true;input.maxLength=100;input.autocomplete='off';input.placeholder='Start typing an alliance name or tag';input.setAttribute('aria-label','Alliance '+position);label.append(input);
 const serverLabel=el('label','Server'),server=el('input');server.inputMode='numeric';server.pattern='[0-9]{1,6}';server.maxLength=6;server.required=true;server.placeholder='Select an alliance or enter its server';server.value=group.rows.find(r=>r.allianceServer)?.allianceServer||'';server.setAttribute('aria-label','Server for alliance '+position);serverLabel.append(server);
 const feedback=el('p'),results=el('div');results.className='r4-alliance-options';feedback.setAttribute('role','status');let timer,version=0,chosen=server.value?{name:input.value,server:server.value}:null;
 const search=async(initial=false)=>{const request=++version,q=input.value.trim();results.replaceChildren();if(q.length<2){feedback.textContent='Type at least 2 letters to find an existing alliance.';return;}feedback.textContent='Finding alliances…';try{const items=await call({action:'player-search',operation:'alliance-lookup',query:q});if(request!==version||!wrap.isConnected)return;if(!Array.isArray(items))throw Error('Lookup unavailable');const exact=items.filter(x=>allianceGroup(x.name)===allianceGroup(q));if(initial&&!server.value&&exact.length===1&&exact[0].server){server.value=exact[0].server;chosen={name:input.value,server:server.value};}feedback.textContent=items.length?'Select an alliance and server below.':'No existing alliance found. Check the spelling, or enter the alliance and server shown in the game.';for(const item of items){const option=el('button',item.name+' · Server '+(item.server||'unknown')+' · '+item.members+' contacts');option.type='button';option.className='r4-alliance-option';option.onclick=()=>{++version;clearTimeout(timer);input.value=item.name;server.value=item.server||'';chosen=item;results.replaceChildren();feedback.textContent='Selected '+item.name+' · Server '+(item.server||'unknown — enter below');if(!item.server)server.focus();};results.append(option);}}catch(error){if(request===version)feedback.textContent='Alliance search could not load. Try typing again, or enter the verified alliance and server.';}};
 input.oninput=()=>{++version;chosen=null;server.value='';clearTimeout(timer);results.replaceChildren();feedback.textContent='Searching…';timer=setTimeout(()=>search(),300);};wrap.append(label,serverLabel,feedback,results);return {wrap,input,server,start:()=>search(true)};
}
function confirmAlliancesForMatch(index){
 const dialog=el('dialog');dialog.className='r4-match-dialog';dialog.setAttribute('aria-label','Confirm alliances before matching');
 const content=el('div');content.className='r4-alliance-setup';content.append(el('h3','Confirm the alliances and servers'),el('p','Search an existing alliance by name or tag. Your selection applies to its rows throughout this screenshot set.'));
 const fields=allianceGroups(draft.rows.filter(r=>!r.excluded)).map((group,i)=>{const field=allianceLookupField(group,i+1);content.append(field.wrap);return {group,...field};});
 const feedback=el('p'),cancel=el('button','Cancel'),proceed=el('button',index==null?'Confirm alliances':'Confirm alliances and find player');cancel.type=proceed.type='button';cancel.onclick=()=>dialog.close();proceed.onclick=()=>{if(fields.some(({input,server})=>!input.reportValidity()||!server.reportValidity()||!input.value.trim()))return;for(const {group,input,server} of fields){for(const row of group.rows){if(row.alliance!==input.value.trim()||row.allianceServer!==server.value.trim())row.allianceChecked=false;row.alliance=input.value.trim();row.allianceServer=server.value.trim();row.allianceSet=true;}}candidateCache.clear();markChanged();dialog.close();renderRows();if(index!=null)selectRow(index);else {status('Alliance names and servers updated. Save draft to retain them.');suggestPageMatches();}};content.append(feedback,cancel,proceed);dialog.append(content);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();fields.forEach(field=>field.start());
}
async function selectRow(index){
 if(!alliancesReady()){confirmAlliancesForMatch(index);return;}
 const batch=active,review=draft,row=draft.rows[index],scope=matchingRosterKey();selected=index;
 if(!row||row.excluded)return;
 if(!await loadMatchingRosters()){status(matchingRosterState.error||'Load the selected LW Toolkit roster before matching.');return;}
 const isCurrent=()=>active===batch&&draft===review&&matchingRosterKey()===scope&&draft.rows.includes(row)&&!row.excluded;
 if(!isCurrent())return;
 renderRows();const container=document.createElement('div');container.className='r4-lane-picker-mount';$('rows').querySelector('tr[data-row="'+index+'"] td').append(container);openRosterMatchPicker({container,row,getRows:()=>draft.rows,getCandidates:options=>candidatesWithinRoster(row,options),isCurrent,onSelect:profile=>attachCandidate(row,profile),onViewProfile:(profile,select)=>showDirectoryProfile(profile,'all',{select})});
}

async function openBatch(batch){
 if(reviewBusy){status('Finishing the current review. Please wait.');return;}
 if(dirty&&!confirm('Discard unsaved review changes?'))return;
 const request=++openRequest;
 try{
  const data=await call({action:'review-draft',batchId:batch.id});if(request!==openRequest)return;matchingRequest++;matchingRosterState={key:'',status:'idle',rosters:[],error:'',promise:null};candidateCache.clear();profileCache.clear();active=batch;draft={...data,rows:(data.rows||[]).map(normalizeRow)};dirty=false;selected=-1;currentPage=draft.rows[0]?.page||1;$('workspace').hidden=false;
  $('bounty-points').value=String(data.rewardPoints??10);$('bounty-points-code').textContent=batch.bounty;
  document.querySelectorAll('.final-check').forEach(input=>input.checked=false);$('review-note').value=data.reviewNote||'';
  $('batch-title').textContent=/^VSD/.test(batch.bounty)?'Daily Alliance Duel leaderboard':/^VSW/.test(batch.bounty)?'Weekly Alliance Duel leaderboard':/^DN/.test(batch.bounty)?'Alliance donations':'Bounty evidence review';$('batch-meta').textContent=`${batch.gameDate} · ${batch.fileCount} uploaded screenshots · Submitted by ${batch.profileName||'Member'}`;
  $('evidence-title').textContent=`${batch.bounty} · ${batch.gameDate}`;$('evidence-meta').textContent=`${batch.fileCount} screenshots · ${batch.profileName||'Member'}`;$('evidence-code').textContent=batch.bounty;
  document.querySelectorAll('.r4-queue-item').forEach(button=>button.classList.toggle('active',button.dataset.batch===batch.id));
  renderPages();renderRows();renderSummary();evidence(currentPage);suggestPageMatches();status('Live submission loaded. Yellow dots need review; green checks appear only after the data is confirmed.');
 }catch(error){status(error.message);}
}
let queueLoading=false;
async function load(){
 if(queueLoading)return;queueLoading=true;$('refresh').disabled=true;$('queue-count').textContent='…';status('Loading submissions for R4 review…');
 try{
  const rows=await call({action:'review-list'});$('queue').replaceChildren();$('queue-count').textContent=rows.length;
  rows.forEach((row,index)=>{row.profileName=row.profileName||'Member';const button=el('button');button.className='r4-queue-item';button.dataset.batch=row.id;button.append(el('span','Pending review'),el('strong',row.bounty),el('small',`${row.gameDate} · ${row.fileCount} screenshots · ${row.profileName}`));button.onclick=()=>openBatch(row);$('queue').append(button);});
  status(`${rows.length} live submission${rows.length===1?'':'s'} awaiting review.`);if(!rows.length){$('queue').append(el('p','No submissions are awaiting review.'));}
 }catch(error){$('queue-count').textContent='unavailable';$('queue').replaceChildren(el('p','The review queue could not be loaded. This does not mean there are no submissions.'));status('Unable to load submissions. Click Refresh queue to retry. If this continues, sign in again. Saved screenshots are not affected.');}
 finally{queueLoading=false;$('refresh').disabled=false;}
}

async function saveDraft(){
 if(!active||!draft||!validReward())throw Error('Enter whole bounty points from 0 to 10,000.');
 const batch=active,reviewDraft=draft;
 if(saveJobs.has(batch.id)){await saveJobs.get(batch.id);if(active!==batch||draft!==reviewDraft)return null;return saveDraft();}
 const rows=JSON.stringify(reviewDraft.rows),points=rewardPoints(),note=$('review-note').value;
 const promise=call({action:'save-review',batchId:batch.id,revision:reviewDraft.revision,rows:JSON.parse(rows),reviewNote:note,rewardPoints:points,rewardRevision:reviewDraft.rewardRevision??0});saveJobs.set(batch.id,promise);
 try{
  const saved=await promise;
  reviewDraft.revision=saved.revision;reviewDraft.rewardRevision=saved.rewardRevision??reviewDraft.rewardRevision;
  reviewDraft.rewardEligible=saved.rewardEligible??reviewDraft.rewardEligible;reviewDraft.rewardPoints=saved.rewardPoints??points;reviewDraft.reviewNote=saved.reviewNote??note;
  if(active!==batch||draft!==reviewDraft)return null;
  dirty=JSON.stringify(reviewDraft.rows)!==rows||rewardPoints()!==points||$('review-note').value!==note;
  // Do not replace row objects: pending callbacks and newer edits belong to this draft.
  renderRows();return reviewDraft;
 }finally{if(saveJobs.get(batch.id)===promise)saveJobs.delete(batch.id);}
}
$('review-note').oninput=markChanged;
$('bounty-points').oninput=()=>{dirty=true;renderSummary();};
$('save').onclick=async()=>{try{$('save').disabled=true;if(await saveDraft())status(dirty?'Earlier changes saved. Newer edits still need saving.':'Private R4 review draft saved. Scores and rewards remain unpublished.');}catch(error){status(error.message);}finally{$('save').disabled=false;}};
const rereadNames=el('button','Re-read unmatched names on this page');rereadNames.type='button';rereadNames.id='reread-names';$('extract').after(rereadNames);
const refreshMatches=el('button','Refresh player suggestions');refreshMatches.type='button';refreshMatches.id='refresh-player-matches';rereadNames.after(refreshMatches);
refreshMatches.onclick=async()=>{if(!active||!draft)return;if(!alliancesReady()){confirmAlliancesForMatch(null);return;}matchingRequest++;candidateCache.clear();profileCache.clear();refreshMatches.disabled=true;renderRows();try{await suggestPageMatches();}finally{refreshMatches.disabled=false;}};
$('extract').onclick=async()=>{
 if(extracting||!active)return;if(reviewBusy)return;
 extracting=true;$('extract').disabled=true;const suggestions=[];let ocr,readingPage=0;const batch=active,reviewDraft=draft,emptyPages=[];$('extract-status').textContent='Loading OCR engine and language files. The first run may take longer…';
 try{
  ocr=await createLeaderboardOcr((stage,percent)=>{$('extract-status').textContent=readingPage?`Reading screenshot ${readingPage} of ${batch.fileCount} · ${stage} ${percent}% · ${suggestions.length} rows found`:`Preparing OCR · ${stage} ${percent}%`;});
  for(let page=1;page<=batch.fileCount;page++){
   if(active!==batch||draft!==reviewDraft)throw Error('The selected submission changed. Return to this submission to continue.');
   readingPage=page;$('extract-status').textContent=`Reading screenshot ${page} of ${batch.fileCount} · ${suggestions.length} rows found…`;
   const rows=await ocr.read(await evidenceUrl(page,batch.id),page);if(!rows.length)emptyPages.push(page);
   suggestions.push(...rows.map(normalizeRow));
   // Reread results stay separate until every requested page has finished.
  }
  if(active!==batch||draft!==reviewDraft)throw Error('The selected submission changed; its draft was not replaced.');
  if(suggestions.length){reviewDraft.rows=mergeReread(reviewDraft.rows,suggestions);markChanged();selected=-1;candidateCache.clear();renderRows();suggestPageMatches();}
  $('extract-status').textContent=suggestions.length?`OCR complete: ${suggestions.length} unconfirmed rows from ${batch.fileCount} screenshots.${emptyPages.length?' No rows detected on pages '+emptyPages.join(', ')+'. Check those originals manually.':''} Check names, alliances and scores, then Save draft. Nothing is approved automatically.`:'OCR finished but could not detect leaderboard rows. Your existing draft has been kept. Check the screenshot layout or add rows manually.';
 }
 catch(error){$('extract-status').textContent=`OCR stopped on screenshot ${readingPage||1} of ${batch.fileCount}. ${suggestions.length} rows were read${suggestions.length?' in a temporary reading only':''}. ${error.message} Your existing draft and confirmations were kept. Nothing was confirmed or awarded.`;}
 finally{try{await ocr?.terminate();}catch{}extracting=false;$('extract').disabled=false;}
};
function showPreview(){
 const report=issues(draft.rows),out=$('preview-content');out.replaceChildren(el('div','FINAL REVIEW'),el('h2','Approval preview'),el('p',`${active.bounty}: ${report.included.length} included score rows. ${draft.rows.length-report.included.length} excluded.`),el('p',`${report.unmatched} unmatched, ${report.pending} awaiting confirmation, ${report.duplicates} duplicate conflicts.`),el('p',`Bounty reward: ${draft.rewardEligible===false?0:validReward()?rewardPoints():'Invalid'} points for the submitter.${draft.rewardEligible===false?' This submitter is excluded from bounty rewards.':''} This preview does not award points.`));
 for(const row of report.included)out.append(el('p',`${rowConfirmed(row)?'✓':'●'} ${row.playerName||row.name} · ${row.playerAlliance||row.alliance||'Alliance unknown'}${row.playerKey?'':' · No player matched'} · ${formatScore(row.score)} points`));
 $('preview-dialog').showModal();
}
$('preview').onclick=showPreview;$('decision-preview').onclick=showPreview;$('close-preview').onclick=()=>$('preview-dialog').close();
document.querySelectorAll('.final-check').forEach(input=>input.onchange=renderDecision);
$('approve-review').onclick=async()=>{
 if(!decisionReady()||!confirm(`Approve this submission, award ${draft.rewardEligible===false?0:rewardPoints()} bounty points to the submitter, save confirmed player histories for both alliances, and publish NvSP scores?`))return;
 const batch=active,reviewDraft=draft;reviewBusy=true;const button=$('approve-review');button.disabled=true;$('workspace').inert=true;
 try{
  if(dirty)await saveDraft();if(active!==batch||draft!==reviewDraft||dirty)throw Error('Save all current edits before approval.');
  const result=await call({action:'approve-review',batchId:active.id,revision:draft.revision,rewardRevision:draft.rewardRevision??0,note:clean($('review-note').value)});
  directoryCache.clear();profileCache.clear();dirty=false;active=null;draft=null;$('workspace').hidden=true;
  status(`Approved. ${result.published} NvSP scores published; ${result.opponentRowsRetained} opponent scores saved to private player histories. +${result.pointsAwarded} bounty points awarded.`);await load();
 }catch(error){status(error.message);}finally{reviewBusy=false;$('workspace').inert=false;renderDecision();}
};
$('reject-review').onclick=async()=>{
 const note=clean($('review-note').value);if(note.length<3){status('Add a review note explaining why the submission is rejected.');$('review-note').focus();return;}
 if(!confirm('Reject this submission? No scores or bounty points will be published.'))return;
 const button=$('reject-review');button.disabled=true;
 try{await call({action:'reject-review',batchId:active.id,note});directoryCache.clear();profileCache.clear();dirty=false;active=null;draft=null;$('workspace').hidden=true;status('Submission rejected. No scores or points were published.');await load();}
 catch(error){status(error.message);}finally{button.disabled=false;}
};
$('filter').oninput=renderRows;$('add').onclick=()=>{draft.rows.push(normalizeRow({rank:0,name:'New row',alliance:'',score:'0',page:currentPage,playerKey:'',excluded:false}));markChanged();selected=draft.rows.length-1;renderRows();selectRow(selected);};
const pageActionBar=el('div');pageActionBar.className='r4-page-action-bar';
pageActionBar.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 0;position:sticky;top:0;background:#08232f;z-index:2';
const pageAction=$('confirm-page');pageAction.style.cssText='background:#04d3dc;color:#00232d;border:0;border-radius:9px;padding:12px 18px;font-weight:700';
const rowTable=$('rows').closest('table');rowTable.before(pageActionBar);pageActionBar.append(pageAction);
if($('confirm-page-help'))pageActionBar.append($('confirm-page-help'));
$('confirm-page').onclick=async()=>{
 if(!alliancesReady())return;
 const plan=planPageConfirmation(pageRows(),draft.rows,r=>candidateCache.get(candidateKey(r)),rowConfirmed);if(!plan.ready.length)return;
 const page=currentPage;for(const {row,profile} of plan.ready){if(profile){row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';profileCache.set(profile.key,profile);}row.playerChecked=row.allianceChecked=row.scoreChecked=true;}
 markChanged();renderRows();$('confirm-page').disabled=true;status('Saving '+plan.ready.length+' confirmed rows…');
 try{if(!await saveDraft())return;status((dirty?'Newer edits still need saving. ':'')+'✓ '+plan.ready.length+' rows confirmed and draft saved on page '+page+'.'+(plan.unresolved?' '+plan.unresolved+' still need attention.':' Page complete.')+' Scores have not been published.');}
 catch(error){status('Rows are checked but could not be saved. '+error.message+' Use Save review draft to retry.');renderRows();}
};
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



import {attachEnhancedNames} from './enhanced-name-review.js?v=toolkit-only-20261003';
const enhancedNames=el('button','Read difficult names');enhancedNames.type='button';
async function readNamesLocally(context,careful=false){
 if(extracting)throw Error('Screenshot reading is already running.');extracting=true;$('extract').disabled=true;let reader;
 try{reader=await createLeaderboardOcr((stage,percent)=>{$('extract-status').textContent='Reading on this device · '+stage+' '+percent+'%';},{careful});return {rows:await reader.read(await evidenceUrl(context.page,context.batchId),context.page)};}
 finally{try{await reader?.terminate();}catch{}extracting=false;$('extract').disabled=false;}
}
const nameReadContext=()=>active&&draft&&!extracting?{batchId:active.id,page:currentPage,draft,rows:pageRows()}:null;
const applyNameReadings=count=>{candidateCache.clear();markChanged();renderRows();status(count+' screenshot readings changed by your selection. Player profiles and scores were kept. Save draft to retain the readings.');suggestPageMatches();};
attachEnhancedNames({button:enhancedNames,label:'Read difficult names on this device',getContext:nameReadContext,read:context=>readNamesLocally(context,true),onApply:applyNameReadings});
attachEnhancedNames({button:rereadNames,label:'Review new screenshot readings',getContext:nameReadContext,read:context=>readNamesLocally(context,false),onApply:applyNameReadings});
// Keep the normal review path clear; repair actions remain available on demand.
const readingTools=el('details'),readingToolsTitle=el('summary','Reading tools'),readingToolsBody=el('div');
readingTools.className='r4-reading-tools';readingToolsBody.className='r4-reading-tools-body';
readingToolsBody.append(el('p','Screenshot reading runs on this device without an AI API. Difficult-name reading checks extra language-specific crops and may take longer. Suggestions use the loaded LW Toolkit roster.'),rereadNames,enhancedNames,refreshMatches,$('add'));
readingTools.append(readingToolsTitle,readingToolsBody);$('extract').closest('.r4-toolbar').append(readingTools);
$('extract').textContent='Read & match screenshots';
const readingToolsStyle=el('style');readingToolsStyle.textContent='.r4-reading-tools{flex-basis:100%;margin-top:6px;border-top:1px solid #284854;padding-top:12px}.r4-reading-tools>summary{display:list-item;cursor:pointer;color:#9dbbc6;font-size:13px;font-weight:600;list-style-position:inside;padding:8px 0}.r4-reading-tools>summary:focus-visible{outline:2px solid #04d3dc;outline-offset:3px}.r4-reading-tools-body{display:flex;flex-wrap:wrap;gap:10px;padding:8px 0}.r4-reading-tools-body p{flex-basis:100%;margin:0 0 4px;color:#9dbbc6;font-size:13px}.r4-reading-tools-body button{font-size:13px;padding:9px 13px}';document.head.append(readingToolsStyle);

$('lane-queue-toggle').onclick=()=>{const layout=document.querySelector('.r4-layout');const shown=layout.classList.toggle('r4-show-queue');$('lane-queue-toggle').textContent=shown?'Hide review queue':'Show review queue';};
