import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';

const $=id=>document.getElementById(id);
const status=s=>$('status').textContent=s;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const text=v=>String(v??'').trim();

async function call(body){
 if(!user)throw Error('Sign in to the Portal first.');
 const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify(body),signal:AbortSignal.timeout(body.action==='extract-page'?65000:30000)});
 const d=await r.json();
 if(!r.ok)throw Error(d.error||'Unable to save. Reload the review if another reviewer changed it.');
 return d;
}

let active,draft,dirty=false,selected=0,extracting=false;
const profileCache=new Map();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

function normalizeRow(r){
 const migrated=!!r.checked;
 return {...r,alliance:text(r.alliance),playerAlliance:text(r.playerAlliance),playerName:text(r.playerName),playerKey:text(r.playerKey),playerChecked:r.playerChecked??migrated,allianceChecked:r.allianceChecked??false,scoreChecked:r.scoreChecked??migrated,excluded:!!r.excluded};
}
function rowConfirmed(r){return !!(r.playerKey&&r.playerChecked&&r.allianceChecked&&r.scoreChecked);}
function issues(rows){
 const included=rows.filter(r=>!r.excluded),keys=new Set(),ranks=new Set();let duplicates=0;
 for(const r of included){if(ranks.has(r.rank)||(r.playerKey&&keys.has(r.playerKey)))duplicates++;ranks.add(r.rank);if(r.playerKey)keys.add(r.playerKey);}
 return {included,duplicates,unmatched:included.filter(r=>!r.playerKey).length,pending:included.filter(r=>!rowConfirmed(r)).length};
}
function summary(){const s=issues(draft.rows);$('counts').textContent=`${draft.rows.length} rows · ${s.included.length} included · ${s.unmatched} unmatched · ${s.pending} awaiting confirmation · ${s.duplicates} duplicate conflicts`;$('save').textContent=dirty?'Save review draft':'Draft saved';}
function changed(){dirty=true;summary();}
function resetConfirmations(r,...keys){for(const key of keys)r[key]=false;}

async function evidence(page){
 try{
  $('image-status').textContent=`Loading page ${page}…`;
  const {url}=await call({action:'evidence',batchId:active.id,sequence:page});
  const img=el('img');img.alt=`Original screenshot page ${page}`;
  img.onload=()=>{$('image-status').textContent=`Page ${page} of ${active.fileCount}`;};
  img.onerror=()=>{$('image-status').textContent='Image unavailable. Select the page again to retry.';};
  img.src=url;$('image').replaceChildren(img);$('page').value=page;
 }catch(e){status(e.message);}
}

function renderRows(){
 const list=$('rows');list.replaceChildren();const q=$('filter').value.toLowerCase();
 draft.rows.forEach((r,i)=>{
  if(q&&!`${r.name} ${r.alliance} ${r.rank} ${r.playerName} ${r.playerAlliance} ${r.playerKey}`.toLowerCase().includes(q))return;
  const state=r.excluded?'Excluded':rowConfirmed(r)?'✓ Confirmed':`● ${r.playerKey?'Review match':'Unmatched'}`;
  const b=el('button',`#${r.rank} ${r.name} · ${r.alliance||'Alliance missing'} · ${Number(r.score).toLocaleString()} · ${state}`);
  b.className='row '+(rowConfirmed(r)?'confirmed':'pending')+(i===selected?' selected':'');b.onclick=()=>selectRow(i);list.append(b);
 });
 summary();
}
function field(label,value,onchange,type='text'){const l=el('label',label),input=el('input');input.type=type;input.value=value??'';input.onchange=()=>{onchange(input.value);changed();renderRows();};l.append(input);return l;}
function checkbox(key,label,r){const l=el('label'),c=el('input');c.type='checkbox';c.checked=!!r[key];c.onchange=()=>{r[key]=c.checked;changed();renderRows();};l.append(c,document.createTextNode(label));return l;}
function profileLine(label,value){const p=el('p');p.append(el('strong',`${label}: `),document.createTextNode(text(value)||'Unknown'));return p;}
function showProfile(edit,r){
 const card=el('section');card.className='profile-card';
 if(!r.playerKey){card.append(el('h3','No transfer profile selected'),el('p','Search the transfer directory and choose the correct player.'));edit.append(card);return;}
 const p=profileCache.get(r.playerKey)||{};
 card.append(el('h3',r.playerName||p.name||r.playerKey),profileLine('Player ID',p.sourceUid||r.playerKey),profileLine('Alliance',r.playerAlliance||p.alliance),profileLine('Server',p.server),profileLine('Transfer status',p.status),profileLine('Seat',p.confirmedSeat||p.seat),profileLine('Profession',p.profession),profileLine('Hero power',p.power),profileLine('Known names',[p.translatedName,...(p.aliases||[]),...(p.previousGameNames||[])].filter(Boolean).join(' · ')));
 edit.append(card);
}

