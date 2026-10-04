// Dates describe game-calendar days; do not shift them into the viewer’s timezone.
export function membershipLabels(events,week){
 const end=week?new Date(week+'T00:00:00Z'):null;if(end)end.setUTCDate(end.getUTCDate()+6);
 const last=end?.toISOString().slice(0,10);
 return (Array.isArray(events)?events:[]).filter(e=>e&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&(!week||(e.date>=week&&e.date<=last))).sort((a,b)=>a.date.localeCompare(b.date)).map(e=>{
 const action={removed:'Removed',left:'Left',readmitted:'Readmitted'}[e.type];if(!action)return '';
 const date=new Date(e.date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC',...(!week?{year:'numeric'}:{})});
 return `${action} ${e.alliance||'alliance'} · ${date}`;
 }).filter(Boolean);
}
