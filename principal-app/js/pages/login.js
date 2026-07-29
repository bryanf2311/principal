/* ============================================================
   #/login — email/password + Google sign-in.
   The auth state listener in app.js handles the role-based
   redirect once sign-in succeeds.
   ============================================================ */

import {
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth } from '../firebase-config.js';
import { getUserProfile } from '../api.js';
import { bindForm, toast, friendlyError, esc } from '../ui.js';
import { homeFor } from '../app.js';

export async function render(mount, ctx) {
  mount.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="mark">🎓</div>
          <h1>Principal</h1>
          <p>Your learning dashboard</p>
        </div>

        <div data-error></div>

        <form id="login-form" novalidate>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="username" required placeholder="you@example.com">
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
          </div>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </form>

        <div class="auth-sep">or</div>
        <button class="btn btn-block" id="google-btn">
          <span aria-hidden="true" style="font-weight:800;color:#4285f4">G</span> Sign in with Google
        </button>

        <p class="auth-hint">
          <button class="btn-link" id="reset-btn" type="button">Forgot your password?</button><br>
          Accounts are created by your administrator.
        </p>
      </div>
    </div>`;

  const form = mount.querySelector('#login-form');
  const errorBox = mount.querySelector('[data-error]');

  const afterSignIn = async (user) => {
    let profile = null;
    try { profile = await getUserProfile(user.uid); } catch { /* rules may block until provisioned */ }
    toast(`Welcome back${profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!`, 'ok');
    ctx.navigate(homeFor(profile?.role));
  };

  bindForm(form, async (data) => {
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await afterSignIn(cred.user);
  }, { errorBox });

  mount.querySelector('#google-btn').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    errorBox.textContent = '';
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await afterSignIn(cred.user);
    } catch (err) {
      console.error(err);
      errorBox.className = 'form-error';
      errorBox.textContent = friendlyError(err);
    } finally {
      btn.disabled = false;
    }
  });

  mount.querySelector('#reset-btn').addEventListener('click', async () => {
    const email = String(form.email.value || '').trim();
    if (!email) {
      errorBox.className = 'form-error';
      errorBox.textContent = 'Enter your email address first, then press “Forgot your password?”.';
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      errorBox.className = 'form-ok';
      errorBox.innerHTML = `Password reset email sent to <strong>${esc(email)}</strong>.`;
    } catch (err) {
      errorBox.className = 'form-error';
      errorBox.textContent = friendlyError(err);
    }
  });

  form.email.focus();
}
