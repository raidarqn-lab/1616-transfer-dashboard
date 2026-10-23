import {clearInvalidPairings} from './storm-coverage.js?v=weekly-20261014';
// Exchange roles atomically, including full 20/10 teams. The promoted player
// inherits the starter's building duties; attendance stays with each player.
export function swapPlanMembers(plan,key,target,{locked=()=>false,benched=()=>false}={}){
 const a=plan.members.find(m=>m.key===key),b=plan.members.find(m=>m.key===target);
 if(!a||!b||a===b)return 'Choose two different players in this team.';
 if(a.role===b.role)return 'Swap a starter with a substitute.';
 const starter=a.role==='participant'?a:b,sub=a.role==='reserve'?a:b;
 if(locked(starter.key))return starter.name+' has a locked Core seat.';
 if(benched(sub.key))return sub.name+' has a penalty bench.';
 starter.role='reserve';sub.role='participant';
 if(starter.duty)sub.duty=starter.duty;else delete sub.duty;
 delete starter.duty;
 for(const assignments of Object.values(plan.assignments||{}))for(const id of Object.keys(assignments))assignments[id]=assignments[id].map(k=>k===starter.key?sub.key:k);
 clearInvalidPairings(plan);return '';
}
// Map drops can move players between registered seats and the substitute area.
export function moveMapMember(plan,phase,key,target,{locked=false}={}){
 const m=plan.members.find(m=>m.key===key);if(!m)return 'Choose a player in this plan.';
 if(target==='substitutes'){
  if(m.role==='participant'&&locked)return 'This player has a locked Core seat.';
  if(m.role!=='reserve'&&plan.members.filter(m=>m.role==='reserve').length>=10)return 'Substitutes are full. Drop onto a substitute’s name to swap places.';
  for(const assignments of Object.values(plan.assignments))for(const id of Object.keys(assignments))assignments[id]=assignments[id].filter(k=>k!==key);
  m.role='reserve';clearInvalidPairings(plan);delete m.duty;plan.members=plan.members.filter(x=>x.key!==key).concat(m);return '';
 }
 if(m.role==='reserve'){
  if(target==='starters')target='';
  if(plan.members.filter(m=>m.role==='participant').length>=20)return 'Starters are full. Drop onto a starter’s name to swap places.';
  const next=structuredClone(plan);next.members.find(m=>m.key===key).role='participant';const error=moveParticipant(next,phase,key,target);if(error)return error;
  plan.members=next.members;plan.assignments=next.assignments;clearInvalidPairings(plan);return '';
 }
 return moveParticipant(plan,phase,key,target==='starters'?'':target);
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
 const dropAt=()=>{const node=document.elementFromPoint(pointerX,pointerY)?.closest('[data-ds-drop]');return node&&root.contains(node)?node:null;};
 const clear=()=>{cancelAnimationFrame(frame);frame=0;ghost?.remove();ghost=null;highlight?.classList.remove('ds-drop-active');highlight=null;active=null;root.classList.remove('ds-dragging');};
 const select=key=>{selected=key;root.querySelectorAll('[data-ds-drag]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.dsDrag===key)));};
 const track=()=>{
  if(!active?.started)return;
  // Scroll the panel under the pointer, including dialogs and nested rosters.
  let el=document.elementFromPoint(pointerX,pointerY);
  while(el){const r=el.getBoundingClientRect(),style=getComputedStyle(el);if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight){const delta=pointerY<r.top+48?-12:pointerY>r.bottom-48?12:0;if(delta){const before=el.scrollTop;el.scrollTop+=delta;if(el.scrollTop!==before)break;}}el=el.parentElement;}
  const drop=dropAt();highlight?.classList.remove('ds-drop-active');highlight=drop;highlight?.classList.add('ds-drop-active');frame=requestAnimationFrame(track);
 };
 root.addEventListener('pointerdown',e=>{const chip=e.target.closest('[data-ds-drag]');if(!chip||chip.disabled||e.button!==0)return;active={key:chip.dataset.dsDrag,name:chip.dataset.playerName||chip.textContent,x:e.clientX,y:e.clientY,id:e.pointerId,chip,started:false};});
 root.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.id)return;if(!active.started&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<8)return;e.preventDefault();if(!active.started){active.started=true;active.chip.setPointerCapture(e.pointerId);select(active.key);root.classList.add('ds-dragging');}pointerX=e.clientX;pointerY=e.clientY;if(!ghost){ghost=document.createElement('div');ghost.className='ds-drag-ghost';ghost.textContent=active.name;(root.matches('dialog')?root:document.body).append(ghost);}ghost.style.left=(pointerX+14)+'px';ghost.style.top=(pointerY+14)+'px';if(!frame)frame=requestAnimationFrame(track);});
 root.addEventListener('pointerup',e=>{if(!active||e.pointerId!==active.id)return;pointerX=e.clientX;pointerY=e.clientY;const key=active.key,started=active.started,drop=dropAt(),target=drop?.dataset.dsDrop;clear();if(started){suppress=true;setTimeout(()=>suppress=false,0);if(target!==undefined){select(null);move(key,target);}else announce('Drop onto a building, group heading, or another player to swap.');}});
 root.addEventListener('pointercancel',()=>{clear();select(null);});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&(active||selected)){e.preventDefault();clear();select(null);announce('Selection cleared.');}});
 root.addEventListener('click',e=>{
  if(suppress){e.preventDefault();e.stopImmediatePropagation();return;}
  const chip=e.target.closest('[data-ds-drag]');
  if(chip){if(selected&&selected!==chip.dataset.dsDrag&&chip.dataset.dsDrop?.startsWith('swap:')){const key=selected;select(null);move(key,chip.dataset.dsDrop);}else{select(chip.dataset.dsDrag);announce((chip.dataset.playerName||chip.textContent)+' selected. Choose a building or group, or select another player to swap.');}e.stopImmediatePropagation();return;}
  const control=e.target.closest('button,select,input,label');if(control&&!control.hasAttribute('data-ds-drop')&&!control.hasAttribute('data-ds-building'))return;
  const drop=e.target.closest('[data-ds-drop]');if(selected&&drop){const key=selected;select(null);move(key,drop.dataset.dsDrop);e.stopImmediatePropagation();}
 },true);
}
