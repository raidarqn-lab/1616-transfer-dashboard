import {availableBuildings,esc} from './storm-core.js?v=plan-files-20260928';
export async function exportPlan(plan,time,format='png'){
 const popup=format==='pdf'?window.open('','_blank'):null;
 if(format==='pdf'&&!popup)throw Error('Allow the print window, then try again.');
 try{
 const img=new Image();img.src=new URL('./desert-storm-map-readable.png',import.meta.url).href;await img.decode();
 const pages=['opening'].map(phase=>{
 const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=2050;const c=canvas.getContext('2d');
 c.fillStyle='#092531';c.fillRect(0,0,3200,1900);
 const text=(s,x,y,size=30,color='#eef9fc',max=3000)=>{c.font=`${size>=36?'bold ':''}${size}px sans-serif`;c.fillStyle=color;c.fillText(s,x,y,max)};
 text('NOVA SAPPHIRE · DESERT STORM',45,52,28,'#78e2d6');text(plan.title+' · DS Group '+plan.team,45,115,44);
 text('Server time: '+time+' · '+'Building assignments',45,162,28);
 text('Prepared by '+(plan.createdByName||'Leadership')+' · '+(plan.createdAt?.slice(0,10)||'Date not recorded'),45,205,24);
 const mx=450,my=250,mw=2700,mh=mw*img.height/img.width;c.drawImage(img,mx,my,mw,mh);
 text('SUBSTITUTES',35,290,34,'#78e2d6',390);let sy=345;
 for(const m of plan.members.filter(m=>m.role==='reserve')){text(m.name,35,sy,29,'#eef9fc',390);sy+=55;}
 if(!plan.members.some(m=>m.role==='reserve'))text('None listed',35,345,26);
 text('UNASSIGNED',35,970,32,'#78e2d6',390);let uy=1015;
 for(const m of plan.members.filter(m=>m.role==='participant'&&!Object.values(plan.assignments[phase]||{}).flat().includes(m.key))){text(m.name,35,uy,24,'#eef9fc',390);uy+=37;}
 for(const [id,label,x,y] of availableBuildings(phase)){
 const names=(plan.assignments[phase]?.[id]||[]).map(k=>(()=>{const m=plan.members.find(m=>m.key===k);return (m?.duty==='anchor'?'A · ':'S · ')+(m?.name||'Player')})());
 const px=mx+mw*x/100,py=my+mh*(y+4)/100,w=280,h=names.length?40+names.length*32:40;
 c.fillStyle='#092531f2';c.fillRect(px-w/2,py,w,h);c.strokeStyle='#78e2d6';c.strokeRect(px-w/2,py,w,h);
 text(names.length?label:'Unassigned',px-w/2+10,py+27,23,'#78e2d6',w-20);
 names.forEach((n,i)=>text(n,px-w/2+10,py+59+i*32,25,'#ffffff',w-20));
 }
 text('ANCHOR (A): stays to secure the assigned building.',45,1950,30,'#78e2d6');text('SUPPORT (S): may move once the building is secure.',45,2000,30,'#eef9fc');return canvas;
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
