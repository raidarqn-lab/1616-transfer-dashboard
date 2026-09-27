const number=n=>Number(n).toLocaleString();
export const reportLabels={daily_vs:'Daily Alliance Duel / VS',weekly_vs:'Weekly Alliance Duel / VS',donations:'Weekly donations'};
export function reportCanvas(spec,sections=spec.sections){
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=430+sections.length*660;const c=canvas.getContext('2d');
 const ink='#183440',muted='#647881',teal='#237c71',gold='#b58a42',line='#dce5e8';
 const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const text=(s,x,y,size=22,color=ink,weight=400,max=1456)=>{c.fillStyle=color;c.font=`${weight>=600?'bold':'normal'} ${size}px system-ui, sans-serif`;c.fillText(String(s),x,y,max);};
 rect(0,0,1600,canvas.height,'#f3f6f7');rect(0,0,1600,218,'#102d3a');rect(0,0,1600,8,'#51b4a1');
 text('NOVA  /  ALLIANCE INTELLIGENCE',72,58,21,'#8fd6c9',650);text('Player participation report',72,122,42,'#ffffff',650);
 text(`${spec.start}  —  ${spec.end}`,72,171,23,'#c9dce3');text('LEADERSHIP REPORT',1180,57,18,'#c9dce3',600,350);
 rect(72,246,1456,106,'#ffffff');rect(72,246,5,106,teal);text(spec.name,98,290,32,ink,650,760);text(`ALLIANCE  ${spec.alliance}     SERVER  ${spec.server}     RANK  ${spec.rank}`,98,326,19,muted,500);
 text(`${sections.length} REPORT SECTION${sections.length===1?'':'S'}`,1170,288,17,muted,600,320);text('Actual recorded performance',1170,323,18,muted,400,320);
 sections.forEach((section,index)=>{
  const top=380+index*660,points=section.points,recorded=points.filter(p=>p.score!=null),target=points[0]?.target||0,max=Math.max(target,1,...recorded.map(p=>p.score))*1.16;
  rect(72,top,1456,626,'#ffffff');text(String(index+1).padStart(2,'0'),98,top+43,19,teal,700);text(reportLabels[section.type],146,top+44,28,ink,650);
  const stats=[['TOTAL RECORDED',recorded.length?number(recorded.reduce((a,p)=>a+p.score,0)):'Not recorded'],['HIGHEST PERIOD',recorded.length?number(Math.max(...recorded.map(p=>p.score))):'Not recorded'],['DATA COVERAGE',`${recorded.length} / ${points.length} periods`]];
  stats.forEach(([label,value],i)=>{const x=98+i*466;rect(x,top+68,442,91,'#f3f6f7');text(label,x+20,top+95,15,muted,600);text(value,x+20,top+133,27,ink,600);});
  const left=208,right=1484,base=top+456,height=244,step=(right-left)/Math.max(points.length,1);
  c.lineWidth=1;for(let tick=0;tick<=4;tick++){const value=max*tick/4,y=base-height*tick/4;c.strokeStyle=line;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();text(value>=1000000?(value/1000000).toFixed(1)+'M':number(Math.round(value)),98,y+6,17,muted);}
  points.forEach((p,i)=>{const x=left+i*step,barWidth=Math.min(170,step*.68),center=x+step/2;if(p.score!=null){const h=p.score/max*height;rect(center-barWidth/2,base-Math.max(2,h),barWidth,Math.max(2,h),p.complete?teal:gold);if(points.length<=10){c.textAlign='center';text(number(p.score),center,base-h-13,17,ink,500);c.textAlign='left';}}else{text('—',center-7,base-10,17,muted);}if(i%Math.max(1,Math.ceil(points.length/10))===0||i===points.length-1){c.textAlign='center';text(p.date.slice(5),center,base+29,17,muted);c.textAlign='left';}});
  c.strokeStyle='#7c8990';c.lineWidth=2;c.setLineDash([7,7]);c.beginPath();c.moveTo(left,base-target/max*height);c.lineTo(right,base-target/max*height);c.stroke();c.setLineDash([]);
  rect(98,top+519,12,12,teal);text('Recorded',120,top+531,17,muted);rect(257,top+519,12,12,gold);text('Partial week',279,top+531,17,muted);text(`— —  Minimum reference: ${number(target)}`,1040,top+531,17,muted,400,420);
  text(section.type==='donations'?'Weekly donations are grouped by the weeks containing the selected dates.':'VS uses selected game dates. Weekly totals with fewer than six days are marked partial.',98,top+575,18,muted);
  text('Missing records are not counted as zero. Minimums are reference targets, not spending limits.',98,top+602,17,muted);
 });
 const foot=canvas.height-24;text('NOVA  /  LEADERSHIP INTELLIGENCE',72,foot,16,muted,600);text(`Generated ${spec.generated}`,610,foot,16,muted);
 const pageIndex=spec.sections.indexOf(sections[0]);text(sections.length===1?`SECTION ${pageIndex+1} OF ${spec.sections.length}`:'COMBINED REPORT',1290,foot,16,muted,600,250);
 return canvas;
}
export function pdfFromCanvases(canvases){
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;const append=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;chunks.push(bytes);length+=bytes.length;};const obj=(id,body)=>{offsets[id]=length;append(`${id} 0 obj\n`);append(body);append('\nendobj\n');};append('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${canvases.length} /Kids [${canvases.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 canvases.forEach((canvas,i)=>{const page=3+i*3,img=page+1,content=page+2;obj(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]),x=>x.charCodeAt(0));offsets[img]=length;append(`${img} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);append(bytes);append('\nendstream\nendobj\n');const scale=Math.min(802/canvas.width,555/canvas.height),w=canvas.width*scale,h=canvas.height*scale,stream=`q ${w} 0 0 ${h} 20 ${595-20-h} cm /Im0 Do Q`;obj(content,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);});const xref=length;append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))append(`${String(offset).padStart(10,'0')} 00000 n \n`);append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}
export async function downloadReport(spec,format){let blob;if(format==='pdf')blob=pdfFromCanvases(spec.sections.map(section=>reportCanvas(spec,[section])));else blob=await new Promise(resolve=>reportCanvas(spec).toBlob(resolve,format==='jpg'?'image/jpeg':'image/png',0.95));if(!blob)throw Error('Unable to create export.');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${spec.name.replace(/[^\p{L}\p{N}_-]+/gu,'-')}-participation-${spec.start}-${spec.end}.${format}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
