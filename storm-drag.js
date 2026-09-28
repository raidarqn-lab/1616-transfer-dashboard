// Map drops can move players between registered seats and the substitute area.
export function moveMapMember(plan,phase,key,target,{locked=false}={}){
 const m=plan.members.find(m=>m.key===key);if(!m)return 'Choose a player in this plan.';
 if(target==='substitutes'){
  if(m.role==='participant'&&locked)return 'This player has a locked Core seat.';
  if(m.role!=='reserve'&&plan.members.filter(m=>m.role==='reserve').length>=10)return 'All 10 substitute seats are filled.';
  for(const assignments of Object.values(plan.assignments))for(const id of Object.keys(assignments))assignments[id]=assignments[id].filter(k=>k!==key);
  m.role='reserve';delete m.duty;plan.members=plan.members.filter(x=>x.key!==key).concat(m);return '';
 }
 if(m.role==='reserve'){
  if(!target)return 'Drop a substitute onto a building to register them, or into Substitutes to keep them on standby.';
  if(plan.members.filter(m=>m.role==='participant').length>=20)return 'All 20 registered seats are filled. Move a registered player to Substitutes first.';
  const next=structuredClone(plan);next.members.find(m=>m.key===key).role='participant';const error=moveParticipant(next,phase,key,target);if(error)return error;
  plan.members=next.members;plan.assignments=next.assignments;return '';
 }
 return moveParticipant(plan,phase,key,target);
}
// Validate before mutating so a rejected drop preserves the previous assignment.
export function moveParticipant(plan,phase,key,target){
 const member=plan.members.find(m=>m.key===key);
 if(!member||member.role!=='participant')return 'Only participants can be assigned. Move reserves into the team first.';
 if(!['opening','later'].includes(phase))return 'Choose a battle phase.';
 const allowed=['hospital-1','hospital-2','hospital-3','hospital-4','refinery-1','refinery-2','science','info','silo','arsenal','factory'];
 if(target&&!allowed.includes(target))return 'This building is not available in this phase.';
 const assignments=plan.assignments[phase];
 if(target&&(assignments[target]||[]).filter(k=>k!==key).length>=4)return 'This building already has four players. Move someone out first.';
 for(const building of Object.keys(assignments))assignments[building]=assignments[building].filter(k=>k!==key);
 if(target)(assignments[target]??=[]).push(key);
 return '';
}
export function mountDrag(root,{move,announce}){
 let active=null,selected=null,ghost=null,highlight=null,suppress=false,frame=0,pointerX=0,pointerY=0;
 const clear=()=>{cancelAnimationFrame(frame);frame=0;ghost?.remove();ghost=null;highlight?.classList.remove('ds-drop-active');highlight=null;active=null;};
 const track=()=>{if(!active?.started)return;const speed=pointerY<85?-14:pointerY>innerHeight-85?14:0;if(speed)window.scrollBy(0,speed);const drop=document.elementFromPoint(pointerX,pointerY)?.closest('[data-ds-drop]');highlight?.classList.remove('ds-drop-active');highlight=drop&&root.contains(drop)?drop:null;highlight?.classList.add('ds-drop-active');frame=requestAnimationFrame(track);};
 root.addEventListener('pointerdown',e=>{const chip=e.target.closest('[data-ds-drag]');if(!chip||e.button!==0)return;active={key:chip.dataset.dsDrag,name:chip.textContent,x:e.clientX,y:e.clientY,id:e.pointerId,started:false};chip.setPointerCapture(e.pointerId);});
 root.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.id)return;if(!active.started&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<7)return;e.preventDefault();active.started=true;pointerX=e.clientX;pointerY=e.clientY;if(!frame)frame=requestAnimationFrame(track);if(!ghost){ghost=document.createElement('div');ghost.className='ds-drag-ghost';ghost.textContent=active.name;document.body.append(ghost)}ghost.style.left=(e.clientX+14)+'px';ghost.style.top=(e.clientY+14)+'px';const drop=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-ds-drop]');highlight?.classList.remove('ds-drop-active');highlight=drop&&root.contains(drop)?drop:null;highlight?.classList.add('ds-drop-active');});
 root.addEventListener('pointerup',e=>{if(!active||e.pointerId!==active.id)return;const key=active.key,started=active.started,drop=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-ds-drop]'),target=drop&&root.contains(drop)?drop.dataset.dsDrop:undefined;clear();if(started){suppress=true;setTimeout(()=>suppress=false,0);if(target!==undefined){selected=null;move(key,target)}else announce('Drop onto a building, Substitutes, or the unassigned area.')}});
 root.addEventListener('pointercancel',clear);
 root.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();return}const chip=e.target.closest('[data-ds-drag]');if(chip){selected=chip.dataset.dsDrag;root.querySelectorAll('[data-ds-drag]').forEach(n=>n.setAttribute('aria-pressed',String(n===chip)));announce(chip.textContent+' selected. Choose a building, Substitutes, or Unassigned.');e.stopImmediatePropagation();return}const control=e.target.closest('button,select,input,label');if(control&&!control.hasAttribute('data-ds-drop')&&!control.hasAttribute('data-ds-building'))return;const drop=e.target.closest('[data-ds-drop]');if(selected&&drop){const key=selected;selected=null;move(key,drop.dataset.dsDrop);e.stopImmediatePropagation();}},true);
}
