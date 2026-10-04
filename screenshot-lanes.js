import {detectLeaderboardBands} from './nova-bounty-ocr.js?v=browser-20261003';
const evidenceCache=new WeakMap();
/** Source pixels only. Never reconstruct lettering or infer a missing crop. */
export function screenshotRowBounds(row,rows,bands){
 if(!Array.isArray(bands)||!bands.length)return null;
 const slot=Number.isInteger(row.ocrSlot)?row.ocrSlot:rows.length===bands.length?rows.indexOf(row):-1;
 if(slot<0||slot>=bands.length)return null;
 if(rows.some(other=>other!==row&&Number.isInteger(other.ocrSlot)&&other.ocrSlot===slot))return null;
 const b=bands[slot];return b&&Number.isFinite(b.top)&&Number.isFinite(b.bottom)&&b.bottom>b.top?b:null;
}
export function renderScreenshotLaneEvidence({container,row,rows,image,onOpen}){
 container.replaceChildren();const open=document.createElement('button');open.type='button';open.className='r4-lane-image';open.setAttribute('aria-label','View original screenshot for '+(row.playerName||row.name||'this player'));open.onclick=onOpen;
 const label=document.createElement('span');label.className='r4-lane-caption';label.textContent='View original screenshot';
 try{
  if(!image?.complete||!image.naturalWidth)throw Error('loading');
  let source=evidenceCache.get(image);
  if(!source){const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);source={canvas,bands:detectLeaderboardBands(ctx.getImageData(0,0,canvas.width,canvas.height))};evidenceCache.set(image,source);}
  const bounds=screenshotRowBounds(row,rows,source.bands);if(!bounds)throw Error('unavailable');
  const canvas=document.createElement('canvas');canvas.width=source.canvas.width;canvas.height=Math.ceil(bounds.bottom-bounds.top);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Original screenshot row; open full screenshot to inspect');canvas.getContext('2d').drawImage(source.canvas,0,bounds.top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);open.append(canvas);label.textContent='Screenshot row · click to enlarge';
 }catch{label.textContent=image?.complete?'View full screenshot · row crop unavailable':'Loading original screenshot…';}
 open.append(label);container.append(open);
}
