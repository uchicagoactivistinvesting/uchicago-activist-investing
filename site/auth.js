/* Member accounts, backed by Supabase Auth (project "uchicago-activist-investing").
   The publishable key is safe to ship in the page; it only allows what Auth permits.
   Sign-ups are gated in the database: a Before User Created hook rejects any sign-up
   whose access code is not in private.access_codes. Add a code in the Supabase SQL editor:
     insert into private.access_codes (code) values ('YOUR-CODE');                     */
(function () {
  var client = window.supabase.createClient(
    'https://ngkhztjoxznpfwtbgkvr.supabase.co',
    'sb_publishable_3QWEnLM1mJmA6MfuUvHljA_0toxXzTW'
  );

  function say(form, text, ok) {
    var m = form.querySelector('.auth__msg');
    m.textContent = text;
    m.classList.toggle('is-ok', !!ok);
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function busy(form, on) { form.querySelector('.auth__btn').disabled = on; }

  // Members page: show who is signed in, or send visitors to the login page
  var member = document.getElementById('member');
  if (member) {
    client.auth.getSession().then(function (r) {
      if (!r.data.session) { window.location.replace('/login'); return; }
      member.querySelector('.auth__who').textContent = r.data.session.user.email;
      member.hidden = false;
    });
    document.getElementById('signout').addEventListener('click', function () {
      client.auth.signOut().then(function () { window.location.href = '/login'; });
    });
  }

  // Login page: already signed in goes straight to /members
  var signin = document.getElementById('signin');
  if (signin) {
    client.auth.getSession().then(function (r) {
      if (r.data.session) window.location.replace('/members');
    });

    signin.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = signin.email.value.trim(), pw = signin.password.value;
      if (!emailOk(email)) return say(signin, 'Enter a valid email address.');
      if (!pw) return say(signin, 'Enter your password.');
      busy(signin, true);
      say(signin, '');
      client.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
        busy(signin, false);
        if (r.error) {
          var msg = /confirm/i.test(r.error.message) ? 'Confirm your email address before signing in.' : 'Incorrect email or password.';
          return say(signin, msg);
        }
        window.location.href = '/members';
      });
    });
  }

  var signup = document.getElementById('signup');
  if (signup) {
    signup.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = signup.email.value.trim(), pw = signup.password.value, code = signup.code.value.trim();
      if (!emailOk(email)) return say(signup, 'Enter a valid email address.');
      if (pw.length < 8) return say(signup, 'Password must be at least 8 characters.');
      if (!code) return say(signup, 'Enter your access code.');
      busy(signup, true);
      say(signup, '');
      client.auth.signUp({ email: email, password: pw, options: { data: { access_code: code } } }).then(function (r) {
        busy(signup, false);
        if (r.error) {
          var m = r.error.message || '';
          if (/access code/i.test(m)) return say(signup, 'That access code is not valid.');
          if (/registered|exists/i.test(m)) return say(signup, 'An account with that email already exists.');
          if (/password/i.test(m)) return say(signup, m);
          return say(signup, 'Something went wrong. Please try again.');
        }
        if (r.data.session) { window.location.href = '/members'; return; }
        say(signup, 'Account created. Check your email to confirm it, then sign in.', true);
      });
    });
  }
})();
