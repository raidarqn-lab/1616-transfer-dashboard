// Partial readings are suggestions only: preserve the screenshot and never auto-confirm them.
export function nameFragments(name){
 const text=String(name||'').normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').trim();
 return [...new Set(text.split(/\s+/).filter(part=>[...part].length>=2))]
  .slice(0,4);
}
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export async function findPartialMatches({name,search,inScope}){
 const fragments=nameFragments(name),found=new Map();
 const results=await Promise.allSettled(fragments.map(async fragment=>({fragment,players:await search(fragment)})));
 if(results.length&&results.every(r=>r.status==='rejected'))throw Error('Player search is unavailable. Retry; this does not mean there is no matching player.');
 for(const result of results){
  if(result.status!=='fulfilled')continue;
  for(const player of result.value.players||[]){
   if(!player.key||!inScope(player)||player.eventConflict)continue;
   const names=[player.name,player.matchedName,...(Array.isArray(player.aliases)?player.aliases:[]),...(Array.isArray(player.previousGameNames)?player.previousGameNames:[])];
   const literal=names.some(n=>normalized(typeof n==='object'?n?.name:n).includes(normalized(result.value.fragment)));
   if(!literal&&Number(player.nameSimilarity||0)<.65)continue;
   const existing=found.get(player.key);
   found.set(player.key,{...player,partialMatch:true,matchedFragment:existing?.matchedFragment||result.value.fragment,
    nameSimilarity:Math.min(.79,Number(player.nameSimilarity)||.65),strength:'Partial name — compare profile'});
  }
 }
 return [...found.values()];
}
export function mergePartialMatches(primary,partials){
 const merged=new Map(primary.map(p=>[p.key,p]));
 for(const p of partials)if(!merged.has(p.key)||(!merged.get(p.key).eventConflict&&Number(merged.get(p.key).nameSimilarity)<.65))merged.set(p.key,p);
 return [...merged.values()];
}
