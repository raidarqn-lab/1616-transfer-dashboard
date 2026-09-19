// Paste the NEW portal deployment URL here after deploying Apps Script.
// This URL is public configuration, not a credential.
export const portalEndpoint = 'https://script.google.com/macros/s/AKfycbys_1p7tlc522nHh4HvD-Z4c40_wNZ9gJkU82FJx0rLFz9yw1HjJWCeYZWqlK9iPquPug/exec';
export async function callPortal(user, action) {
  if (!portalEndpoint) throw Error('Deploy the portal Apps Script first, then add its deployment URL.');
  if (!user) throw Error('Please sign in first.');
  const response = await fetch(portalEndpoint, {
    method: 'POST', redirect: 'follow', credentials: 'omit',
    headers: {'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({action, idToken:await user.getIdToken()})
  });
  const result = await response.json();
  if (!result.ok) throw Error(result.error || 'Connection failed.');
  return result.data;
}
