import {availableBuildings,mapRails,esc,roleCopy} from './storm-core.js?v=map-subs-20260928';
export async function exportPlan(plan,time,format='png'){
 const popup=format==='pdf'?window.open('','_blank'):null;
 if(format==='pdf'&&!popup)throw Error('Allow the print window, then try again.');
 try{
 const img=new Image();img.src=new URL('./desert-storm-map-readable.png',import.meta.url).href;await img.decode();
 const pages=['opening'].map(phase=>{
 const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=2050;const c=canvas.getContext('2d');
 c.fillStyle='#092531';c.fillRect(0,0,3200,2050);
 const text=(s,x,y,size=30,color='#eef9fc',max=3000)=>{c.font=`${size>=36?'bold ':''}${size}px sans-serif`;c.fillStyle=color;c.fillText(s,x,y,max)};
 const icon=(d,x,y,size)=>{c.save();c.translate(x,y);c.scale(size/24,size/24);c.strokeStyle='#78e2d6';c.lineWidth=2;c.lineCap='round';c.lineJoin='round';c.beginPath();if(d==='anchor'){c.arc(12,5,2,0,Math.PI*2);c.moveTo(12,7);c.lineTo(12,21);c.moveTo(7,11);c.lineTo(17,11);c.moveTo(4,14);c.lineTo(4,17);c.bezierCurveTo(7,17,7,21,12,21);c.bezierCurveTo(17,21,17,17,20,17);c.lineTo(20,14);}else{c.moveTo(4,8);c.lineTo(18,8);c.lineTo(14,4);c.moveTo(18,8);c.lineTo(14,12);c.moveTo(20,16);c.lineTo(6,16);c.lineTo(10,12);c.moveTo(6,16);c.lineTo(10,20);}c.stroke();c.restore();};
 text('NOVA SAPPHIRE · DESERT STORM',45,52,28,'#78e2d6');text(plan.title+' · DS Group '+plan.team,45,115,44);
 text('Server time: '+time+' · '+'Building assignments',45,162,28);
 text('Prepared by '+(plan.createdByName||'Leadership')+' · '+(plan.createdAt?.slice(0,10)||'Date not recorded'),45,205,24);
 const mx=820,my=450,mw=1500,mh=mw*img.height/img.width;c.drawImage(img,mx,my,mw,mh);
 text('SUBSTITUTES',35,290,32,'#78e2d6',330);let sy=345;
 for(const m of plan.members.filter(m=>m.role==='reserve')){text(m.name,35,sy,26,'#eef9fc',330);sy+=55;}
 if(!plan.members.some(m=>m.role==='reserve'))text('None listed',35,345,24);
 text('UNASSIGNED',35,970,29,'#78e2d6',330);let uy=1015;
 for(const m of plan.members.filter(m=>m.role==='participant'&&!Object.values(plan.assignments[phase]||{}).flat().includes(m.key))){text(m.name,35,uy,23,'#eef9fc',330);uy+=37;}
 for(const [side,rail] of mapRails.entries())for(const [row,id] of rail.entries()){
 const [,label,x,y]=availableBuildings(phase).find(b=>b[0]===id),names=(plan.assignments[phase]?.[id]||[]).map(k=>{const m=plan.members.find(m=>m.key===k);return {duty:m?.duty||'support',name:m?.name||'Player'};});
 const px=side?2700:390,py=285+row*250,w=365,h=190,bx=mx+mw*x/100,by=my+mh*y/100;
 c.strokeStyle='#78a49b';c.lineWidth=2;c.beginPath();c.moveTo(side?px:px+w,py+h/2);c.lineTo(bx,by);c.stroke();c.fillStyle='#78e2d6';c.beginPath();c.arc(bx,by,6,0,Math.PI*2);c.fill();
 c.fillStyle='#143b45';c.fillRect(px,py,w,h);text(label,px+14,py+35,27,'#78e2d6',w-28);
 if(!names.length)text('Awaiting assignment',px+14,py+79,24,'#b6cdd3',w-28);
 names.forEach((n,i)=>{icon(n.duty,px+14,py+55+i*32,25);text(n.name,px+48,py+77+i*32,25,'#ffffff',w-62);});
 }
 const words=roleCopy[plan.legendLanguage]||roleCopy.en;icon('anchor',45,1912,42);text(words[2],105,1944,30,'#78e2d6');icon('support',45,1970,42);text(words[3],105,2002,30,'#eef9fc');return canvas;
 });
 if(format==='pdf'){
 popup.document.title=plan.title;popup.document.body.innerHTML=`<style>@page{size:A3 landscape;margin:8mm}body{margin:0;font:16px system-ui}img{width:100%;display:block;break-after:page}p{white-space:pre-wrap}</style>${pages.map(p=>`<img src="${p.toDataURL('image/png')}" alt="Battle assignments and substitutes">`).join('')}<h2>Instructions</h2><p>${esc(plan.notes||'No additional instructions.')}</p>`;
 await Promise.all([...popup.document.images].map(i=>i.decode()));popup.print();
 }else{
 const out=document.createElement('canvas');out.width=3200;const notes=(plan.notes||'').match(/.{1,130}(?:\s|$)|.{1,130}/g)||[];out.height=pages.length*2050+(notes.length?100+notes.length*40:0);const c=out.getContext('2d');pages.forEach((p,i)=>c.drawImage(p,0,i*2050));if(notes.length){c.fillStyle='#092531';c.fillRect(0,2050,3200,out.height-2050);c.fillStyle='#eef9fc';c.font='30px sans-serif';c.fillText('INSTRUCTIONS',45,2100);notes.forEach((line,i)=>c.fillText(line,45,2150+i*40,3100));}
 const blob=await new Promise(r=>out.toBlob(r,'image/png')),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(plan.title||'Desert Storm').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)+'-DS-'+plan.team+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 }catch(e){popup?.close();throw e;}
}
