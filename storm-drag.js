// Validate before mutating so a rejected drop preserves the previous assignment.
export function moveParticipant(plan,phase,key,target){
 const member=plan.members.find(m=>m.key===key);
 if(!member||member.role!=='participant')return 'Only participants can be assigned. Move reserves into the team first.';
 if(!['opening','later'].includes(phase))return 'Choose a battle phase.';
 const allowed=['hospital-1','hospital-2','hospital-3','hospital-4','refinery-1','refinery-2','science','info',...(phase==='later'?['silo','arsenal','factory']:[])];
 if(target&&!allowed.includes(target))return 'This building is not available in this phase.';
 const assignments=plan.assignments[phase];
 if(target&&(assignments[target]||[]).filter(k=>k!==key).length>=4)return 'This building already has four players. Move someone out first.';
 for(const building of Object.keys(assignments))assignments[building]=assignments[building].filter(k=>k!==key);
 if(target)(assignments[target]??=[]).push(key);
 return '';
}
export function mountDrag(root,{move,announce}){
 let active=null,selected=null,ghost=null,highlight=null,suppress=false;
 const clear=()=>{ghost?.remove();ghost=null;highlight?.classList.remove('ds-drop-active');highlight=null;active=null;};
 root.addEventListener('pointerdown',e=>{const chip=e.target.closest('[data-ds-drag]');if(!chip||e.button!==0)return;active={key:chip.dataset.dsDrag,name:chip.textContent,x:e.clientX,y:e.clientY,id:e.pointerId,started:false};chip.setPointerCapture(e.pointerId);});
 root.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.id)return;if(!active.started&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<7)return;e.preventDefault();active.started=true;if(!ghost){ghost=document.createElement('div');ghost.className='ds-drag-ghost';ghost.textContent=active.name;document.body.append(ghost)}ghost.style.left=(e.clientX+14)+'px';ghost.style.top=(e.clientY+14)+'px';const drop=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-ds-drop]');highlight?.classList.remove('ds-drop-active');highlight=drop&&root.contains(drop)?drop:null;highlight?.classList.add('ds-drop-active');});
 root.addEventListener('pointerup',e=>{if(!active||e.pointerId!==active.id)return;const key=active.key,started=active.started,target=highlight?.dataset.dsDrop;clear();if(started){suppress=true;setTimeout(()=>suppress=false,0);if(target!==undefined){selected=null;move(key,target)}else announce('Drop onto a building or the unassigned area.')}});
 root.addEventListener('pointercancel',clear);
 root.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();return}const chip=e.target.closest('[data-ds-drag]');if(chip){selected=chip.dataset.dsDrag;root.querySelectorAll('[data-ds-drag]').forEach(n=>n.setAttribute('aria-pressed',String(n===chip)));announce(chip.textContent+' selected. Choose a building or Unassigned.');e.stopImmediatePropagation();return}const drop=e.target.closest('[data-ds-drop]');if(selected&&drop){const key=selected;selected=null;move(key,drop.dataset.dsDrop);e.stopImmediatePropagation();}},true);
}
