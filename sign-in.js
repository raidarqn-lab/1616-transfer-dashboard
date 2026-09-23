import { firebaseConfig } from './firebase-config.js';
import { createPortalTransport } from './supabase-transport.mjs';
const button = document.getElementById('sign-in');
const signOutButton = document.getElementById('sign-out');
const status = document.getElementById('status');
const identity = document.getElementById('identity');
const signedIn = document.getElementById('signed-in');
function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle('status-error', error);
}
function explain(error) {
  const messages = {
    'auth/unauthorized-domain': 'This address is not authorized yet. In Firebase → Authentication → Settings → Authorized domains, add ' + location.hostname + '.',
    'auth/popup-blocked': 'Your browser blocked Google sign-in. Allow pop-ups for this page and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled. You can try again.',
    'auth/cancelled-popup-request': 'Another sign-in window is already open.',
    'auth/operation-not-allowed': 'Enable the Google provider in Firebase Authentication first.',
    'auth/network-request-failed': 'Google could not be reached. Check your connection and try again.',
    'auth/web-storage-unsupported': 'This browser is blocking sign-in storage. Try this page in regular Chrome.'
  };
  return messages[error?.code] || 'Sign-in could not finish' + (error?.code ? ' (' + error.code + ')' : '') + '. Please try again in regular Chrome.';
}
if (!['http:', 'https:'].includes(location.protocol)) {
  report('Open this page from a website or the local preview server, rather than double-clicking the file.', true);
} else {
  try {
    const [{ initializeApp }, sdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    const auth = sdk.getAuth(initializeApp(firebaseConfig));
    sdk.useDeviceLanguage(auth);
    // Keep setup sign-in scoped to this browser tab; no credentials are copied into app storage.
    await sdk.setPersistence(auth, sdk.browserSessionPersistence);
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    sdk.onAuthStateChanged(auth, user => {
      signedIn.hidden = !user;
      document.getElementById('open-portal').hidden = !user;
      button.hidden = !!user;
      button.disabled = false;
      identity.textContent = user ? (user.displayName || 'Signed in') + ' · ' + (user.email || '') : '';
      report(user ? 'Signed in. Open the portal to load your saved workspace.' : 'Ready to sign in.');
    }, error => report(explain(error), true));
    button.onclick = async () => {
      button.disabled = true;
      report('Complete sign-in in the Google window.');
      try { await sdk.signInWithPopup(auth, provider); }
      catch (error) { report(explain(error), true); }
      finally { button.disabled = false; }
    };
    document.getElementById('check-sheet').onclick = async event => {
      event.target.disabled = true;
      report('Checking your workspace access…');
      try {
        const api = createPortalTransport({getIdToken:async()=>{if(!auth.currentUser)throw Error('Please sign in first.');return auth.currentUser.getIdToken();}});
        const data = await api('connection.check');
        report('Workspace connected · ' + data.role + '. No records were changed.');
      } catch(error) { report(error.message, true); }
      finally { event.target.disabled = false; }
    };
    signOutButton.onclick = async () => {
      signOutButton.disabled = true;
      try { await sdk.signOut(auth); }
      catch (error) { report(explain(error), true); }
      finally { signOutButton.disabled = false; }
    };
  } catch (error) {
    report('Google sign-in could not load. Check your connection and try opening this page in regular Chrome.', true);
  }
}
