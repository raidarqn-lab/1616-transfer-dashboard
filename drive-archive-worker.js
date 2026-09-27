export const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const safeName=s=>String(s||'unknown').replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);
export function createArchiveWorker({store,connection,drive,source,clock=()=>Date.now()}){
 return async()=>{
  const job=await store('claim',{});if(!job)return {idle:true};
  const key={bounty:job.bounty,lease:job.lease};
  const checkpoint=()=>store('checkpoint',{...key,folders:job.folders,files:job.files,manifestId:job.manifest_id});
  const started=clock();
  try{
   const {rootId,access}=await connection();if(!rootId||!access)throw Error('Drive connection needs attention; screenshots retained.');
   const root=await drive.meta(access,rootId);
   if(root.trashed||root.shared||!root.ownedByMe||root.mimeType!=='application/vnd.google-apps.folder'||!root.capabilities?.canAddChildren)throw Error('Private Drive evidence folder is unavailable; screenshots retained.');
   const ensureFolder=async(keyName,name,parent)=>{
    if(!job.folders[keyName]){job.folders[keyName]=await drive.id(access);await checkpoint();}
    const id=job.folders[keyName];let meta=await drive.meta(access,id,true);
    if(!meta){await drive.folder(access,{id,name:safeName(name),parents:[parent],mimeType:'application/vnd.google-apps.folder',appProperties:{novaBatch:job.batch_id,novaRole:keyName}});meta=await drive.meta(access,id);}
    if(meta.trashed||meta.shared||meta.mimeType!=='application/vnd.google-apps.folder'||!meta.parents?.includes(parent))throw Error('Archive folder validation failed; screenshots retained.');
    return id;
   };
   const bountyFolder=await ensureFolder('bounty',job.bounty,rootId);
   const contributorFolder=await ensureFolder('contributor',job.contributor+' — '+job.playerKey,bountyFolder);
   const submission=await ensureFolder('submission','Submission '+job.batch_id,contributorFolder);
   for(const file of job.sourceFiles){
    const seq=String(file.sequence);if(job.files[seq]?.verified)continue;
    if(clock()-started>38000){await store('release',key);return {pending:true,bounty:job.bounty};}
    const bytes=await source(file);if(bytes.length!==file.bytes)throw Error('Source screenshot size mismatch; screenshots retained.');
    const hash=await sha256(bytes);if(file.sha256&&hash!==file.sha256)throw Error('Source screenshot checksum mismatch; screenshots retained.');
    let saved=job.files[seq];
    if(!saved){saved={id:await drive.id(access),name:String(file.sequence).padStart(3,'0')+'-'+safeName(file.name),bytes:file.bytes,sha256:hash};job.files[seq]=saved;await checkpoint();}
    if(saved.sha256!==hash||saved.bytes!==file.bytes)throw Error('Source changed during archiving; screenshots retained.');
    let meta=await drive.meta(access,saved.id,true);
    if(!meta){await drive.upload(access,{id:saved.id,name:saved.name,parents:[submission],appProperties:{novaBatch:job.batch_id,novaSequence:seq,novaSha256:hash}},bytes,file.name?.toLowerCase().endsWith('.jpg')?'image/jpeg':'image/png');meta=await drive.meta(access,saved.id);}
    if(meta.trashed||meta.shared||meta.name!==saved.name||!meta.parents?.includes(submission)||Number(meta.size)!==file.bytes)throw Error('Drive screenshot metadata mismatch; screenshots retained.');
    const copied=await drive.bytes(access,saved.id);
    if(copied.length!==file.bytes||await sha256(copied)!==hash)throw Error('Drive readback checksum mismatch; screenshots retained.');
    saved.verified=true;await checkpoint();
   }
   // The manifest is written only after every screenshot has passed private readback.
   const manifest={version:1,bounty:job.bounty,batchId:job.batch_id,contributor:job.contributor,playerKey:job.playerKey,gameDate:job.gameDate,reviewedAt:job.reviewedAt,files:job.sourceFiles.map(f=>({sequence:f.sequence,originalName:f.name,...job.files[String(f.sequence)]}))};
   const raw=new TextEncoder().encode(JSON.stringify(manifest,null,2));
   if(!job.manifest_id){job.manifest_id=await drive.id(access);await checkpoint();}
   let meta=await drive.meta(access,job.manifest_id,true);
   if(!meta){await drive.upload(access,{id:job.manifest_id,name:'manifest.json',parents:[submission],appProperties:{novaBatch:job.batch_id}},raw,'application/json');meta=await drive.meta(access,job.manifest_id);}
   if(meta.shared||meta.trashed||!meta.parents?.includes(submission)||await sha256(await drive.bytes(access,job.manifest_id))!==await sha256(raw))throw Error('Archive manifest verification failed; screenshots retained.');
   await store('complete',key);return {verified:true,bounty:job.bounty,files:job.sourceFiles.length};
  }catch(error){await store('release',{...key,error:/screenshots retained/.test(error.message)?error.message:'Drive archive interrupted. Retrying automatically; screenshots retained.'});return {retry:true,bounty:job.bounty};}
 };
}
