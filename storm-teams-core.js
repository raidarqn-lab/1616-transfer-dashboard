export function moveTeamMember(boards,player,team,role,{core=[],benched=()=>false}={}){
 if(!player)return 'Choose an alliance member.';
 const fixed=core.find(m=>m.key===player.key);
 if(fixed&&(!team||fixed.team!==team||role!=='participant'))return player.name+' has a locked Core seat in Group '+fixed.team+'. Update Core first.';
 if(team&&!['A','B'].includes(team))return 'Choose Group A or Group B.';
 if(team&&!['participant','reserve'].includes(role))return 'Choose registered or substitute.';
 if(team&&benched(player.key,team))return player.name+' has a penalty bench on this battle date.';
 if(team&&boards[team].members.filter(m=>m.key!==player.key&&m.role===role).length>=(role==='participant'?20:10))return 'Group '+team+' is full for that role.';
 if(team&&boards[team].members.some(m=>m.key===player.key&&m.role===role))return '';
 const old=Object.values(boards).flatMap(p=>p.members).find(m=>m.key===player.key);
 for(const p of Object.values(boards)){p.members=p.members.filter(m=>m.key!==player.key);for(const phase of Object.values(p.assignments||{}))for(const id of Object.keys(phase))phase[id]=phase[id].filter(k=>k!==player.key);}
 if(team)boards[team].members.push({...old,key:player.key,name:player.name,role,attendance:old?.attendance||'unconfirmed'});
 return '';
}
export const normalizeName=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function screenshotRows(text,players){return text.split(/\r?\n/).map(x=>x.trim()).filter(x=>/\p{L}/u.test(x)&&x.length>1).slice(0,150).map(line=>{const candidates=players.filter(p=>normalizeName(p.name)===normalizeName(line));return {text:line,key:candidates.length===1?candidates[0].key:'',include:false};});}