function selectRow(i){
 selected=i;const r=draft.rows[i],edit=$('editor');edit.replaceChildren();renderRows();evidence(r.page);
 edit.append(field('Rank',r.rank,v=>{r.rank=Number(v);resetConfirmations(r,'playerChecked','allianceChecked','scoreChecked');},'number'),field('Screenshot player name',r.name,v=>{r.name=v;resetConfirmations(r,'playerChecked');}),field('Screenshot alliance',r.alliance,v=>{r.alliance=v;resetConfirmations(r,'allianceChecked');}),field('Screenshot score',r.score,v=>{r.score=v;resetConfirmations(r,'scoreChecked');},'number'),field('Source page',r.page,v=>{r.page=Number(v);resetConfirmations(r,'playerChecked','allianceChecked','scoreChecked');},'number'));
 showProfile(edit,r);
 const searchLabel=el('label','Find player by name, alliance, server or ID'),search=el('input');search.value=r.name;searchLabel.append(search);
 const find=el('button','Search transfer directory'),results=el('div');results.className='search-results';
 const runSearch=async()=>{
  find.disabled=true;
  try{
   const players=await call({action:'player-search',query:search.value});results.replaceChildren();
   if(!players.length)results.append(el('p','No match found. Change the name, alliance, server or player ID and search again.'));
   for(const p of players){const b=el('button',`${p.name} · ${p.alliance||'Alliance unknown'} · Server ${p.server||'unknown'} · ${p.sourceUid||p.key}`);b.onclick=()=>{profileCache.set(p.key,p);r.playerKey=p.key;r.playerName=p.name;r.playerAlliance=p.alliance||'';resetConfirmations(r,'playerChecked','allianceChecked');changed();selectRow(i);};results.append(b);}
  }catch(e){status(e.message);}finally{find.disabled=false;}
 };
 find.onclick=runSearch;search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}};
 edit.append(searchLabel,find,results,checkbox('playerChecked','Confirm this is the correct transfer player profile',r),checkbox('allianceChecked',`Confirm the screenshot alliance matches the player (${r.alliance||'missing'} ↔ ${r.playerAlliance||'unknown'})`,r),checkbox('scoreChecked','Confirm the score matches the screenshot',r),checkbox('excluded','Exclude duplicate or unrelated row',r));
 const clear=el('button','Clear player match');clear.onclick=()=>{r.playerKey='';r.playerName='';r.playerAlliance='';resetConfirmations(r,'playerChecked','allianceChecked');changed();selectRow(i);};edit.append(clear);
 if(r.playerKey&&!profileCache.has(r.playerKey))call({action:'player-search',query:r.playerKey}).then(players=>{const p=players.find(p=>p.key===r.playerKey);if(p){profileCache.set(p.key,p);r.playerName=r.playerName||p.name;r.playerAlliance=r.playerAlliance||p.alliance||'';if(selected===i)selectRow(i);}}).catch(e=>status(e.message));
}

