import test from 'node:test';
import assert from 'node:assert/strict';
import {leadershipRosterHtml} from '../seat-sandbox-export.mjs';
test('leadership roster groups and sorts every player, retaining missing stats and escaping content',()=>{
 const html=leadershipRosterHtml([{name:'Zed',group:'Alpha',power:150.12,kills:1234567,hqLevel:35,profession:100},{name:'Amy',group:'alpha',status:'Declined'},{name:'<script>x</script>',group:'Solo'},{name:'Bea',group:'Beta'}]);
 assert.match(html,/4 players · 3 groups/);
 assert.ok(html.indexOf('>Amy</td>')<html.indexOf('>Zed</td>'));
 assert.ok(html.indexOf('>Zed</td>')<html.indexOf('>Bea</td>'));
 assert.match(html,/No transfer group/);assert.match(html,/Declined/);
 assert.match(html,/150.12M/);assert.match(html,/1.23M/);assert.match(html,/>—<\/td>/);
 assert.ok(!html.includes('<script>x</script>'));assert.match(html,/&lt;script&gt;/);
 assert.equal((html.match(/<td class="name">/g)||[]).length,4);
});
test('interactive export embeds controls and only roster fields, escaping attribute payloads',()=>{
 const html=leadershipRosterHtml([{name:'" onmouseover="bad',group:'</script><script>bad()</script>',power:140,kills:123,status:'Pending',notes:'PRIVATE_NOTE',contact:'PRIVATE_CONTACT',history:[{text:'PRIVATE_HISTORY'}]}]);
 assert.match(html,/id="roster-controls"/);
 assert.match(html,/data-power="140"/);
 assert.match(html,/data-name="&quot; onmouseover=&quot;bad"/);
 assert.ok(!html.includes('</script><script>bad()'));
 for(const privateField of ['PRIVATE_NOTE','PRIVATE_CONTACT','PRIVATE_HISTORY'])assert.ok(!html.includes(privateField));
 assert.ok(!html.includes('<script src='));
});
