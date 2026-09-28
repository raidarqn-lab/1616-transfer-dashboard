export function monday(date){const d=new Date(date.slice(0,10)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
export function previousWeek(date,n=1){const d=new Date(monday(date)+'T00:00Z');d.setUTCDate(d.getUTCDate()-7*n);return d.toISOString().slice(0,10)}
export function activeBench(entries,key,date){return entries.find(e=>e.key===key&&e.start<=date&&(!e.end||e.end>=date)&&(!e.liftedOn||e.liftedOn>date))}
// Published schedules prove enrollment, not attendance. Both groups are required
// before treating an absent enrollment as a rotation gap.
export function participation(key,date,plans,benches=[]){
 const prior=previousWeek(date),past=plans.filter(p=>p.date< monday(date)&&(p.status==='published'||p.publishedAt));
 const enrollments=past.filter(p=>p.members.some(m=>m.key===key)).sort((a,b)=>b.date.localeCompare(a.date));
 const attended=enrollments.find(p=>p.members.some(m=>m.key===key&&m.attendance==='attended'));
 const scheduled=enrollments.find(p=>p.members.some(m=>m.key===key&&m.role==='participant'));
 const weekState=w=>{const rows=past.filter(p=>monday(p.date)===w),own=rows.flatMap(p=>p.members.filter(m=>m.key===key&&m.role==='participant'));if(own.some(m=>!['absent','excused'].includes(m.attendance)))return 'scheduled';if(own.length)return 'missed';return new Set(rows.map(p=>p.team)).size===2?'missed':'unknown'};
 const recent=weekState(prior),older=weekState(previousWeek(date,2)),bench=activeBench(benches,key,date);
 return {bench,lastScheduled:scheduled?.date||'',lastAttended:attended?.date||'',recent,older,priority:!bench&&recent==='missed',label:bench?'Penalty bench':recent==='missed'?(older==='missed'?'Missed 2 recorded weeks':'Due a turn'):recent==='unknown'?'History incomplete':'Scheduled last week'};
}
