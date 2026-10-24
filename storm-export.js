import {esc} from './storm-core.js?v=compact3-20261023';

// Stable building numbers, with badges in clear terrain below the map's labels.
// Coordinates refer to the original 1610 × 978 map, not the scaled canvas.
export const exportBuildings=[
 ['silo',820,595],['info',580,310],['arsenal',820,340],
 ['refinery-1',415,455],['refinery-2',1170,730],
 ['hospital-1',385,730],['hospital-2',1260,450],['hospital-3',540,915],
 ['hospital-4',1060,315],['factory',805,915],['science',1060,915]
];
export function wrapText(context,value,width){
 const lines=[];
 for(const paragraph of String(value||'').split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(line&&context.measureText(line+' '+word).width<=width){line+=' '+word;continue;}
   if(line){lines.push(line);line='';}
   for(const char of word){if(line&&context.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
  }
  lines.push(line);
 }
 return lines;
}
export function renderPlanCanvas(plan,time,img){
 const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
 const width=2400,pad=48,contentWidth=width-pad*2,playerSize=42,lineHeight=52;
 const members=(plan.members||[]).filter(m=>m.role==='participant'),lookup=new Map(members.map(m=>[m.key,m]));
 const assignments=plan.assignments?.opening||{},assigned=new Set(exportBuildings.flatMap(([id])=>assignments[id]||[]));
 const font=(size,bold=false)=>{c.font=`${bold?'700':'400'} ${size}px system-ui, sans-serif`;};
 font(playerSize,true);
 const bands=[exportBuildings.slice(0,6),exportBuildings.slice(6)].map((group,band)=>{
  const cellWidth=contentWidth/group.length;
  const columns=group.map(([id],i)=>({number:band?i+7:i+1,people:(assignments[id]||[]).map(k=>lookup.get(k)).filter(Boolean).map(m=>wrapText(c,m.name,cellWidth-32))}));
  const rowHeights=Array.from({length:Math.max(3,...columns.map(col=>col.people.length))},(_,row)=>Math.max(100,...columns.map(col=>(col.people[row]?.length||0)*lineHeight+28)));
  return {columns,cellWidth,rowHeights,height:70+rowHeights.reduce((a,b)=>a+b,0)};
 });
 font(64,true);const titleLines=wrapText(c,plan.title||'Desert Storm',1500),headerHeight=155+(titleLines.length-1)*76;
 font(playerSize,true);const unassigned=members.filter(m=>!assigned.has(m.key));
 const unassignedLines=unassigned.length?wrapText(c,'Awaiting assignment: '+unassigned.map(m=>m.name).join(' · '),contentWidth):[];
 font(30);const notes=plan.notes?.trim()?wrapText(c,plan.notes.trim(),contentWidth):[];
 const footerHeight=(unassignedLines.length?24+unassignedLines.length*lineHeight:0)+(notes.length?24+notes.length*39:0);
 const tableHeight=bands.reduce((n,b)=>n+b.height,0)+18;
 const availableHeight=width-pad-headerHeight-24-tableHeight-footerHeight;
 if(availableHeight<400)throw Error('This plan has too much text for a readable square image. Shorten the title or notes and try again.');
 const mapWidth=Math.min(contentWidth,availableHeight*img.width/img.height),mapHeight=mapWidth*img.height/img.width,mapX=(width-mapWidth)/2,mapY=headerHeight;
 canvas.width=width;canvas.height=width;
 c.fillStyle='#092531';c.fillRect(0,0,width,width);
 const text=(value,x,y,size=playerSize,color='#f0fafc',bold=true)=>{font(size,bold);c.fillStyle=color;c.fillText(value,x,y);};
 text(`NOVA SAPPHIRE · DESERT STORM · TEAM ${plan.team||'B'}`,pad,52,30,'#8aeee0');
 titleLines.forEach((line,i)=>text(line,pad,121+i*76,64));
 c.textAlign='right';text('Server time: '+time,width-pad,headerHeight-32,32,'#bfd9df',false);c.textAlign='left';
 c.drawImage(img,mapX,mapY,mapWidth,mapHeight);
 for(const [i,[,bx,by]] of exportBuildings.entries()){
  const x=mapX+mapWidth*bx/1610,y=mapY+mapHeight*by/978,r=22*mapWidth/1610;
  c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle='#8aeee0';c.fill();c.textAlign='center';text(String(i+1),x,y+r*.39,r*1.2,'#092531');
 }
 let y=mapY+mapHeight+24;
 for(const band of bands){
  c.fillStyle='#20444f';c.fillRect(pad,y,contentWidth,70);
  band.columns.forEach((col,i)=>text(String(col.number),pad+(i+.5)*band.cellWidth,y+49,42,'#8aeee0'));
  let rowY=y+70;
  band.rowHeights.forEach((height,row)=>{
   c.fillStyle=row%2?'#0e303b':'#153944';c.fillRect(pad,rowY,contentWidth,height);
   band.columns.forEach((col,i)=>{const lines=col.people[row]||[];const baseline=rowY+(height-lines.length*lineHeight)/2+42;
    lines.forEach((line,j)=>text(line,pad+(i+.5)*band.cellWidth,baseline+j*lineHeight));
   });rowY+=height;
  });
  c.strokeStyle='#365661';c.lineWidth=2;
  for(let i=1;i<band.columns.length;i++){c.beginPath();c.moveTo(pad+i*band.cellWidth,y);c.lineTo(pad+i*band.cellWidth,rowY);c.stroke();}
  y=rowY+18;
 }
 c.textAlign='left';y-=18;
 if(unassignedLines.length){y+=24;for(const line of unassignedLines){text(line,pad,y+42,playerSize,'#ffdf91');y+=lineHeight;}}
 if(notes.length){y+=24;for(const line of notes){text(line,pad,y+30,30,'#bfd9df',false);y+=39;}}
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
   popup.document.title=plan.title;popup.document.body.innerHTML=`<style>@page{size:210mm 210mm;margin:5mm}body{margin:0}img{display:block;width:100%;height:auto}</style><img src="${canvas.toDataURL('image/png')}" alt="${esc(plan.title)} building assignments">`;
   await Promise.all([...popup.document.images].map(i=>i.decode()));popup.print();
  }else{
   const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('Could not create the image.');
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(plan.title||'Desert Storm').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)+'-DS-'+plan.team+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
 }catch(e){popup?.close();throw e;}
}
