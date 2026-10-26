const statuses=['Pending','Under Review','Approved','Waitlisted','Declined','Withdrawn','Transferred'];
const alliances=['NvSP','NvEM','WaE','DRoN','ECKO'];
const seats=['Gold','Purple','Blue','White'];
const reasons=['no_seat','low_kills','low_profession','low_hq','low_participation','low_power','group_full','conflict','not_specified','other','requirements','placement','information'];
export const rejectionFallback={no_seat:'No suitable seat available',requirements:'Transfer requirements not met',placement:'Alliance/group placement unavailable',information:'Application information incomplete or unverified'};
export function anticipatedApplicantSeat(power){
 if(power==null||typeof power==='boolean'||String(power).trim()==='')return null;
 const value=Number(power);if(!Number.isFinite(value)||value<0)return null;
 return value>=230?'Gold':value>=180?'Purple':value>=130?'Blue':'White';
}
export function applicantDetails(player,destination){
 const status=player.general||player.prospect||player.transferDirection==='outbound'?'Unconfirmed':statuses.includes(player.status)?player.status:'Unconfirmed';
 const assigned=!['Declined','Withdrawn','Unconfirmed'].includes(status);
 const applicationLanguage=String(Object.hasOwn(player.rawApplication||{},'language')?player.rawApplication.language||'':player.applicationLanguage??player.language??'').trim().slice(0,100);
 return {applicationLanguage,server:String(player.server||''),currentAlliance:String(player.alliance||'').trim().slice(0,100),anticipatedSeat:anticipatedApplicantSeat(player.power),transferGroup:String(player.group||''),status,
  approval:['Approved','Transferred'].includes(status)?'approved':status==='Declined'?'declined':status==='Withdrawn'?'withdrawn':'pending',
  destinationAlliance:assigned&&alliances.includes(destination)?destination:null,
  confirmedSeat:assigned&&seats.includes(player.confirmedSeat)?player.confirmedSeat:null,
  rejectionReasonCode:status==='Declined'&&reasons.includes(player.rejectionReasonCode)?player.rejectionReasonCode:null,
  rejectionReasonText:status==='Declined'&&reasons.includes(player.rejectionReasonCode)?String(player.rejectionReasonText||'').slice(0,1000):null};
}
// Keep the browser's stored directory restricted to the same explicit contract.
export function directoryRow(p){
 const detail=applicantDetails({applicationLanguage:p.applicationLanguage,server:p.server,group:p.transferGroup,status:p.status,confirmedSeat:p.confirmedSeat,rejectionReasonCode:p.rejectionReasonCode,rejectionReasonText:p.rejectionReasonText},p.destinationAlliance);
 return {id:String(p.id),name:String(p.name||''),message:typeof p.message==='string'?p.message:null,...detail,currentAlliance:String(p.currentAlliance||'').trim().slice(0,100),anticipatedSeat:seats.includes(p.anticipatedSeat)?p.anticipatedSeat:null};
}
