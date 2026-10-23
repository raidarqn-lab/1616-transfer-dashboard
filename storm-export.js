import {buildings,mapRails,esc,roleCopy} from './storm-core.js?v=compact3-20261023';

// Numbered badges share the same building IDs/coordinates as the interactive map.
// Canvas output is deterministic: player names and positions never go through AI.
export function wrapText(context,value,width){
 const lines=[];
 for(const paragraph of String(value||'').split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(line&&context.measureText(line+' '+word).width>width){lines.push(line);line='';}
   for(const char of word){if(line&&context.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
   line+=' ';
  }
  lines.push(line.trimEnd());
 }
 return lines;
}
export function renderPlanCanvas(plan,time,img){
 const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
 const width=2000,pad=20,gap=18,cardWidth=350,mapX=pad+cardWidth+gap,mapWidth=width-2*mapX,mapHeight=mapWidth*img.height/img.width;
 const phase='opening',members=plan.members.filter(m=>m.role==='participant'),lookup=new Map(members.map(m=>[m.key,m]));
 const assigned=new Set(Object.values(plan.assignments?.[phase]||{}).flat());
 const words=roleCopy[plan.legendLanguage]||roleCopy.en;
 const font=(size,bold=false)=>{c.font=`${bold?'700':'400'} ${size}px system-ui, sans-serif`;};
 const cards=mapRails.map(rail=>rail.map(id=>{
  const building=buildings.find(b=>b[0]===id);
  font(22,true);const title=wrapText(c,building[1],cardWidth-62);
  const people=(plan.assignments?.[phase]?.[id]||[]).map(k=>lookup.get(k)).filter(Boolean).map(m=>{font(28,true);return {...m,lines:wrapText(c,m.name,cardWidth-58)};});
  const height=18+title.length*27+12+(people.length?people.reduce((n,m)=>n+m.lines.length*34+6,0):32)+12;
  return {id,title,people,height,building,number:mapRails.flat().indexOf(id)+1};
 }));
 font(36,true);const titleLines=wrapText(c,`${plan.title} · Team ${plan.team}`,width-pad*2);
 const headerHeight=48+titleLines.length*43+42;
 const bodyHeight=Math.max(mapHeight,...cards.map(rail=>rail.reduce((n,item)=>n+item.height,0)+gap*(rail.length-1)));
 const mapY=headerHeight+(bodyHeight-mapHeight)/2;
 font(22);const unassigned=members.filter(m=>!assigned.has(m.key));
 const unassignedLines=unassigned.length?wrapText(c,'Awaiting assignment: '+unassigned.map(m=>m.name).join(' · '),width-pad*2):[];
 font(21);const legendLines=wrapText(c,'A — '+words[2]+'    S — '+words[3],width-pad*2);
 font(24);const notes=plan.notes?.trim()?wrapText(c,plan.notes.trim(),width-pad*2):[];
 canvas.width=width;canvas.height=Math.ceil(headerHeight+bodyHeight+18+(unassignedLines.length?unassignedLines.length*29+12:0)+legendLines.length*28+(notes.length?40+notes.length*31:0)+pad);
 c.fillStyle='#092531';c.fillRect(0,0,width,canvas.height);
 const text=(value,x,y,size=28,color='#f0fafc',bold=false)=>{font(size,bold);c.fillStyle=color;c.fillText(value,x,y);};
 text('NOVA SAPPHIRE · DESERT STORM',pad,32,22,'#78e2d6',true);
 titleLines.forEach((line,i)=>text(line,pad,76+i*43,36,'#fff',true));
 text('Server time: '+time,pad,headerHeight-16,23,'#b7d8df');
 c.drawImage(img,mapX,mapY,mapWidth,mapHeight);
 const badge=(n,x,y)=>{c.beginPath();c.arc(x,y,18,0,Math.PI*2);c.fillStyle='#092531';c.fill();c.strokeStyle='#8aeee0';c.lineWidth=3;c.stroke();c.textAlign='center';text(String(n),x,y+8,23,'#fff',true);c.textAlign='left';};
 for(const [side,rail] of cards.entries()){
  let y=headerHeight;const x=side?width-pad-cardWidth:pad;
  for(const card of rail){
   c.fillStyle='#173f49';c.fillRect(x,y,cardWidth,card.height);
   badge(card.number,x+28,y+31);
   card.title.forEach((line,i)=>text(line,x+55,y+29+i*27,22,'#8aeee0',true));
   let py=y+18+card.title.length*27+12+26;
   if(!card.people.length)text('Unassigned',x+16,py,24,'#b7ced4');
   for(const m of card.people){text(m.duty==='anchor'?'A':'S',x+14,py,20,'#8aeee0',true);m.lines.forEach((line,i)=>text(line,x+43,py+i*34,28,'#fff',true));py+=m.lines.length*34+6;}
   const [, ,bx,by]=card.building;badge(card.number,mapX+mapWidth*bx/100,mapY+mapHeight*by/100+30);
   y+=card.height+gap;
  }
 }
 let y=headerHeight+bodyHeight+34;
 unassignedLines.forEach(line=>{text(line,pad,y,22,'#ffdf91');y+=29;});if(unassignedLines.length)y+=12;
 legendLines.forEach(line=>{text(line,pad,y,21,'#b7d8df');y+=28;});
 if(notes.length){y+=13;text('INSTRUCTIONS',pad,y,20,'#8aeee0',true);y+=31;notes.forEach(line=>{text(line,pad,y,24);y+=31;});}
 return canvas;
}
export async function exportPlan(plan,time,format='png'){
 const popup=format==='pdf'?window.open('','_blank'):null;
 if(format==='pdf'&&!popup)throw Error('Allow the print window, then try again.');
 try{
  const img=new Image();img.src=new URL('./desert-storm-map-readable.png',import.meta.url).href;await img.decode();
  await document.fonts.ready;
  const canvas=renderPlanCanvas(plan,time,img);
  if(format==='pdf'){
   popup.document.title=plan.title;popup.document.body.innerHTML=`<style>@page{size:landscape;margin:5mm}body{margin:0}img{display:block;width:100%;max-height:95vh;object-fit:contain}</style><img src="${canvas.toDataURL('image/png')}" alt="${esc(plan.title)} building assignments">`;
   await Promise.all([...popup.document.images].map(i=>i.decode()));popup.print();
  }else{
   const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('Could not create the image.');
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(plan.title||'Desert Storm').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)+'-DS-'+plan.team+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
 }catch(e){popup?.close();throw e;}
}