async function openBatch(r){
 if(dirty&&!confirm('Discard unsaved review changes?'))return;
 try{
  const d=await call({action:'review-draft',batchId:r.id});active=r;draft={...d,rows:(d.rows||[]).map(normalizeRow)};dirty=false;$('workspace').hidden=false;
  $('batch-title').textContent=`${r.bounty} · ${r.gameDate} · ${r.fileCount} screenshots`;$('page').replaceChildren();for(let n=1;n<=r.fileCount;n++){const o=el('option',`Page ${n}`);o.value=n;$('page').append(o);}
  renderRows();if(draft.rows.length)selectRow(0);else{$('editor').replaceChildren(el('p','No extracted draft yet. Add a row to start matching.'));evidence(1);}status('Review draft loaded. Changes are private and do not publish scores.');
 }catch(e){status(e.message);}
}
async function load(){
 try{
  const rows=await call({action:'review-list'});$('queue').replaceChildren();
  for(const r of rows){const p=await call({action:'profile',playerKey:r.playerKey});const b=el('button',`${p?.name||r.playerKey} · ${r.gameDate} · ${r.fileCount} screenshots`);b.onclick=()=>openBatch(r);$('queue').append(b);}
  status(`${rows.length} submissions awaiting review.`);if(rows.length===1&&!active)await openBatch(rows[0]);
 }catch(e){status(e.message);}
}

$('save').onclick=async()=>{try{$('save').disabled=true;draft=await call({action:'save-review',batchId:active.id,revision:draft.revision,rows:draft.rows});draft.rows=draft.rows.map(normalizeRow);dirty=false;summary();status('Review draft saved to the live Portal. Scores remain unpublished.');}catch(e){status(e.message);}finally{$('save').disabled=false;}};
$('extract').onclick=async()=>{
 if(extracting||!active)return;
 if(draft.rows.length&&!confirm('Replace the current draft rows with new screenshot suggestions? Unsaved matching work will be lost.'))return;
 extracting=true;$('extract').disabled=true;const suggestions=[];$('extract-status').textContent=`Starting extraction for ${active.fileCount} screenshots…`;
 try{
  for(let page=1;page<=active.fileCount;page++){
   $('extract-status').textContent=`Reading screenshot ${page} of ${active.fileCount}…`;
   const result=await call({action:'extract-page',batchId:active.id,sequence:page});
   for(const row of result.rows||[])suggestions.push(normalizeRow(row));
  }
  draft.rows=suggestions;dirty=true;selected=0;renderRows();
  if(draft.rows.length)selectRow(0);else $('editor').replaceChildren(el('p','No ranking rows were detected. Check the screenshots and add rows manually.'));
  $('extract-status').textContent=`Generated ${suggestions.length} unconfirmed suggestions from ${active.fileCount} screenshots. Review yellow rows, then save the draft.`;
 }catch(e){$('extract-status').textContent=`Extraction stopped after ${suggestions.length} suggestions. ${e.message} You can retry without saving.`;}
 finally{extracting=false;$('extract').disabled=false;}
};
$('preview').onclick=()=>{const s=issues(draft.rows),out=$('preview-content');out.replaceChildren(el('h2','Approval preview'),el('p',`${active.bounty}: ${s.included.length} included score rows. ${draft.rows.length-s.included.length} excluded.`),el('p',`${s.unmatched} unmatched, ${s.pending} awaiting confirmation, ${s.duplicates} duplicate conflicts.`),el('p','Approval is not enabled yet. This preview does not update player scores, award bounty points, or delete screenshots.'));for(const r of s.included)out.append(el('p',`${rowConfirmed(r)?'✓':'●'} ${r.playerName||r.name} · ${r.playerAlliance||r.alliance||'Alliance unknown'} → ${r.playerKey||'UNMATCHED'} · ${Number(r.score).toLocaleString()} points`));$('preview-dialog').showModal();};
$('close-preview').onclick=()=>$('preview-dialog').close();$('filter').oninput=renderRows;$('page').onchange=()=>evidence(Number($('page').value));$('add').onclick=()=>{draft.rows.push(normalizeRow({rank:draft.rows.length+1,name:'New row',alliance:'',score:'0',page:Number($('page').value)||1,playerKey:'',excluded:false}));changed();selectRow(draft.rows.length-1);};$('refresh').onclick=load;load();
