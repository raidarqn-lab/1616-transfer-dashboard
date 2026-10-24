const statuses=['Pending','Under Review','Approved','Waitlisted','Declined','Withdrawn','Transferred'];
const alliances=['NvSP','NvEM','WaE','DRoN','ECKO'];
const seats=['Gold','Purple','Blue','White'];
const reasons=['no_seat','low_kills','low_profession','low_hq','low_participation','low_power','group_full','conflict','not_specified','other','requirements','placement','information'];
export const rejectionFallback={no_seat:'No suitable seat available',requirements:'Transfer requirements not met',placement:'Alliance/group placement unavailable',information:'Application information incomplete or unverified'};
export function applicantDetails(player,destination){
 const status=player.general||player.prospect||player.transferDirection==='outbound'?'Unconfirmed':statuses.includes(player.status)?player.status:'Unconfirmed';
 const assigned=!['Declined','Withdrawn','Unconfirmed'].includes(status);
 return {server:String(player.server||''),transferGroup:String(player.group||''),status,
  approval:['Approved','Transferred'].includes(status)?'approved':status==='Declined'?'declined':status==='Withdrawn'?'withdrawn':'pending',
  destinationAlliance:assigned&&alliances.includes(destination)?destination:null,
  confirmedSeat:assigned&&seats.includes(player.confirmedSeat)?player.confirmedSeat:null,
  rejectionReasonCode:status==='Declined'&&reasons.includes(player.rejectionReasonCode)?player.rejectionReasonCode:null,
  rejectionReasonText:status==='Declined'&&reasons.includes(player.rejectionReasonCode)?String(player.rejectionReasonText||'').slice(0,1000):null};
}
// Keep the browser's stored directory restricted to the same explicit contract.
export function directoryRow(p){
 const detail=applicantDetails({server:p.server,group:p.transferGroup,status:p.status,confirmedSeat:p.confirmedSeat,rejectionReasonCode:p.rejectionReasonCode,rejectionReasonText:p.rejectionReasonText},p.destinationAlliance);
 return {id:String(p.id),name:String(p.name||''),message:typeof p.message==='string'?p.message:null,...detail};
}
