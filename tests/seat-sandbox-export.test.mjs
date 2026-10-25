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
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 assert.equal((html.match(/<td class="name">/g)||[]).length,4);
});
