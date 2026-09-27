const DAY=86400000;
export function eventDates(rule){
 const start=new Date(rule.start+'Z'),limit=100;
 if(!Number.isFinite(+start))throw Error('Choose a first event date and time.');
 if(rule.frequency==='once')return [start.toISOString()];
 const interval=Number(rule.interval),count=Number(rule.count),until=rule.end==='date'?new Date(rule.until+'T23:59:59Z'):null;
 if(!Number.isInteger(interval)||interval<1||interval>99)throw Error('Repeat interval must be 1–99.');
 if(until&&(!Number.isFinite(+until)||until<start))throw Error('Choose an end date on or after the first event.');
 if(!until&&(!Number.isInteger(count)||count<2||count>limit))throw Error('Choose 2–100 occurrences.');
 const out=[],weekdays=(rule.weekdays||[]).map(Number),startDay=Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()),monday=startDay-((start.getUTCDay()+6)%7)*DAY;
 if(rule.frequency==='weekly'&&!weekdays.length)throw Error('Select at least one weekday.');
 if(!['daily','weekly','monthly','yearly'].includes(rule.frequency))throw Error('Choose a repeat pattern.');
 const max=until?Math.ceil((until-start)/DAY)+1:36600;
 if(max>36600)throw Error('Choose an end date within 100 years.');
 for(let i=0;i<=max;i++){
 const d=new Date(+start+i*DAY);if(until&&d>until)break;
 const monthDiff=(d.getUTCFullYear()-start.getUTCFullYear())*12+d.getUTCMonth()-start.getUTCMonth();
 const dayMatch=()=>rule.monthMode==='weekday'?d.getUTCDay()===Number(rule.monthWeekday)&&(Number(rule.ordinal)===-1?new Date(+d+7*DAY).getUTCMonth()!==d.getUTCMonth():Math.ceil(d.getUTCDate()/7)===Number(rule.ordinal)):d.getUTCDate()===start.getUTCDate();
 const match=rule.frequency==='daily'?i%interval===0:rule.frequency==='weekly'?Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-monday)/(7*DAY))%interval===0&&weekdays.includes(d.getUTCDay()):rule.frequency==='monthly'?monthDiff%interval===0&&dayMatch():(d.getUTCFullYear()-start.getUTCFullYear())%interval===0&&d.getUTCMonth()===start.getUTCMonth()&&dayMatch();
 if(match){out.push(d.toISOString());if(out.length>limit)throw Error('This creates more than 100 events. Choose an earlier end date.');if(!until&&out.length===count)break;}
 }
 if(!out.length)throw Error('No dates match this pattern. Adjust the start or end date.');
 if(!until&&out.length<count)throw Error('This pattern spans too many years. Reduce the occurrence count.');
 return out;
}
