import {altBadge,playerAltInfo} from './player-alt.mjs?v=1';
import {allianceKey,allianceTag} from './alliance-names.mjs?v=1';
import {sandboxGroupKey,sandboxSeat} from './seat-sandbox-core.mjs?v=8';

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const numeric=value=>value==null||value===''||typeof value==='boolean'||!Number.isFinite(Number(value))?null:Number(value);
const text=value=>String(value??'');
export const APPROVAL_ALLIANCES=['NvSP','NvEM','WaE','WaE2','B14K','DRoN','ECKO'];
export const APPROVAL_INSTRUCTION_STEPS=[
 'Download the attached .html form and open it in Chrome or Edge, preferably on a computer. No portal login is needed.',
 'Enter your name and review date.',
 'Under Assigned players, choose Approve, Decline or Discuss for each player and add any comments.',
 'Under Unassigned players, choose Request for your alliance, Pass or Discuss. These are approved or accepted applicants who do not yet have a destination alliance.',
 'Click Save filled form. This downloads a new .html file containing your answers. Save before closing; your answers are not submitted automatically.',
 'Send the newly downloaded, completed .html file to RaidARQN in a PRIVATE Discord direct message. Return the HTML file only, not Excel, CSV, PDF or screenshots. Do not post the form or your responses in a public channel.'
];
export const approvalInstructionsText='Alliance approval form — instructions\n\n'+APPROVAL_INSTRUCTION_STEPS.map((step,i)=>(i+1)+'. '+step).join('\n\n')+'\n\nUnassigned requests are subject to availability and final placement confirmation.';

