const defaultTiming='We start immediately after reset tomorrow. Please aim to finish within 24 hours or less, if possible.';
export function helperAccessMessage({username,displayName,password='',timing=defaultTiming}){
 const credentials=`Username: ${username}\nPassword: ${password||'[INSERT PASSWORD]'}`;
 const fence='`'.repeat(Math.max(3,...(credentials.match(/`+/g)||[]).map(run=>run.length+1)));
 return `You now have access to Applicant Messenger and Seat confirmations for 1616!

LOGIN
https://portal.join1616.com/seat-confirmations.html
${fence}
${credentials}
${fence}
Your display name: ${displayName}
Open the link, enter your credentials, and click “Sign in with password”. You can change the page language at the top.

PURPOSE
Help us confirm applicants’ transfer seat colours so we can determine how many players and complete groups will fit. Contacting a player does NOT mean their application is approved.

SEAT CONFIRMATIONS
1. Select Unconfirmed and find a player.
2. Click Copy message beside their name and send it in-game. It requests their seat colour and a screenshot, and includes their application-status code.
3. Make sure they understand their actual transfer seat colour: Gold, Purple, Blue, or White/Gray. Check their screenshot—do not guess.
4. Click Upload image beside that player to attach the screenshot.
5. Select the verified colour (White for White/Gray), choose your display name, and click Save.

Green with a checkmark = confirmed. Yellow = unconfirmed. Uploading an image alone does not confirm the seat. You can correct the colour and save again, or use View image → Replace image.

Accuracy is VERY important. Wrong colours could prevent entire groups, including powerful players, from fitting their server’s seat allocation. If unsure, contact the listed Transfer lead or ask me.

APPLICANT MESSENGER
Find the correct player and click Copy message. Send it in-game so they can check their status and assigned alliance, if accepted, at join1616.com using their individual code. Always match the name before sending.
${timing.trim()?'\n'+timing.trim()+'\n':''}
Thank you! Contact me for questions or login help.`;
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
