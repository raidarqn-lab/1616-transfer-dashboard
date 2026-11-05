import {allianceTag} from './alliance-names.mjs?v=1';
import {APPROVAL_ALLIANCES,allianceApprovalRoster,allianceApprovalHtml} from './alliance-approval-export.mjs?v=1';

export function installAllianceApprovalExport({root,data}){
 const dialog=document.createElement('dialog');dialog.className='alliance-approval-dialog';dialog.setAttribute('aria-labelledby','alliance-approval-title');root.append(dialog);
 const style=document.createElement('style');style.textContent=`
 #transfer-mock .alliance-approval-dialog{width:min(1220px,96vw);max-width:96vw;max-height:94dvh;padding:22px;border:1px solid #c3cfdd;border-radius:14px;background:#f7f9fc;color:#263d59;box-shadow:0 22px 80px #10233545}
 #transfer-mock .alliance-approval-dialog::backdrop{background:#14223580;backdrop-filter:blur(3px)}
 #transfer-mock .alliance-approval-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px;background:none;padding:0;border:0;margin-bottom:14px}
 #transfer-mock .alliance-approval-dialog h2{font-size:21px;color:#183d63;margin:0}
 #transfer-mock .alliance-approval-dialog button,#transfer-mock .alliance-approval-dialog select{font:inherit;font-size:13px;border:1px solid #becbdd;background:white;border-radius:7px;padding:8px 12px;color:#284567;cursor:pointer}
 #transfer-mock .alliance-approval-dialog [data-download]{background:#183d63;color:white;border-color:#183d63}
 #transfer-mock .alliance-approval-dialog button:disabled{opacity:.5;cursor:default}
 #transfer-mock .alliance-approval-dialog label{font-size:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
 #transfer-mock .alliance-approval-dialog p{font-size:12px;line-height:1.6;color:#62758c;margin:10px 0}
 #transfer-mock .alliance-approval-dialog footer{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:12px 0}
 #transfer-mock .alliance-approval-dialog iframe{display:block;width:100%;height:58dvh;border:1px solid #ccd6e4;border-radius:8px;background:white}
 #transfer-mock .alliance-approval-dialog :focus-visible{outline:3px solid #c29a58;outline-offset:2px}
 @media(max-width:650px){#transfer-mock .alliance-approval-dialog{padding:14px}#transfer-mock .alliance-approval-dialog iframe{height:56dvh}}
 `;root.append(style);
 let returnFocus;
 const close=()=>{dialog.close();returnFocus?.isConnected&&returnFocus.focus();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return {open(){
  if(dialog.open)return;
  returnFocus=document.activeElement;
  const snapshot=data(),date=new Date(),rosters=APPROVAL_ALLIANCES.map(alliance=>({alliance,rows:allianceApprovalRoster(snapshot.players,snapshot.assignments,alliance)}));
  dialog.innerHTML='<header><h2 id="alliance-approval-title">Alliance approval form</h2><button type="button" data-close aria-label="Close alliance approval export">×</button></header><label>Alliance<select data-alliance aria-label="Alliance to review">'+rosters.map(({alliance,rows})=>'<option value="'+alliance+'">'+allianceTag(alliance)+' · '+rows.filter(p=>p.pool==='assigned').length+' assigned + '+rows.filter(p=>p.pool==='available').length+' unassigned</option>').join('')+'</select></label><p>Includes this alliance’s assigned players and the unassigned pool of approved and accepted applicants. Leaders can approve placements, request available players, add comments, and send back a filled HTML form or CSV.</p><footer><button type="button" data-download>Download form</button><button type="button" data-print>Print / Save PDF</button><span data-message role="status"></span></footer><iframe title="Alliance approval form preview" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"></iframe>';
  const select=dialog.querySelector('[data-alliance]'),frame=dialog.querySelector('iframe'),download=dialog.querySelector('[data-download]'),print=dialog.querySelector('[data-print]'),message=dialog.querySelector('[data-message]');let html='';
  const first=rosters.find(r=>r.rows.some(p=>p.pool==='assigned'));if(first)select.value=first.alliance;
  function update(){
   download.disabled=print.disabled=true;message.textContent='Preparing preview…';
   html=allianceApprovalHtml(snapshot.players,snapshot.assignments,{alliance:select.value,date,locale:snapshot.locale||'en'});
   frame.onload=()=>{const ready=!!frame.contentWindow?.allianceApprovalForm;download.disabled=print.disabled=!ready;message.textContent=ready?'Ready to share · '+allianceTag(select.value):'Preview could not load. Close and try again.';};frame.srcdoc=html;
  }
  select.onchange=update;dialog.querySelector('[data-close]').onclick=close;
  download.onclick=()=>{
   const current=frame.contentWindow?.allianceApprovalForm?.serialize()||html;
   const url=URL.createObjectURL(new Blob([current],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='1616-'+allianceTag(select.value)+'-alliance-approval-'+date.toISOString().slice(0,10)+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   message.textContent='Form downloaded. Send it to the '+allianceTag(select.value)+' leaders.';
  };
  print.onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};update();dialog.showModal();select.focus();
 }};
}