// Export only the review fields. Application codes, contact details and team notes stay private.
export function allianceApprovalRoster(players,assignments,alliance){
 const target=allianceKey(alliance);
 if(!APPROVAL_ALLIANCES.includes(target))throw new Error('Choose a destination alliance.');
 const seen=new Set(),rows=[];
 for(const p of players){
  if(p.deleted||p.mergedInto||p.general||p.prospect||p.transferDirection||!['Approved','Accepted'].includes(p.status)||p.id==null||seen.has(String(p.id)))continue;
  seen.add(String(p.id));
  const home=allianceKey(assignments?.[p.id]||'');
  if(home&&home!==target)continue;
  rows.push({isAlt:playerAltInfo(p).isAlt,id:String(p.id),name:text(p.name),server:text(p.server),alliance:allianceTag(p.alliance),group:sandboxGroupKey(p.group)?text(p.group).trim():'No transfer group',
   destination:home?allianceTag(home):'Unassigned',pool:home?'assigned':'available',status:p.status,seat:sandboxSeat(p),
   hq:numeric(p.hqLevel),profession:numeric(p.profession),power:numeric(p.power),kills:numeric(p.kills)});
 }
 return rows.sort((a,b)=>a.pool.localeCompare(b.pool)||a.group.localeCompare(b.group,undefined,{sensitivity:'base',numeric:true})||a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
}

// This controller is embedded into the standalone file; it has no portal or network access.
export function installAllianceApprovalForm(){
 const rows=[...document.querySelectorAll('[data-review-row]')],reviewer=document.querySelector('#reviewer'),reviewDate=document.querySelector('#review-date');
 const notice=document.querySelector('#save-notice');let dirty=false;
 const decision=row=>row.querySelector('[data-decision]');
 const note=row=>row.querySelector('[data-comment]');
 function update(){
  const reviewed=rows.filter(row=>decision(row).value!=='').length;
  document.querySelector('#review-count').textContent=reviewed+' of '+rows.length+' reviewed';
  document.querySelector('#approval-count').textContent=rows.filter(row=>decision(row).value==='Approve').length+' approved';
  document.querySelector('#request-count').textContent=rows.filter(row=>decision(row).value==='Request').length+' requested';
  for(const row of rows){
   const choice=decision(row);row.dataset.decision=choice.value;
   row.querySelector('[data-print-decision]').textContent=choice.value?choice.selectedOptions[0].textContent:row.dataset.pool==='assigned'?'☐ Approve  ☐ Decline  ☐ Discuss':'☐ Request  ☐ Pass  ☐ Discuss';
   row.querySelector('[data-print-comment]').textContent=note(row).value||'________________________________';
  }
  document.querySelector('[data-print-reviewer]').textContent=reviewer.value||'____________________________';
  document.querySelector('[data-print-date]').textContent=reviewDate.value||'________________';
 }
 function serialize(){
  update();const clone=document.documentElement.cloneNode(true);
  const originals=[...document.querySelectorAll('input,select,textarea')];
  clone.querySelectorAll('input,select,textarea').forEach((el,i)=>{
   const original=originals[i];
   if(el.tagName==='SELECT')for(const option of el.options)option.toggleAttribute('selected',option.value===original.value);
   else if(el.tagName==='TEXTAREA')el.textContent=original.value;
   else el.setAttribute('value',original.value);
  });
  clone.querySelector('#save-notice').textContent='Saved copy · You can continue editing and save a new copy.';
  return '<!doctype html>\n'+clone.outerHTML;
 }
 function download(content,type,extension){
  const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');
  link.href=url;link.download=document.body.dataset.filename+'-review.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  dirty=false;notice.textContent='HTML saved. Send this newly downloaded file privately to RaidARQN on Discord.';
 }
 document.querySelector('#approval-form').addEventListener('input',()=>{dirty=true;notice.textContent='Changes in this window · Save the filled form before closing.';update();});
 document.querySelector('#approval-form').addEventListener('change',()=>{dirty=true;update();});
 document.querySelector('#save-filled').onclick=()=>download(serialize(),'text/html;charset=utf-8','html');
 window.addEventListener('beforeprint',update);
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.allianceApprovalForm={serialize,isDirty:()=>dirty};update();
}

export function allianceApprovalHtml(players,assignments,{alliance,date=new Date(),locale='en'}={}){
 const rows=allianceApprovalRoster(players,assignments,alliance),tag=allianceTag(allianceKey(alliance));
 const assigned=rows.filter(p=>p.pool==='assigned'),available=rows.filter(p=>p.pool==='available');
 const stamp=new Date(date).toISOString(),displayDate=new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Vancouver'}).format(new Date(date));
 const compact=value=>value==null?'—':new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:2}).format(value);
 const groupsFor=members=>{
  const groups=new Map();for(const p of members){const key=sandboxGroupKey(p.group)||'@ungrouped';if(!groups.has(key))groups.set(key,{name:p.group,members:[]});groups.get(key).members.push(p);}
  return [...groups.values()].map(g=>`<tbody><tr class="group"><th colspan="9">${esc(g.name)} <span>· ${g.members.length}</span></th></tr>${g.members.map(p=>{
   const choices=p.pool==='assigned'?[['Approve','Approve'],['Decline','Decline'],['Discuss','Discuss']]:[['Request','Request for '+tag],['Pass','Pass'],['Discuss','Discuss']];
   return `<tr data-review-row data-pool="${p.pool}" data-player="${esc(JSON.stringify(p))}"><td class="player"><strong>${esc(p.name)}${altBadge({isAlt:p.isAlt})}</strong><small>#${esc(p.server||'—')} · ${esc(p.alliance||'—')}</small></td><td><span class="seat ${p.seat.toLowerCase()}">${p.seat==='Unknown'?'Unconfirmed':p.seat}</span></td><td>${p.hq??'—'}</td><td>${p.profession??'—'}</td><td>${compact(p.power==null?null:p.power*1e6)}</td><td>${compact(p.kills)}</td><td><span class="portal-status">${esc(p.status)}</span></td><td class="decision"><select data-decision aria-label="Decision for ${esc(p.name)}"><option value="" selected>Awaiting review</option>${choices.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join('')}</select><span class="print-only" data-print-decision></span></td><td class="comments"><textarea data-comment rows="2" maxlength="2000" aria-label="Comments for ${esc(p.name)}" placeholder="Optional comments"></textarea><span class="print-only" data-print-comment></span></td></tr>`;
  }).join('')}</tbody>`).join('');
 };
 const section=(members,pool,title,description)=>`<section class="review-section" aria-label="${title}"><div class="section-heading"><span class="section-number">${pool==='assigned'?'01':'02'}</span><div><h2>${title} <span>${members.length}</span></h2><p>${description}</p></div></div>${members.length?`<div class="table-wrap"><table><thead><tr>${['Player / origin','Seat','HQ','Prof','THP','Kills','Portal status','Your decision','Comments'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead>${groupsFor(members)}</table></div>`:'<p class="empty">No players in this section.</p>'}</section>`;
 return `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(tag)} · Alliance approval form · 1616</title><style>${approvalFormStyles}</style></head><body data-alliance="${esc(tag)}" data-snapshot="${stamp}" data-filename="1616-${esc(tag)}-alliance-approval-${stamp.slice(0,10)}"><main><header class="report-header"><div class="eyebrow">1616 · TRANSFER ORGANIZATION</div><h1>${esc(tag)} <span>Alliance approval form</span></h1><p>Review your assigned players, then choose from the unassigned pool.</p><div class="snapshot">Roster snapshot · ${esc(displayDate)} Pacific</div></header><div class="summary"><div><strong>${assigned.length}</strong><span>Assigned to ${esc(tag)}</span></div><div><strong>${available.length}</strong><span>Unassigned · available</span></div><div class="progress"><strong id="review-count">0 of ${rows.length} reviewed</strong><span><span id="approval-count">0 approved</span> · <span id="request-count">0 requested</span></span></div></div><div class="instructions"><strong>Review → Save filled form → Private Discord DM to RaidARQN</strong><ol>${APPROVAL_INSTRUCTION_STEPS.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p>Unassigned requests are subject to availability and final placement confirmation.</p></div><div class="actions"><button id="save-filled" type="button" class="primary">Save filled form</button><span id="save-notice" role="status">Save a copy to keep your responses.</span></div><form id="approval-form" onsubmit="return false"><div class="reviewer"><label>Reviewed by<input id="reviewer" maxlength="120" autocomplete="name" placeholder="Leader name"><span class="print-only" data-print-reviewer></span></label><label>Review date<input id="review-date" type="date"><span class="print-only" data-print-date></span></label><div><strong>${esc(tag)}</strong><span>Alliance review</span></div></div>${section(assigned,'assigned','Assigned to '+esc(tag),'Approve, decline or flag a player for discussion.')}${section(available,'available','Unassigned players','Request players for your alliance, pass, or flag them for discussion.')}</form><footer>Approved and accepted applicants from saved placements · THP = total hero power · Prof = profession level · — = not recorded · Seats show confirmed colours only.<br>These responses are an alliance review. The transfer team will confirm final placements. Keep this roster within authorized leadership.</footer></main><script>(${installAllianceApprovalForm.toString()})();</script></body></html>`;
}

const approvalFormStyles=`
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#edf1f6;color:#24344a;font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}main{max-width:1220px;margin:28px auto;padding:0 24px 30px}.report-header{background:#183d63;color:#fff;padding:25px 28px;border-radius:14px 14px 0 0;border-top:4px solid #ccb889}.eyebrow{font-size:10px;letter-spacing:2px;color:#c7d5e6;font-weight:650}h1{font-size:30px;margin:8px 0 5px;letter-spacing:-.7px}h1 span{font-size:21px;font-weight:400;margin-left:12px;color:#e1e9f3}.report-header p{margin:4px 0;color:#dae5ef}.snapshot{margin-top:14px;font-size:11px;color:#bdcee1}.summary{display:flex;background:white;border:1px solid #d6e0ec;border-top:0;border-radius:0 0 12px 12px;margin-bottom:18px}.summary>div{display:grid;gap:3px;padding:16px 24px;min-width:180px;border-right:1px solid #e4eaf2}.summary strong{font-size:23px;color:#183d63}.summary span{font-size:11px;color:#687c93}.summary .progress{margin-left:auto;border:0}.progress strong{font-size:18px}.instructions{margin:18px 0;color:#52667e}.instructions strong{color:#243f60}.instructions ol{padding-left:22px;font-size:12px;max-width:1000px}.instructions li{margin:6px 0}.instructions p{font-size:12px;margin:5px 0;max-width:950px}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:14px 0}button,input,select,textarea{font:inherit}button{border:1px solid #b9c9dc;border-radius:7px;background:white;color:#284567;padding:9px 13px;cursor:pointer}.primary{background:#183d63;border-color:#183d63;color:white;font-weight:600}button:hover{filter:brightness(.94)}:focus-visible{outline:3px solid #d7a344;outline-offset:2px}#save-notice{font-size:11px;color:#65788d;flex-basis:100%;min-height:17px}.reviewer{display:flex;align-items:end;gap:18px;padding:18px 20px;background:#fff;border:1px solid #d6e0ec;border-radius:10px;margin:18px 0 24px}.reviewer label{display:grid;gap:6px;font-size:11px;font-weight:600}.reviewer input{border:1px solid #becbdd;background:#fff;border-radius:5px;padding:8px 10px;font-size:13px;color:#24344a;min-width:200px}.reviewer>div{margin-left:auto;display:grid;text-align:right;gap:3px}.reviewer>div strong{font-size:20px;color:#183d63}.reviewer>div span{font-size:11px;color:#687c93}.review-section{margin-top:25px}.section-heading{display:flex;align-items:center;gap:12px;margin-bottom:10px}.section-number{background:#dde6f1;color:#426080;border-radius:7px;font-size:12px;padding:8px;font-weight:700}h2{font-size:17px;margin:0;color:#183d63}h2>span{font-size:11px;font-weight:500;background:#dce6f2;padding:2px 7px;border-radius:15px;margin-left:5px}.section-heading p{margin:3px 0 0;color:#687c93;font-size:11px}.table-wrap{overflow:auto;border-radius:8px;border:1px solid #c8d5e5}table{border-collapse:collapse;width:100%;min-width:970px;background:white;font-variant-numeric:tabular-nums}thead th{background:#e8eef6;color:#4c627d;font-size:10px;text-align:left;white-space:nowrap;padding:9px 8px;border-bottom:1px solid #c6d4e6}td{font-size:11px;padding:8px;border-bottom:1px solid #e1e7f0;vertical-align:middle}tbody tr:nth-child(odd):not(.group){background:#f6f8fb}.group th{background:#294b6f;color:white;padding:6px 10px;text-align:left;font-size:11px}.group span{color:#cfdaea;font-weight:400}.player{min-width:155px;max-width:225px;overflow-wrap:anywhere}.player strong{display:block;font-size:12px}.player small{display:block;color:#71839a;font-size:10px;margin-top:3px}.seat{display:inline-block;border:1px solid #b9c5d2;border-radius:5px;padding:3px 5px;font-size:10px;white-space:nowrap;background:#edf0f4}.seat.gold{background:#fff0c3;border-color:#dbc37d;color:#775915}.seat.purple{background:#eee1fc;border-color:#c7ace1;color:#6c4592}.seat.blue{background:#dceaff;border-color:#abc7ee;color:#315d98}.seat.white{background:#fff;border-color:#aeb9c8;color:#44536b}.portal-status{color:#64788e;font-size:10px}.decision{min-width:144px}.decision select{width:100%;padding:7px 5px;color:#53677e;border:1px solid #bac9da;border-radius:5px;background:#fff;font-size:11px}.comments{min-width:180px;width:24%}textarea{display:block;width:100%;min-height:40px;resize:vertical;background:#fff;border:1px solid #ccd6e3;border-radius:5px;color:#263c55;padding:6px;font-size:11px}tr[data-decision=Approve] select,tr[data-decision=Request] select{background:#e8f5ef;border-color:#8eb7a4;color:#235f47}tr[data-decision=Decline] select{background:#fbedef;border-color:#dfadb4;color:#8c3344}tr[data-decision=Discuss] select{background:#fff4d9;border-color:#dec58e;color:#7a5b1a}.empty{padding:20px;background:white;border:1px dashed #c3d0e0;border-radius:8px;color:#728197}footer{margin-top:24px;font-size:10px;color:#6b7e94;line-height:1.7}.print-only{display:none}@media(max-width:700px){main{padding:0 12px 20px;margin:12px auto}.report-header{padding:20px}h1 span{display:block;margin:5px 0 0;font-size:19px}.summary{flex-wrap:wrap}.summary>div{padding:12px;min-width:0;flex:1}.summary .progress{flex-basis:100%;border-top:1px solid #e4eaf2}.reviewer{flex-wrap:wrap}.reviewer label{flex:1}.reviewer input{min-width:0;width:100%}.reviewer>div{display:none}}@media print{body{background:white;font-size:10px}main{margin:0;padding:0;max-width:none}.report-header{padding:12px 16px;border-radius:0}h1{font-size:24px}h1 span{font-size:17px}.summary>div{padding:8px 16px}.summary strong{font-size:18px}.instructions,.actions{display:none}.reviewer{margin:12px 0;padding:10px 12px}.reviewer label{min-width:220px}.reviewer input,select,textarea{display:none!important}.print-only{display:block;white-space:pre-wrap;overflow-wrap:anywhere}.reviewer .print-only{font-size:12px;font-weight:400}.table-wrap{overflow:visible;border-radius:0}table{min-width:0}.review-section{margin-top:16px}.section-heading{break-after:avoid}td{font-size:9px;padding:5px 6px}.player{min-width:115px}.player strong{font-size:10px}.decision{min-width:110px}.comments{min-width:130px}.group{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}.summary{break-inside:avoid}.seat{font-size:9px}.report-header,.group th,thead th,.seat{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;
