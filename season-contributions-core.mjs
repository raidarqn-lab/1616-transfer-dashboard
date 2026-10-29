export const contributionFields = Object.freeze([
 ['mutualAssistance','Mutual Assistance'],['cleanUp','Clean Up'],['conquest','Conquest'],['defeat','Defeat']
]);
const profileNumbers={heroPower:1e15,kills:1e15,hqLevel:100,gamePower:1e15,professionLevel:1000,vipLevel:100,strongestHeroPower:1e15,homeServer:999999};
export function validateSeasonImport(input){
 if(input?.format!=='nova-sapphire-season-roster-staging'||input.version!==1)throw Error('Choose a prepared Nova roster import.');
 if(input.alliance!=='NvSP'||input.server!==1616||!Number.isInteger(input.season)||input.season<1||input.season>99)throw Error('Select a valid NvSP season and server 1616.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.rosterDate||'')||!Number.isFinite(Date.parse(input.rosterDate+'T00:00:00Z')))throw Error('The roster date is missing or invalid.');
 if(!Array.isArray(input.players)||input.players.length<1||input.players.length>500)throw Error('Choose a roster containing 1–500 players.');
 const seen=new Set();
 const text=(v,label)=>{if(typeof v!=='string'||!v.trim()||v.length>160||/[\u0000-\u001f\u007f]/u.test(v))throw Error(`Invalid ${label}.`);return v;};
 const players=input.players.map(p=>{
  if(typeof p.uid!=='string'||!/^\d{1,30}$/.test(p.uid)||seen.has(p.uid))throw Error('Every player needs a unique text UID.');seen.add(p.uid);
  const name=text(p.name,'player name'),profile=p.profile||{};
  if(profile.uid!==p.uid||profile.name!==name)throw Error('Player name or UID differs from the profile.');
  if(p.membership?.allianceTag!=='NvSP'||p.membership?.server!==1616||p.membership?.current!==true)throw Error('All rows must be confirmed current NvSP members on 1616.');
  const clean={};
  for(const [key,max] of Object.entries(profileNumbers)){
   const v=profile[key];if(v==null)continue;
   if(!Number.isSafeInteger(v)||v<0||v>max)throw Error(`Invalid ${key} for ${name}.`);clean[key]=v;
  }
  if(profile.profession!=null){if(!['Engineer','War leader','War Leader'].includes(profile.profession))throw Error('Unknown profession.');clean.profession=profile.profession;}
  if(profile.allianceRank!=null){if(!/^R[1-5]$/.test(profile.allianceRank))throw Error('Unknown alliance rank.');clean.allianceRank=profile.allianceRank;}
  const c=p.seasonContribution;if(c?.season!==input.season||c.period!=='season_total')throw Error('All scores must be totals for the selected season.');
  const scores={};for(const [key] of contributionFields){const value=c.scores?.[key];if(value==null)continue;if(!Number.isSafeInteger(value)||value<0||value>1e15)throw Error(`Invalid ${key} score for ${name}.`);scores[key]=value;}
  const aliases=p.aliases||[];if(!Array.isArray(aliases)||aliases.length>50)throw Error('Invalid aliases.');
  return {uid:p.uid,name,aliases:[...new Set(aliases.map(v=>text(v,'alias')))],profile:clean,scores,provenance:p.provenance||{},warnings:Array.isArray(p.warnings)?p.warnings.map(v=>String(v).slice(0,1000)):[]};
 });
 return {version:1,alliance:'NvSP',server:1616,season:input.season,rosterDate:input.rosterDate,players};
}
