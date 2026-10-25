const defaultTiming='We start immediately after reset tomorrow. Please aim to finish within 24 hours or less, if possible.';
export function helperAccessMessage({username,displayName,password='',timing=defaultTiming}){
 const credentials=`Username: ${username}\nPassword: ${password||'[INSERT PASSWORD]'}`;
 const fence='`'.repeat(Math.max(3,...(credentials.match(/`+/g)||[]).map(run=>run.length+1)));
 return `Welcome to 1616 transfer support!

LOGIN
https://portal.join1616.com/seat-confirmations.html
${fence}
${credentials}
${fence}
Your display name: ${displayName}
Enter your credentials and click “Sign in with password”. Choose your language at the top.

You should have TWO TABS: Seat confirmations and Applicant Messenger.

SEAT CONFIRMATIONS
Check seat colours to see which players and groups fit. Contacting someone does NOT mean approval.
1. Use Available to find a player, then click Claim BEFORE contacting them. Your name shows who is handling it so we avoid duplicate outreach.
2. Click Copy message and send it privately in-game, then click Message sent (Awaiting reply).
3. Verify Gold, Purple, Blue or White/Gray from their screenshot—never guess. Click Upload image.
4. Select the colour (White for White/Gray), choose your display name under Confirmed by, and Save.

Filters: Mine = your people; Available = unclaimed; Awaiting reply = waiting. Cannot continue? Click Release. Already contacted someone? Claim them and mark Message sent. Ask me to reassign if needed.
Green + checkmark = confirmed; yellow = unconfirmed. Uploading alone does not confirm. Correct errors and save again; View image → Replace image replaces screenshots.
Accuracy is VERY important: wrong colours can stop whole groups fitting. Ask me or the Transfer lead if unsure.

APPLICANT MESSENGER
Find the player, click Copy message and send it privately to them. It includes their code and join1616.com to check application status and their assigned alliance, if accepted.

STRICTLY CONFIDENTIAL
Keep all applicant information, screenshots, codes and logins confidential. Do not discuss applicants with anyone else or confirm/deny that they applied or their application status—even if asked. Send a player’s message only to that player. Refer others’ questions to me.
${timing.trim()?'\n'+timing.trim()+'\n':''}
Contact me for help.`;
}
const node=(tag,text)=>{const result=document.createElement(tag);if(text)result.textContent=text;return result;};
export function mountHelperAccessMessage(container,{clipboard=navigator.clipboard}={}){
 let account=null,epoch=0;
 const section=node('section');section.className='helper-access-message';section.hidden=true;
 const launch=node('button','Copy access message…');launch.type='button';
 const body=node('div');body.hidden=true;
 const heading=node('h3','Share access and instructions');
 const help=node('p','Review the details and timing, then copy and send this message privately. Existing passwords cannot be retrieved. A password entered here is used only in this message; it does not change the login.');
 const passwordLabel=node('label','Password to include (optional)'),password=node('input');password.type='password';password.autocomplete='off';password.maxLength=128;password.placeholder='Leave blank for [INSERT PASSWORD]';passwordLabel.append(password);
 const timingLabel=node('label','Work start / deadline'),timing=node('input');timing.type='text';timing.maxLength=300;timing.value=defaultTiming;timingLabel.append(timing);
 const previewLabel=node('label','Message preview'),preview=node('textarea');preview.readOnly=true;preview.rows=12;preview.setAttribute('aria-label','Access message preview');preview.spellcheck=false;previewLabel.append(preview);
 const copy=node('button','Copy message'),hide=node('button','Close message');copy.type=hide.type='button';copy.className='primary';
 const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=node('div');actions.className='hub-actions';actions.append(copy,hide);body.append(heading,help,passwordLabel,timingLabel,previewLabel,actions,status);section.append(launch,body);container.append(section);
 function update(){preview.value=account?helperAccessMessage({...account,password:password.value,timing:timing.value}):'';status.textContent='';}
 function clear(){epoch++;account=null;password.value='';preview.value='';status.textContent='';body.hidden=true;section.hidden=true;timing.value=defaultTiming;}
 function setAccount(value,newPassword='',{show=false}={}){clear();if(value?.accountType!=='applicant_messenger'||value.state!=='active'||!value.username)return;account={username:value.username,displayName:value.playerName||value.username};password.value=newPassword;section.hidden=false;body.hidden=!show;if(show)update();}
 launch.onclick=()=>{body.hidden=false;update();copy.focus();};
 hide.onclick=()=>{epoch++;password.value='';preview.value='';status.textContent='';body.hidden=true;launch.focus();};
 password.oninput=timing.oninput=update;
 copy.onclick=async()=>{if(!account)return;update();const current=epoch;try{await clipboard.writeText(preview.value);if(current===epoch)status.textContent='Access message copied. Send it privately to this helper.';}catch{if(current!==epoch)return;status.textContent='Select and copy the message below.';preview.focus();preview.select();}};
 return {setAccount,clear};
}
