import test from 'node:test';import assert from 'node:assert/strict';
import {validateSeatImage,prepareSeatImage,maxImageInputBytes} from '../seat-confirmations-image.js';
import {createManualAuthHandler} from '../deployment/manual-accounts/auth-handler.js';
const token='a'.repeat(64);
const request=(body,{upload=false,auth=true}={})=>new Request('https://test.invalid/'+(upload?'?upload=seat-image':''),{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json',...(auth?{'X-Nova-Session':'Bearer '+token}:{})},body:JSON.stringify(body)});
test('image endpoint forwards only authorized image fields; ordinary request size stays restricted',async()=>{
 const image='data:image/jpeg;base64,'+'A'.repeat(5000);let called=0;
 const handler=createManualAuthHandler({rpc:async(action,args)=>{called++;assert.equal(action,'seat-image-save');assert.deepEqual(args,{token,playerId:'p1',image,imageVersion:'old',uploadId:'new'});return {ok:true};}});
 const body={action:'seat-image-save',playerId:'p1',image,imageVersion:'old',uploadId:'new',staffEmail:'forged',seat:'Gold',status:'Approved'};
 assert.equal((await handler(request(body,{upload:true}))).status,200);assert.equal(called,1);
 assert.equal((await handler(request(body))).status,413);
 assert.equal((await handler(request({...body,image:'A'.repeat(1205000)},{upload:true}))).status,413);
 assert.equal((await handler(request({action:'login',image},{upload:true}))).status,400);assert.equal(called,1);
 for(const action of ['seat-image-get','seat-image-save'])assert.equal((await handler(request({action},{auth:false}))).status,401);
});
test('image reads do not trust supplied identity or expose error payloads',async()=>{
 const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'lead@test.invalid'}),rpc:async(action,args)=>{assert.equal(action,'seat-image-get');assert.deepEqual(args,{staffEmail:'lead@test.invalid',playerId:'p1'});return {error:'image_changed',private:'secret'};}});
 const req=new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json','X-Portal-Token':'google'},body:JSON.stringify({action:'seat-image-get',playerId:'p1',staffEmail:'forged'})});
 const result=await handler(req);assert.equal(result.status,409);assert.deepEqual(await result.json(),{error:'Another helper changed this screenshot. Refresh before replacing it.',code:'image_changed'});
});
test('image preprocessing rejects unsupported/oversize files and re-encodes bounded JPEGs',async()=>{
 for(const type of ['image/svg+xml','text/html','image/gif',''])assert.throws(()=>validateSeatImage({type,size:1}),{code:'invalid_image'});
 assert.throws(()=>validateSeatImage({type:'image/png',size:maxImageInputBytes+1}),{code:'image_too_large'});
 let closed=0,drawn=0;const originalDocument=globalThis.document,originalBitmap=globalThis.createImageBitmap;
 const canvas={getContext:()=>({fillRect(){},drawImage(){drawn++;}}),toDataURL:(type,quality)=>{assert.equal(type,'image/jpeg');return quality>.8?'A'.repeat(1200001):'data:image/jpeg;base64,/9j/2Q==';}};
 globalThis.document={createElement:()=>canvas};globalThis.createImageBitmap=async()=>({width:1080,height:2404,close(){closed++;}});
 try{assert.equal(await prepareSeatImage({type:'image/png',size:100}),'data:image/jpeg;base64,/9j/2Q==');assert.equal(canvas.height,1920);assert.ok(canvas.width<1920);assert.equal(drawn,1);assert.equal(closed,1);}finally{globalThis.document=originalDocument;globalThis.createImageBitmap=originalBitmap;}
});
