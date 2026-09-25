export function createBountyHandler({memberIdentity,staffIdentity,store,put,sign}) {
 const origins=['https://raidarqn-lab.github.io','https://portal.join1616.com'];
 return async req=>{
  const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(!origins.includes(origin))return reply(403,{error:'Access denied.'});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-nova-session,x-portal-token','Access-Control-Allow-Methods':'POST,OPTIONS'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'POST required.'});
  try{
   const staff=req.headers.get('x-portal-token');
   const actor=staff?{staffEmail:(await staffIdentity(staff)).email}:{accountId:(await memberIdentity(req.headers.get('x-nova-session'))).id};
   // Authorization happens before any request body or screenshot is read.
   await store('access',actor);
   const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing request.'});
   let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>11*1024*1024){await reader.cancel();return reply(413,{error:'Screenshot too large.'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
   const type=req.headers.get('content-type')||'';
   if(type.startsWith('multipart/form-data')){
    if(staff)return reply(403,{error:'Use member access to submit.'});
    const form=await new Request(req.url,{method:'POST',headers:{'content-type':type},body:bytes}).formData();
    const batchId=form.get('batchId'),sequence=Number(form.get('sequence')),file=form.get('file');
    if(!file||typeof file==='string'||file.size<1||file.size>10485760)return reply(400,{error:'Select a PNG or JPEG under 10 MB.'});
    const raw=new Uint8Array(await file.arrayBuffer());const png=[137,80,78,71,13,10,26,10].every((n,i)=>raw[i]===n),jpeg=raw[0]===255&&raw[1]===216&&raw[2]===255;
    if(!png&&!jpeg)return reply(400,{error:'Select a PNG or JPEG screenshot.'});
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const meta={...actor,batchId,sequence,sha256,bytes:file.size,mime:png?'image/png':'image/jpeg'};
    const slot=await store('slot',meta);await put(slot.path,raw,meta.mime);await store('uploaded',meta);
    return reply(200,{ok:true,sequence});
   }
   if(!type.startsWith('application/json')||size>65536)return reply(400,{error:'Invalid request.'});
   const body=JSON.parse(new TextDecoder().decode(bytes));
   if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid request.'});
   const allowed=staff?['review-list','evidence','profile','player-search','review-draft','save-review']:['list','reserve','commit','evidence'];
   if(!allowed.includes(body.action))return reply(403,{error:'Access denied.'});
   const {accountId:ignoredAccount,staffEmail:ignoredStaff,...input}=body;
   const data=await store(body.action,{...input,...actor});
   if(body.action==='evidence')return reply(200,{url:await sign(data.path)});
   return reply(200,data);
  }catch(e){return reply(e?.message==='unauthorized'?401:400,{error:e?.message==='unauthorized'?'Sign in again.':'Unable to complete this request. Check your account access and selected screenshots, then retry.'});}
 };
}
