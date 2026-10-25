import {formatCopy} from './applicant-messenger-i18n.js?v=2';
const replies={
 en:'Hi {name}, we also wanted to let you know that you can check the status of your application at any time at join1616.com using the confirmation code you received when applying.\n\nYour confirmation code: {code}\n\nThe page shows your application status and, if you have been accepted, your assigned alliance once it has been selected.',
 de:'Hallo {name}, wir möchten dich auch darauf hinweisen, dass du den Status deiner Bewerbung jederzeit auf join1616.com mit dem Bestätigungscode prüfen kannst, den du bei der Bewerbung erhalten hast.\n\nDein Bestätigungscode: {code}\n\nDie Seite zeigt deinen Bewerbungsstatus und, falls du angenommen wurdest, deine zugewiesene Allianz, sobald diese ausgewählt wurde.',
 fr:'Bonjour {name}, nous voulions aussi vous informer que vous pouvez consulter le statut de votre candidature à tout moment sur join1616.com avec le code de confirmation reçu lors de votre candidature.\n\nVotre code de confirmation : {code}\n\nLa page indique le statut de votre candidature et, si vous avez été accepté, votre alliance d’affectation une fois celle-ci choisie.',
 es:'Hola {name}, también queríamos informarte de que puedes consultar el estado de tu solicitud en cualquier momento en join1616.com con el código de confirmación que recibiste al solicitar el traslado.\n\nTu código de confirmación: {code}\n\nLa página muestra el estado de tu solicitud y, si has sido aceptado, la alianza que se te haya asignado una vez seleccionada.',
 pt:'Olá {name}, também queremos informar que pode consultar o estado da sua candidatura a qualquer momento em join1616.com com o código de confirmação recebido quando se candidatou.\n\nO seu código de confirmação: {code}\n\nA página mostra o estado da candidatura e, caso tenha sido aceite, a aliança que lhe foi atribuída assim que for selecionada.',
 ko:'{name}님, 신청 시 받은 확인 코드를 사용하면 join1616.com에서 언제든지 신청 상태를 확인할 수 있다는 점도 안내드립니다.\n\n확인 코드: {code}\n\n해당 페이지에서 신청 상태를 확인할 수 있으며, 승인된 경우 배정 연맹이 결정되면 그 연맹도 표시됩니다.',
 vi:'Chào {name}, chúng tôi cũng muốn thông báo rằng bạn có thể kiểm tra trạng thái đơn đăng ký bất cứ lúc nào tại join1616.com bằng mã xác nhận đã nhận khi đăng ký.\n\nMã xác nhận của bạn: {code}\n\nTrang này hiển thị trạng thái đơn và, nếu bạn được chấp nhận, liên minh được phân công sau khi việc phân công hoàn tất.',
 ar:'مرحبًا {name}، نود أيضًا إبلاغك بأنه يمكنك التحقق من حالة طلبك في أي وقت عبر join1616.com باستخدام رمز التأكيد الذي تلقيته عند تقديم الطلب.\n\nرمز التأكيد الخاص بك: {code}\n\nتعرض الصفحة حالة طلبك، وإذا تم قبولك، التحالف المخصص لك بمجرد تحديده.'
};
export function seatFollowupMessage(applicant,language='en'){
 const code=applicant?.message?.match(/For your reference, this code is (1616-[A-Z0-9-]{8,60})$/)?.[1];
 if(!code||typeof applicant.name!=='string'||!applicant.name.trim())return null;
 return formatCopy(replies[language]||replies.en,{name:applicant.name,code});
}
export async function freshSeatFollowup(load,id,language){
 const data=await load();if(!Array.isArray(data?.applicants))throw Error('Invalid response');
 const applicant=data.applicants.find(p=>String(p.id)===String(id));const message=seatFollowupMessage(applicant,language);
 if(!message)throw Object.assign(Error('Message unavailable'),{code:'missingMessage'});
 return {name:applicant.name,message};
}
