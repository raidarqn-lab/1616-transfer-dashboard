import test from 'node:test';import assert from 'node:assert/strict';
import {helperAccessMessage} from '../messenger-access-message.js';
test('helper invitation includes account-specific login, seat-only workflow',()=>{
 const message=helperAccessMessage({username:'fixture_helper',displayName:'MapleSky',password:'example-password'});
 for(const part of ['Username: fixture_helper','Password: example-password','Your display name: MapleSky','https://portal.join1616.com/seat-confirmations.html','Sign in with password','does NOT mean','Upload image','choose your display name','VERY important','Transfer lead','Your support workspace is Seat confirmations.','STRICTLY CONFIDENTIAL','Do not discuss applicants with anyone else','confirm/deny that they applied or their application status—even if asked','Send a player’s message only to that player','24 hours'])assert.ok(message.includes(part),part);
 assert.ok(message.length<2000,'Typical invitation fits one Discord message');
});
test('existing accounts get an explicit password placeholder and editable timing',()=>{
 const account={username:'existing',displayName:'River'};
 assert.match(helperAccessMessage(account),/Password: \[INSERT PASSWORD\]/);
 const message=helperAccessMessage({...account,timing:'Start Sunday at reset.'});assert.ok(message.includes('Start Sunday at reset.'));assert.ok(!message.includes('tomorrow'));
 assert.ok(!helperAccessMessage({...account,timing:''}).includes('tomorrow'));
});
test('credential code fences preserve password punctuation including backticks',()=>{
 const password='one```two**three';const message=helperAccessMessage({username:'fixture',displayName:'Fictional helper',password});assert.ok(message.includes('````\nUsername: fixture\nPassword: '+password+'\n````'));
});
