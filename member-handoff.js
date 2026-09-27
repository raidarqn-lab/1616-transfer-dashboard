export function setupMemberHandoff({call}) {
 const link=document.querySelector('a[aria-label="Open Member Site"]');if(!link)return;
 let pending=false;
 link.addEventListener('click',event=>{
  event.preventDefault();if(pending)return;
  const destination=new URL('https://raidarqn-lab.github.io/nova-sapphire/member-access.html');
  const nonce=crypto.randomUUID();destination.hash=nonce;
  let child,handled=false;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);pending=false;link.removeAttribute('aria-busy');};
  const receive=async event=>{
   if(event.origin!==destination.origin||event.source!==child||event.data?.type!=='nova-member-ready'||event.data?.nonce!==nonce||handled)return;
   handled=true;
   try{const {ticket}=await call({action:'hub-member-handoff'});child.postMessage({type:'nova-member-handoff',nonce,ticket},destination.origin);}
   catch(error){child.postMessage({type:'nova-member-error',nonce,message:error.message},destination.origin);}
   finally{cleanup();}
  };
  window.addEventListener('message',receive);pending=true;link.setAttribute('aria-busy','true');
  const timer=setTimeout(cleanup,30000);
  child=window.open(destination.href,'_blank');
  if(!child){cleanup();alert('Allow this site to open the member site in a new tab, then try again.');}
 });
}
