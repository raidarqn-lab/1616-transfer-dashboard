import {getManualSession} from './manual-session.js?v=leadership-20261025';
import {bountyConnection as config} from './nova-bounty-config.js';
export function supportRequest(staff=null){return async(action,args={})=>{
 const session=getManualSession();const auth=staff?{'X-Portal-Token':await staff.user.getIdToken()}:session?.user?.role==='applicant_messenger'?{'X-Nova-Session':'Bearer '+session.token}:null;
 if(!auth)throw Object.assign(Error('Please sign in again.'),{code:'access_denied'});
 const response=await fetch(config.endpoint.replace('/nova-bounty','/nova-auth')+(action==='seat-image-save'?'?upload=seat-image':''),{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,...auth},body:JSON.stringify({action,...args}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.error)throw Object.assign(Error(data.error||'Unable to complete the request.'),{code:data.code||([401,403].includes(response.status)?'access_denied':'unavailable')});return data;
};}
export function applicantWithdrawal(request){return async playerId=>{
 const data=await request('seat-confirmations-list');const player=data.applicants?.find(p=>String(p.id)===String(playerId));
 if(!player)throw Object.assign(Error('Applicant unavailable. Refresh the list.'),{code:'applicant_unavailable'});
 const result=await request('seat-outreach',{playerId,command:'withdraw',version:String(player.revision)});
 if(result.ok!==true||result.withdrawn!==true||String(result.playerId)!==String(playerId))throw Error('Withdrawal was not saved.');
 return result;
};}
export const canWithdraw=p=>['Pending','Under Review','Approved','Waitlisted'].includes(p.status);
const keys=['withdraw','withdrawConfirm','withdrawnNotice','unable','cannotLocate','foundHint'];
const copy={
 en:['Withdraw application','Withdraw {name}’s application? Only continue if the player requested this. Their status will change to Withdrawn throughout the portal. Their seat confirmation and screenshot will be kept. Contact an administrator to undo a withdrawal.','Application withdrawn.','Unable to find','Cannot locate player','Uncheck to return this player to the main queue.'],
 de:['Bewerbung zurückziehen','Bewerbung von {name} zurückziehen? Nur fortfahren, wenn der Spieler darum gebeten hat. Der Status wird im gesamten Portal auf Zurückgezogen gesetzt. Sitzbestätigung und Screenshot bleiben erhalten. Zum Rückgängigmachen einen Administrator kontaktieren.','Bewerbung zurückgezogen.','Nicht gefunden','Spieler nicht auffindbar','Häkchen entfernen, um den Spieler in die Hauptliste zurückzusetzen.'],
 fr:['Retirer la candidature','Retirer la candidature de {name} ? Continuez uniquement à sa demande. Son statut passera à Retiré dans tout le portail. La confirmation de place et la capture seront conservées. Contactez un administrateur pour annuler ce retrait.','Candidature retirée.','Introuvables','Joueur introuvable','Décochez pour replacer ce joueur dans la liste principale.'],
 es:['Retirar solicitud','¿Retirar la solicitud de {name}? Continúa solo si lo ha pedido el jugador. Su estado cambiará a Retirado en todo el portal. Se conservarán la confirmación de plaza y la captura. Contacta con un administrador para deshacerlo.','Solicitud retirada.','No encontrados','No se puede localizar al jugador','Desmarca para devolver al jugador a la lista principal.'],
 pt:['Retirar candidatura','Retirar a candidatura de {name}? Continue apenas se o jogador o pediu. O estado passará a Retirado em todo o portal. A confirmação da vaga e a imagem serão mantidas. Contacte um administrador para anular a retirada.','Candidatura retirada.','Não encontrados','Não consigo localizar o jogador','Desmarque para devolver o jogador à lista principal.'],
 ko:['신청 철회','{name} 님의 신청을 철회할까요? 플레이어가 요청한 경우에만 계속하세요. 포털 전체에서 상태가 철회됨으로 변경됩니다. 좌석 확인과 스크린샷은 유지됩니다. 철회를 취소하려면 관리자에게 문의하세요.','신청이 철회되었습니다.','찾을 수 없음','플레이어를 찾을 수 없음','체크를 해제하면 기본 목록으로 돌아갑니다.'],
 vi:['Rút đơn','Rút đơn của {name}? Chỉ tiếp tục nếu người chơi đã yêu cầu. Trạng thái sẽ đổi thành Đã rút trên toàn bộ cổng thông tin. Xác nhận ghế và ảnh vẫn được giữ lại. Liên hệ quản trị viên để hoàn tác.','Đã rút đơn.','Không tìm thấy','Không tìm được người chơi','Bỏ chọn để đưa người chơi về danh sách chính.'],
 ar:['سحب الطلب','هل تريد سحب طلب {name}؟ تابع فقط إذا طلب اللاعب ذلك. ستتغير حالته إلى منسحب في البوابة بالكامل. سيُحتفظ بتأكيد المقعد ولقطة الشاشة. تواصل مع المسؤول للتراجع عن السحب.','تم سحب الطلب.','تعذر العثور عليهم','لا يمكن العثور على اللاعب','أزل العلامة لإعادة اللاعب إلى القائمة الرئيسية.']
};
export const supportCopy=language=>Object.fromEntries(keys.map((key,i)=>[key,(copy[language]||copy.en)[i]]));
