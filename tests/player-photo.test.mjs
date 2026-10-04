import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../nova-bounty-review.js',import.meta.url),'utf8');
const photoCode=source.slice(source.indexOf('function setPlayerPhoto('),source.indexOf('\nfunction drawPlayerHR('));
for(const value of ['https://lastwar-cdn.akamaized.net/avatar/test.png','data:image/png;base64,YQ==']){
 test('profile photo does not depend on screenshot state: '+value.split(':')[0],()=>{
  const container={replaceChildren(image){this.image=image;}};
  const context={URL,el:()=>({}),container,value};
  runInNewContext(photoCode+';setPlayerPhoto(container,value,"52 B L U E");',context);
  // Loading a photo must not reference review-only batch/page variables.
 });
}
test('missing photo keeps a safe fallback',()=>{
 const container={};runInNewContext(photoCode+';setPlayerPhoto(container,null,"Player");',{URL,el:()=>({}),container});
 assert.equal(container.title,'No profile photo saved');
});
