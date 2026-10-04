const messages=new Map([
 ['Only the portal owner can publish Toolkit rosters',[403,'Only the portal owner can publish Toolkit rosters.']],
 ['No dated Toolkit roster published for this alliance',[404,'No dated Toolkit roster has been published for this alliance and server.']],
 ['Different source data already exists for this retrieval date',[409,'A different export is already saved for this retrieval date. Retrieve the roster again in Toolkit.']],
 ['Invalid roster export',[422,'Choose a complete Toolkit roster export. Nothing has been published.']],
 ['Invalid roster dates or count',[422,'The roster date or member count is invalid. Export the alliance again.']],
 ['Invalid roster identities',[422,'This export contains incomplete or repeated player identities. Export the alliance again.']],
 ['Access denied',[403,'Your signed-in account does not have permission for this action. Your draft is unchanged.']],
 ['Review changed; reload',[409,'Another saved version of this review exists. Your edits are still on this page. Open the saved review in another tab to compare before reloading.']],
 ['Bounty reward changed; reload review',[409,'The bounty reward changed while this review was open. Your edits are still on this page. Refresh the saved review before approving.']],
 ['Missing batch',[404,'This submission could not be found. Refresh the review queue.']],
 ['Invalid action',[409,'This submission is no longer available for that action. Refresh its status.']],
 ['Submission is no longer pending',[409,'This submission has already been reviewed. Refresh the queue to see its result.']],
 ['Invalid rows',[422,'The draft must contain no more than 1,000 rows. Split larger screenshot sets.']],
 ['Invalid row',[422,'A row has an invalid score, screenshot page or leaderboard position. Correct the highlighted row before saving.']],
 ['Invalid player',[422,'A selected player no longer exists in All Contacts. Remove that match and choose the correct profile.']],
 ['Duplicate player or rank',[422,'The same player or leaderboard position appears more than once. Exclude the overlapping screenshot rows before approving.']],
 ['Every included row must be confirmed',[422,'Some included rows still need a player, valid score or confirmation. Finish those rows before approving.']],
 ['No reviewed rows',[422,'Read the screenshots and save the review before approving.']],
 ['Missing screenshots',[422,'Some screenshots have not finished uploading. Retry the upload before submitting.']],
 ['Bounty closed',[409,'This bounty is closed for submissions. Select an open bounty or ask leadership to reopen it.']],
 ['Daily limit',[429,'The daily submission limit has been reached. Try again after the limit resets.']],
 ['Request conflict',[409,'This upload was already started with different files. Close the form and start a new submission.']],
]);
const validation=new Set(['A linked player no longer exists','Unfinished rows cannot be confirmed','Review note is too long','The screenshot set is incomplete. Upload the missing screenshots before approval','Every screenshot must be reviewed, including duplicate pages','Resolve the conflicting screenshot readings before approval','Confirm the event alliances and servers before approval','A different score is already published for this player and event. Resolve the published result before approving another submission','No confirmed player rows were found','This bounty type needs a review template before approval','A rejection note is required','Invalid bounty points','Open a pending submission before creating a player.','Enter a player name, alliance and valid server, then confirm creation.']);
export function bountyServiceError(data,status=500){
 const known=messages.get(data?.message),issue=known||(validation.has(data?.message)?[422,data.message]:data?.code==='23505'?[409,'This result already exists. Refresh the review before publishing it again.']:data?.code==='57014'?[503,'The request took too long. Your draft is kept. Wait a moment and retry.']:null);
 const error=Error(issue?.[1]||'The bounty service could not complete this request. Your draft is kept. Retry shortly.');
 error.httpStatus=issue?.[0]||(status===429?429:503);error.memberSafe=true;return error;
}
export function responseError(error){
 if(['unauthorized','Please sign in again.'].includes(error?.message))return {status:401,message:'Your sign-in expired. Sign in again in another tab, then retry here. Your unsaved review is still on this page.'};
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return {status:504,message:'The request timed out. Your draft is kept. Retry when the connection is ready.'};
 return {status:error?.httpStatus||400,message:error?.memberSafe?error.message:null};
}
