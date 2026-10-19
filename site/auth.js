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
  window.uaicClient = client; // members.js reuses this client

  function say(form, text, ok) {
    var m = form.querySelector('.auth__msg');
    m.textContent = text;
    m.classList.toggle('is-ok', !!ok);
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  // Accounts must use a personal mailbox: school (.edu) and work addresses go
  // away when a member graduates or changes jobs, so only these providers pass
  var PERSONAL_DOMAINS = [
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.co.uk', 'hotmail.co.uk', 'live.co.uk',
    'yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.co.in',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
    'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'yandex.com',
    'qq.com', '163.com', '126.com', 'naver.com'
  ];
  function personalEmail(v) {
    return emailOk(v) && PERSONAL_DOMAINS.indexOf(v.split('@').pop().toLowerCase()) !== -1;
  }
  window.uaicPersonalEmail = personalEmail; // members.js checks profile emails the same way
  function busy(form, on) { form.querySelector('.auth__btn').disabled = on; }
  // Fade out and go where /members would send them anyway, so a first-timer
  // lands on /onboarding in one move instead of bouncing through the directory
  function enter(user) {
    var where = client.from('profiles').select('id').eq('id', user.id).maybeSingle().then(function (r) {
      return r.data || r.error ? '/members' : '/onboarding';
    });
    if (window.uaicLeave) window.uaicLeave('/members', where);
    else window.location.href = '/members';
  }

  // Login page: already signed in goes straight to /members (which sends first-timers to /onboarding)
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
        if (r.error) {
          busy(signin, false);
          var msg = /confirm/i.test(r.error.message) ? 'Confirm your email address before signing in.' : 'Incorrect email or password.';
          return say(signin, msg);
        }
        enter(r.data.user);
      });
    });
  }

  var signup = document.getElementById('signup');
  if (signup) {
    signup.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = signup.email.value.trim(), pw = signup.password.value, code = signup.code.value.trim().toUpperCase();
      if (!emailOk(email)) return say(signup, 'Enter a valid email address.');
      if (!personalEmail(email)) return say(signup, 'Use a personal email (Gmail, Outlook, iCloud, Yahoo, etc.), not a school or work address.');
      if (pw.length < 8) return say(signup, 'Password must be at least 8 characters.');
      if (!code) return say(signup, 'Enter your access code.');
      busy(signup, true);
      say(signup, '');
      client.auth.signUp({ email: email, password: pw, options: { data: { access_code: code } } }).then(function (r) {
        if (r.error || !r.data.session) busy(signup, false);
        if (r.error) {
          var m = r.error.message || '';
          if (/access code/i.test(m)) return say(signup, 'That access code is not valid.');
          if (/registered|exists/i.test(m)) return say(signup, 'An account with that email already exists.');
          if (/password/i.test(m)) return say(signup, m);
          return say(signup, 'Something went wrong. Please try again.');
        }
        if (r.data.session) return enter(r.data.user);
        say(signup, 'Account created. Check your email to confirm it, then sign in.', true);
      });
    });
  }
})();
