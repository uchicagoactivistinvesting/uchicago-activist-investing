/* Members area: onboarding wizard (/onboarding), alumni directory (/members) and
   your own card with in-place editing (/profile). Data lives in Supabase tables public.profiles and
   public.experiences (see supabase/onboarding.sql); auth.js creates the client.

   Local preview: on localhost, add ?demo to any of these pages to use a fake
   signed-in member and sample alumni stored in this browser. ?demo=reset starts
   over as a brand-new member, ?demo=off leaves demo mode.                        */
(function () {
  var page = document.body.getAttribute('data-page');
  if (!page) return;

  var LI_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- data ----------
  var demo = false;
  try {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var q = location.search;
    if (local && /[?&]demo=off\b/.test(q)) sessionStorage.removeItem('uaic-demo');
    else if (local && /[?&]demo\b/.test(q)) sessionStorage.setItem('uaic-demo', '1');
    if (local && /[?&]demo=reset\b/.test(q)) localStorage.removeItem('uaic-demo-db');
    demo = local && sessionStorage.getItem('uaic-demo') === '1';
  } catch (e) {}

  var api = demo ? demoApi() : supabaseApi(window.uaicClient);

  function unwrap(r) { if (r.error) throw r.error; return r.data; }

  function supabaseApi(c) {
    var withRoles = '*, experiences(*)';
    return {
      user: function () {
        return c.auth.getSession().then(function (r) {
          var s = r.data.session;
          return s ? { id: s.user.id, email: s.user.email } : null;
        });
      },
      profile: function (id) { return c.from('profiles').select(withRoles).eq('id', id).maybeSingle().then(unwrap); },
      directory: function () { return c.from('profiles').select(withRoles).order('last_name').then(unwrap); },
      save: function (uid, profile, roles, removed) {
        return c.from('profiles').upsert(Object.assign({ id: uid }, profile)).then(unwrap).then(function () {
          var jobs = [];
          var old = roles.filter(function (r) { return r.id; });
          var fresh = roles.filter(function (r) { return !r.id; }).map(function (r) {
            var o = Object.assign({ user_id: uid }, r); delete o.id; return o;
          });
          if (removed.length) jobs.push(c.from('experiences').delete().in('id', removed).then(unwrap));
          if (old.length) jobs.push(c.from('experiences').upsert(old.map(function (r) { return Object.assign({ user_id: uid }, r); })).then(unwrap));
          if (fresh.length) jobs.push(c.from('experiences').insert(fresh).then(unwrap));
          return Promise.all(jobs);
        });
      },
      signOut: function () { return c.auth.signOut(); }
    };
  }

  function demoApi() {
    var me = { id: 'demo-user', email: 'new.member@gmail.com' };
    function seed() { return { profiles: [] }; }
    function load() {
      try { var d = JSON.parse(localStorage.getItem('uaic-demo-db')); if (d) return d; } catch (e) {}
      return seed();
    }
    function store(d) { try { localStorage.setItem('uaic-demo-db', JSON.stringify(d)); } catch (e) {} }
    function find(d, id) { return d.profiles.filter(function (p) { return p.id === id; })[0] || null; }
    return {
      user: function () { return Promise.resolve(me); },
      profile: function (id) { return Promise.resolve(find(load(), id)); },
      directory: function () {
        return Promise.resolve(load().profiles.slice().sort(function (a, b) { return a.last_name.localeCompare(b.last_name); }));
      },
      save: function (uid, profile, roles) {
        var d = load(), p = find(d, uid);
        if (!p) { p = { id: uid }; d.profiles.push(p); }
        Object.assign(p, profile);
        p.experiences = roles.map(function (r) { return Object.assign({}, r, { id: r.id || 'x' + Date.now() + Math.random().toString(36).slice(2, 6) }); });
        store(d);
        return Promise.resolve();
      },
      signOut: function () { try { sessionStorage.removeItem('uaic-demo'); } catch (e) {} return Promise.resolve(); }
    };
  }

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; }); }
  function monthLabel(d) { if (!d) return 'Present'; var p = d.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  // LinkedIn-style length of a role, counting both end months ("1 yr 2 mos");
  // blank for a role that hasn't started yet
  function tenure(start, end) {
    if (!start) return '';
    var a = start.split('-'), now = new Date();
    var b = end ? end.split('-') : [now.getFullYear(), now.getMonth() + 1];
    var n = (+b[0] - +a[0]) * 12 + (+b[1] - +a[1]) + 1;
    if (n < 1) return '';
    var y = Math.floor(n / 12), m = n % 12;
    return [y ? y + (y === 1 ? ' yr' : ' yrs') : '', m ? m + (m === 1 ? ' mo' : ' mos') : ''].filter(Boolean).join(' ');
  }
  function roleMeta(r) { return [r.industry, r.location].filter(Boolean).join(' · '); }
  function byStart(a, b) { return (b.start_month || '').localeCompare(a.start_month || ''); }
  function say(el, text, ok) { el.textContent = text; el.classList.toggle('is-ok', !!ok); }
  function normalizeLinkedIn(v) {
    v = v.trim();
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v.replace(/^http:/i, 'https:');
  }

  // Directory card, also used for the preview at the end of onboarding
  function personCard(p, openable) {
    var roles = (p.experiences || []).slice().sort(byStart);
    var li = p.linkedin_url
      ? '<a class="person__in" href="' + esc(p.linkedin_url) + '" target="_blank" rel="noopener" aria-label="' + esc(p.first_name) + ' on LinkedIn">' + LI_ICON + '</a>'
      : '';
    var list = roles.length
      ? '<ul class="person__roles">' + roles.map(function (r) {
          return '<li>' + firmTile(r.firm, 'person__tile') + '<div><span class="person__role">' + esc(r.position) + '</span>' +
            '<span class="person__meta">' + esc(r.firm) + ' · ' + monthLabel(r.start_month) + ' – ' + monthLabel(r.end_month) + '</span></div></li>';
        }).join('') + '</ul>'
      : '<p class="person__none">No roles added yet.</p>';
    var name = esc(p.first_name) + ' ' + esc(p.last_name);
    if (openable) name = '<button class="person__open" type="button" data-id="' + esc(p.id) + '">' + name + '</button>';
    var tag = [p.board_role, p.advisor_type, p.class_year ? classLabel(p.class_year) : ''].filter(Boolean).map(esc).join(' · ');
    var cls = tag ? '<p class="person__class">' + tag + '</p>' : '';
    return '<article class="person"><div class="person__head"><h2 class="person__name">' +
      name + '</h2>' + li + '</div>' + cls + list + '</article>';
  }

  function initials(s) {
    return String(s || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }

  // Side panel opened from a name in the directory
  function Drawer() {
    var root = $('#drawer'), panel = $('.drawer__panel', root), body = $('#drawer-body'), last = null, timer;
    function close() {
      if (root.hidden) return;
      root.classList.remove('is-open');
      document.documentElement.classList.remove('drawer-lock');
      clearTimeout(timer);
      timer = setTimeout(function () { root.hidden = true; }, 320);
      if (last) last.focus();
    }
    function open(p, from) {
      last = from || null;
      var roles = (p.experiences || []).slice().sort(byStart), now = roles[0];
      var current = roles.filter(function (r) { return !r.end_month; })[0];
      $('.drawer__firm', root).textContent = current ? current.firm : 'UAIC Member';
      $('.drawer__tile--sm', root).outerHTML = current ? firmTile(current.firm, 'drawer__tile drawer__tile--sm') : '<span class="drawer__tile drawer__tile--sm" aria-hidden="true">UA</span>';
      var row = function (label, value) { return '<div class="drawer__row"><span class="drawer__key">' + label + '</span><span class="drawer__val">' + value + '</span></div>'; };
      var pill = function (t) { return '<span class="drawer__pill">' + esc(t) + '</span>'; };
      var industries = roles.map(function (r) { return r.industry; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      body.innerHTML =
        '<div class="drawer__hero">' +
          '<span class="drawer__avatar" aria-hidden="true">' + esc(initials(p.first_name + ' ' + p.last_name)) + '</span>' +
          '<div class="drawer__who"><h2 class="drawer__name" id="drawer-name">' + esc(p.first_name) + ' ' + esc(p.last_name) + '</h2>' +
          '<p class="drawer__title">' + (now ? esc(now.position) + ' at ' + esc(now.firm) : 'UAIC Member') + '</p>' +
          (p.class_year ? '<p class="drawer__class">' + esc(classLabel(p.class_year)) + '</p>' : '') + '</div>' +
          (p.linkedin_url ? '<a class="drawer__in" href="' + esc(p.linkedin_url) + '" target="_blank" rel="noopener" aria-label="' + esc(p.first_name) + ' on LinkedIn">' + LI_ICON + '</a>' : '') +
        '</div>' +
        '<section class="drawer__section"><h3 class="drawer__heading">Profile</h3><div class="drawer__box">' +
          row('Class', p.class_year ? esc(classLabel(p.class_year)) : '<span class="drawer__muted">Not added</span>') +
          (p.board_role ? row('Board', pill(p.board_role)) : '') +
          (p.advisor_type ? row('Advisor', pill(p.advisor_type)) : '') +
          row('Industry', industries.length ? industries.map(pill).join('') : '<span class="drawer__muted">Not added</span>') +
          row('Currently', current ? pill(current.firm) : '<span class="drawer__muted">Not listed</span>') +
          row('Email', '<a class="auth__link" href="mailto:' + esc(p.gmail) + '">' + esc(p.gmail) + '</a>') +
        '</div></section>' +
        '<section class="drawer__section"><h3 class="drawer__heading">Experience</h3>' +
          (roles.length ? '<div class="drawer__box">' + roles.map(function (r) {
            var span = tenure(r.start_month, r.end_month);
            return '<div class="drawer__job">' + firmTile(r.firm, 'drawer__tile') +
              '<div><p class="drawer__jobtitle">' + esc(r.position) + '</p>' +
              '<p class="drawer__jobfirm">' + esc(r.firm) + '</p>' +
              '<p class="drawer__jobmeta">' + [monthLabel(r.start_month) + ' – ' + monthLabel(r.end_month), span, esc(r.location)].filter(Boolean).join(' · ') + '</p>' +
              '</div></div>';
          }).join('') + '</div>' : '<p class="drawer__muted">No roles added yet.</p>') +
        '</section>';
      clearTimeout(timer);
      root.hidden = false;
      panel.scrollTop = 0;
      document.documentElement.classList.add('drawer-lock');
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('is-open'); }); });
      $('.drawer__close', root).focus();
    }
    root.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return { open: open };
  }

  // ---------- profile + roles form pieces ----------
  function fillProfile(form, p, email) {
    form.first_name.value = p ? p.first_name : '';
    form.last_name.value = p ? p.last_name : '';
    form.class_year.value = p && p.class_year ? classLabel(p.class_year) : '';
    form.gmail.value = p ? p.gmail : '';
    if (!p && window.uaicPersonalEmail(email)) form.gmail.placeholder = email;
    form.linkedin_url.value = p ? (p.linkedin_url || '') : '';
  }
  function readProfile(form, msg) {
    var p = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      class_year: parseClass(form.class_year.value),
      gmail: form.gmail.value.trim().toLowerCase(),
      linkedin_url: normalizeLinkedIn(form.linkedin_url.value)
    };
    if (!p.first_name || !p.last_name) return say(msg, 'Enter your first and last name.');
    if (!p.class_year) return say(msg, 'Choose your class year, e.g. Class of 2028.');
    if (!window.uaicPersonalEmail(p.gmail)) return say(msg, 'Use a personal email (Gmail, Outlook, iCloud, Yahoo, etc.), not a school or work address.');
    if (!/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i.test(p.linkedin_url)) return say(msg, 'Enter your LinkedIn profile URL, e.g. linkedin.com/in/your-name.');
    say(msg, '');
    return p;
  }

  // Class year: stored as the graduation year, shown as "Class of 2028"
  var CLASS_FIRST = 2010, CLASS_START = 2027, CLASS_LAST = 2050;
  function classLabel(y) { return 'Class of ' + y; }
  function parseClass(v) {
    var m = String(v || '').match(/(\d{4}|\d{2})\s*$/), y = m && +m[1];
    if (y && y < 100) y += 2000; // "'28" or "28"
    return y >= CLASS_FIRST && y <= CLASS_LAST ? y : null;
  }
  function ClassCombo(input) {
    // Current students first, from the Class of 2027 up; older classes after, newest first
    var years = [], older = [];
    for (var y = CLASS_START; y <= CLASS_LAST; y++) years.push(classLabel(y));
    for (y = CLASS_START - 1; y >= CLASS_FIRST; y--) older.push(classLabel(y));
    Combo(input, [['Class Year', years], ['Earlier Classes', older]], function () { return 'Enter a year from ' + CLASS_FIRST + ' to ' + CLASS_LAST + '.'; });
    input.parentNode.classList.add('combo--select');
    // Tidy "2028" or "'28" into "Class of 2028" once they leave the box
    input.addEventListener('blur', function () { var y = parseClass(input.value); if (y) input.value = classLabel(y); });
  }

  // Board step in onboarding: Yes / No, then which seat for a Yes. Stored as profiles.board_role
  // (null for non-board members).
  var BOARD_ROLES = ['President', 'Head of Research', 'Head of Education', 'Head of Operations'];
  function BoardCombos(form) {
    var role = $('#board-role-field');
    Combo(form.board, [['Board Member', ['Yes', 'No']]]);
    Combo(form.board_role, [['Board Role', BOARD_ROLES]]);
    form.board.parentNode.classList.add('combo--select');
    form.board_role.parentNode.classList.add('combo--select');
    form.board.addEventListener('change', function () {
      role.hidden = form.board.value !== 'Yes';
      if (role.hidden) form.board_role.value = '';
    });
  }
  // The board_role to save (a role or null), or undefined when the step isn't finished
  function readBoard(form, msg) {
    if (form.board.value === 'No') { say(msg, ''); return null; }
    if (form.board.value !== 'Yes') { say(msg, 'Choose whether you are a board member.'); return; }
    if (BOARD_ROLES.indexOf(form.board_role.value) === -1) { say(msg, 'Choose your board role.'); return; }
    say(msg, '');
    return form.board_role.value;
  }

  // Advisor step in onboarding: Yes / No, then which kind for a Yes. Stored as
  // profiles.advisor_type (null for members who aren't advisors).
  var ADVISOR_TYPES = ['Alumni Advisor', 'UChicago Advisor'];
  function AdvisorCombos(form) {
    var type = $('#advisor-type-field');
    Combo(form.advisor, [['Advisor', ['Yes', 'No']]]);
    Combo(form.advisor_type, [['Advisor Type', ADVISOR_TYPES]]);
    form.advisor.parentNode.classList.add('combo--select');
    form.advisor_type.parentNode.classList.add('combo--select');
    form.advisor.addEventListener('change', function () {
      type.hidden = form.advisor.value !== 'Yes';
      if (type.hidden) form.advisor_type.value = '';
    });
  }
  // The advisor_type to save (a type or null), or undefined when the step isn't finished
  function readAdvisor(form, msg) {
    if (form.advisor.value === 'No') { say(msg, ''); return null; }
    if (form.advisor.value !== 'Yes') { say(msg, 'Choose whether you are an advisor.'); return; }
    if (ADVISOR_TYPES.indexOf(form.advisor_type.value) === -1) { say(msg, 'Choose your advisor type.'); return; }
    say(msg, '');
    return form.advisor_type.value;
  }

  // Industry picker: a site-styled dropdown grouped by sector. Typing filters it,
  // and anything not on the list can still be entered as-is.
  var INDUSTRIES = [
    ['Finance', ['Investment Banking', 'Private Equity', 'Hedge Fund', 'Activist Investing', 'Asset Management',
      'Equity Research', 'Sales & Trading', 'Venture Capital', 'Growth Equity', 'Private Credit', 'Restructuring',
      'Leveraged Finance', 'Quantitative Trading', 'Real Estate', 'Wealth Management', 'Commercial Banking',
      'Corporate Development', 'Corporate Finance', 'Insurance', 'Fintech']],
    ['Technology', ['Software Engineering', 'Product Management', 'Data Science', 'Machine Learning / AI',
      'Product Design', 'Cybersecurity', 'Strategy & Operations', 'Business Development', 'Sales Engineering']],
    ['Consulting', ['Management Consulting', 'Economic Consulting', 'Technology Consulting', 'Transaction Advisory',
      'Accounting & Audit']],
    ['Law & Policy', ['Law', 'Government', 'Public Policy', 'Regulatory & Compliance']],
    ['Other', ['Entrepreneurship', 'Marketing', 'Media & Journalism', 'Healthcare', 'Biotech & Pharma',
      'Energy', 'Nonprofit', 'Academia & Research', 'Education']]
  ];
  // Role location picker: major U.S. and international finance cities
  var LOCATIONS = [
    ['United States', ['New York, NY', 'Chicago, IL', 'San Francisco, CA', 'Boston, MA', 'Los Angeles, CA',
      'Washington, DC', 'Houston, TX', 'Dallas, TX', 'Austin, TX', 'Miami, FL', 'Palo Alto, CA', 'Menlo Park, CA',
      'San Jose, CA', 'Seattle, WA', 'Charlotte, NC', 'Atlanta, GA', 'Denver, CO', 'Greenwich, CT', 'Stamford, CT',
      'Philadelphia, PA', 'Minneapolis, MN', 'Detroit, MI', 'St. Louis, MO', 'Nashville, TN', 'Salt Lake City, UT',
      'Phoenix, AZ', 'San Diego, CA', 'Baltimore, MD', 'Pittsburgh, PA', 'Columbus, OH', 'Cleveland, OH',
      'Milwaukee, WI', 'Omaha, NE', 'Kansas City, MO', 'Portland, OR', 'Raleigh, NC', 'Richmond, VA',
      'New Orleans, LA', 'Princeton, NJ', 'Jersey City, NJ', 'West Palm Beach, FL', 'Honolulu, HI']],
    ['Canada & Latin America', ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Mexico City', 'São Paulo',
      'Rio de Janeiro', 'Buenos Aires', 'Santiago', 'Bogotá', 'Lima']],
    ['Europe', ['London', 'Paris', 'Frankfurt', 'Zurich', 'Geneva', 'Amsterdam', 'Dublin', 'Madrid', 'Milan',
      'Munich', 'Berlin', 'Stockholm', 'Copenhagen', 'Oslo', 'Brussels', 'Luxembourg', 'Edinburgh', 'Lisbon',
      'Vienna', 'Warsaw']],
    ['Middle East & Africa', ['Dubai', 'Abu Dhabi', 'Riyadh', 'Doha', 'Tel Aviv', 'Istanbul', 'Johannesburg',
      'Cape Town', 'Lagos', 'Nairobi', 'Cairo']],
    ['Asia-Pacific', ['Hong Kong', 'Singapore', 'Tokyo', 'Shanghai', 'Beijing', 'Shenzhen', 'Seoul', 'Mumbai',
      'Bangalore', 'New Delhi', 'Taipei', 'Sydney', 'Melbourne', 'Jakarta', 'Kuala Lumpur', 'Manila', 'Bangkok',
      'Ho Chi Minh City', 'Auckland']],
    ['Other', ['Remote']]
  ];
  // Role position picker: common titles from incoming offers to senior, grouped by level.
  // Anything not listed can be added as typed.
  var POSITIONS = [
    ['Incoming', ['Incoming Summer Analyst', 'Incoming Summer Associate', 'Incoming Analyst', 'Incoming Associate',
      'Incoming Investment Analyst', 'Incoming Intern']],
    ['Internship', ['Summer Analyst', 'Summer Associate', 'Intern', 'Investment Intern', 'Research Intern', 'Off-Cycle Intern']],
    ['Analyst & Associate', ['Analyst', 'Investment Analyst', 'Research Analyst', 'Senior Analyst', 'Associate',
      'Senior Associate', 'Consultant', 'Trader', 'Software Engineer', 'Product Manager']],
    ['Senior', ['Vice President', 'Senior Vice President', 'Director', 'Executive Director', 'Principal',
      'Portfolio Manager', 'Partner', 'Managing Director', 'Founder', 'Co-Founder']]
  ];
  var comboId = 0;
  // Site-styled dropdown over [group, options] lists. Typing filters it; picking fires "change".
  // With addOwn, typed text that isn't on the list is offered as its own option.
  function Combo(input, groups, empty, addOwn) {
    groups = groups || INDUSTRIES;
    empty = empty || function (t) { return 'No match — “' + t + '” will be used as typed.'; };
    var wrap = document.createElement('div'), list = document.createElement('div'), active = -1, items = [];
    wrap.className = 'combo';
    list.className = 'combo__list'; list.hidden = true; list.setAttribute('role', 'listbox');
    list.id = 'combo-' + (++comboId);
    input.setAttribute('aria-controls', list.id);
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input); wrap.appendChild(list);
    function render() {
      var term = input.readOnly ? '' : input.value.trim().toLowerCase(), html = '';
      items = [];
      (typeof groups === 'function' ? groups() : groups).forEach(function (g) {
        var hits = g[1].filter(function (o) { return !term || o.toLowerCase().indexOf(term) !== -1 || g[0].toLowerCase().indexOf(term) === 0; });
        if (!hits.length) return;
        html += '<p class="combo__group">' + esc(g[0]) + '</p>';
        hits.forEach(function (o) {
          html += '<div class="combo__opt" role="option" data-i="' + items.length + '"' + (o === input.value ? ' aria-selected="true"' : '') + '>' + esc(o) + '</div>';
          items.push(o);
        });
      });
      var typed = input.value.trim();
      if (addOwn && typed && !items.some(function (o) { return o.toLowerCase() === typed.toLowerCase(); })) {
        html += '<p class="combo__group">Not listed?</p><div class="combo__opt combo__add" role="option" data-i="' + items.length + '">Add “' + esc(typed) + '”</div>';
        items.push(typed);
      }
      if (!items.length) html = '<p class="combo__empty">' + esc(empty(typed)) + '</p>';
      list.innerHTML = html;
      active = -1;
    }
    function open() { render(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function pick(i) { input.value = items[i]; close(); input.dispatchEvent(new Event('change', { bubbles: true })); }
    function move(d) {
      if (list.hidden) open();
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      list.querySelectorAll('.combo__opt').forEach(function (el, i) { el.classList.toggle('is-active', i === active); });
      var el = list.querySelector('.is-active'); if (el) el.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', open);
    input.addEventListener('click', function () { if (list.hidden) open(); });
    input.addEventListener('input', open);
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    document.addEventListener('mousedown', function (e) { if (!list.hidden && !wrap.contains(e.target)) close(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && active > -1) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); close(); }
    });
    list.addEventListener('mousedown', function (e) {
      var o = e.target.closest('.combo__opt'); if (!o) return;
      e.preventDefault(); pick(+o.getAttribute('data-i'));
    });
  }

  // Directory filter: a dropdown where several options can be ticked at once. Typing narrows the
  // list, the closed field sums up the picks, and the × clears them. Fires "change" on every pick.
  function MultiCombo(input, groups, empty) {
    var wrap = document.createElement('div'), list = document.createElement('div'), x = document.createElement('button');
    var active = -1, items = [], picked = [], hint = input.placeholder;
    wrap.className = 'combo combo--select combo--multi';
    list.className = 'combo__list'; list.hidden = true; list.setAttribute('role', 'listbox'); list.setAttribute('aria-multiselectable', 'true');
    list.id = 'combo-' + (++comboId);
    x.className = 'combo__clear'; x.type = 'button'; x.hidden = true; x.setAttribute('aria-label', 'Clear ' + (input.getAttribute('aria-label') || 'filter').replace(/^Filter by /, '') + ' filter');
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    input.setAttribute('aria-controls', list.id);
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input); wrap.appendChild(x); wrap.appendChild(list);
    function isPicked(o) { return picked.indexOf(o) !== -1; }
    function summary() { return picked.length ? picked[0] + (picked.length > 1 ? ' +' + (picked.length - 1) : '') : ''; }
    function render() {
      var term = list.hidden ? '' : input.value.trim().toLowerCase(), html = '';
      items = [];
      groups.forEach(function (g) {
        var hits = g[1].filter(function (o) { return !term || o.toLowerCase().indexOf(term) !== -1 || g[0].toLowerCase().indexOf(term) === 0; });
        if (!hits.length) return;
        html += '<p class="combo__group">' + esc(g[0]) + '</p>';
        hits.forEach(function (o) {
          html += '<div class="combo__opt" role="option" data-i="' + items.length + '" aria-selected="' + isPicked(o) + '">' + esc(o) + '</div>';
          items.push(o);
        });
      });
      if (!items.length) html = '<p class="combo__empty">' + esc(empty(input.value.trim())) + '</p>';
      list.innerHTML = html;
      active = -1;
    }
    // Closed, the field shows the picks; open, it's a search box with the picks as its placeholder
    function sync() {
      var open = !list.hidden;
      input.placeholder = open && picked.length ? summary() : hint;
      if (!open) input.value = summary();
      input.title = picked.join(', ');
      input.classList.toggle('is-set', picked.length > 0);
      wrap.classList.toggle('has-value', picked.length > 0);
      x.hidden = !picked.length;
    }
    function open() {
      if (list.hidden) { list.hidden = false; input.value = ''; input.setAttribute('aria-expanded', 'true'); }
      render(); sync();
    }
    function close() { if (list.hidden) return; list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; sync(); }
    function changed() { input.dispatchEvent(new Event('change', { bubbles: true })); }
    function toggle(i) {
      var o = items[i], at = picked.indexOf(o);
      if (at === -1) picked.push(o); else picked.splice(at, 1);
      var el = list.querySelector('[data-i="' + i + '"]'); if (el) el.setAttribute('aria-selected', String(at === -1));
      sync(); changed();
    }
    function move(d) {
      if (list.hidden) open();
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      list.querySelectorAll('.combo__opt').forEach(function (el, i) { el.classList.toggle('is-active', i === active); });
      var el = list.querySelector('.is-active'); if (el) el.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', render);
    input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) close(); }, 120); });
    document.addEventListener('mousedown', function (e) { if (!list.hidden && !wrap.contains(e.target)) close(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && active > -1) { e.preventDefault(); toggle(active); }
      else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); close(); input.blur(); }
      else if (e.key === 'Backspace' && !input.value && picked.length) { picked.pop(); render(); sync(); changed(); }
    });
    list.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var o = e.target.closest('.combo__opt'); if (o) toggle(+o.getAttribute('data-i'));
    });
    x.addEventListener('click', function () { api.clear(); changed(); });
    var api = {
      values: function () { return picked.slice(); },
      clear: function () { picked = []; if (!list.hidden) render(); sync(); }
    };
    return api;
  }

  // Firm list from firms.js: { g: groups, f: [name, group index, logo, prominence tier, aliases?] }.
  // Indexed once, on first use.
  var firmIndex = null;
  function firms() {
    if (firmIndex) return firmIndex;
    firmIndex = { list: [], byName: {} };
    var data = window.FIRMS || { g: [], f: [] };
    // Older firms.js builds are a flat list of [name, group name, logo, aliases?]
    if (Array.isArray(data)) data = { g: null, f: data.map(function (r) { return [r[0], r[1], r[2], 2, r[3]]; }) };
    data.f.forEach(function (r) {
      var f = { name: r[0], group: data.g ? data.g[r[1]] : r[1], logo: r[2] ? 'assets/firms/' + r[2] + '.webp' : '', tier: r[3],
        keys: [r[0]].concat(r[4] || []).map(function (k) { return k.toLowerCase(); }) };
      firmIndex.list.push(f);
      if (!firmIndex.byName[f.keys[0]]) firmIndex.byName[f.keys[0]] = f;
    });
    // Aliases only where no firm already goes by that name
    firmIndex.list.forEach(function (f) {
      f.keys.slice(1).forEach(function (k) { if (!firmIndex.byName[k]) firmIndex.byName[k] = f; });
    });
    return firmIndex;
  }
  function firmLogo(name) {
    var f = firms().byName[String(name || '').trim().toLowerCase()];
    return f ? f.logo : '';
  }
  // Firm or role tile: the firm's logo when we know it, its initials otherwise
  function firmTile(name, cls) {
    var logo = firmLogo(name);
    return '<span class="' + cls + (logo ? ' has-logo' : '') + '" aria-hidden="true">' +
      (logo ? '<img src="' + logo + '" alt="">' : esc(initials(name))) + '</span>';
  }

  // Firm field: suggests known firms with their logos as you type; anything typed is still accepted
  function FirmCombo(input) {
    var wrap = document.createElement('div'), list = document.createElement('div'), mark = document.createElement('img'), active = -1, items = [];
    wrap.className = 'combo combo--firm';
    list.className = 'combo__list'; list.hidden = true; list.setAttribute('role', 'listbox');
    list.id = 'combo-' + (++comboId);
    mark.className = 'combo__mark'; mark.alt = ''; mark.hidden = true;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', list.id);
    input.autocomplete = 'off';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(mark); wrap.appendChild(input); wrap.appendChild(list);
    function sync() {
      var logo = firmLogo(input.value);
      mark.hidden = !logo;
      if (logo) mark.src = logo;
      wrap.classList.toggle('has-logo', !!logo);
    }
    // Rank: exact name, then name starts with the term, then a word in the name, then an
    // alias, then anywhere. Ties go to better-known firms, then shorter names.
    function score(f, term) {
      var best = 9;
      for (var i = 0; i < f.keys.length; i++) {
        var k = f.keys[i], at = k.indexOf(term);
        if (at === -1) continue;
        var s = k === term ? 0 : at === 0 ? 1 : k.indexOf(' ' + term) !== -1 ? 2 : 4;
        if (i > 0) s += 1;
        if (s < best) best = s;
      }
      return best;
    }
    function render() {
      var term = input.value.trim().toLowerCase(), hits = [];
      if (term) firms().list.forEach(function (f) { var s = score(f, term); if (s < 9) hits.push({ f: f, s: s }); });
      items = hits.sort(function (a, b) { return a.s - b.s || a.f.tier - b.f.tier || a.f.name.length - b.f.name.length; })
        .slice(0, 40).map(function (x) { return x.f; });
      list.innerHTML = items.length ? items.map(function (f, i) {
        return '<div class="combo__opt combo__firm" role="option" data-i="' + i + '"' + (f.name === input.value ? ' aria-selected="true"' : '') + '>' +
          '<span class="combo__logo">' + (f.logo ? '<img src="' + f.logo + '" alt="" loading="lazy">' : esc(initials(f.name))) + '</span>' +
          '<span class="combo__name">' + esc(f.name) + '</span><span class="combo__kind">' + esc(f.group) + '</span></div>';
      }).join('') : '<p class="combo__empty">No match — “' + esc(input.value.trim()) + '” will be used as typed.</p>';
      active = -1;
    }
    function open() {
      if (!input.value.trim()) return close();
      render(); list.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function pick(i) { input.value = items[i].name; close(); sync(); }
    function move(d) {
      if (list.hidden) open();
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      list.querySelectorAll('.combo__opt').forEach(function (el, i) { el.classList.toggle('is-active', i === active); });
      var el = list.querySelector('.is-active'); if (el) el.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', open);
    input.addEventListener('input', function () { open(); sync(); });
    input.addEventListener('blur', function () {
      setTimeout(close, 120);
      // "goldman sachs" typed out in full becomes "Goldman Sachs"
      var f = firms().byName[input.value.trim().toLowerCase()];
      if (f && f.keys[0] === input.value.trim().toLowerCase()) input.value = f.name;
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && active > -1) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); close(); }
    });
    list.addEventListener('mousedown', function (e) {
      var o = e.target.closest('.combo__opt'); if (!o) return;
      e.preventDefault(); pick(+o.getAttribute('data-i'));
    });
    sync();
  }

  // Month picker: a site-styled stand-in for the browser's month input. The real
  // input stays in the form (hidden) holding YYYY-MM, so reads and saves are unchanged.
  function MonthPicker(input) {
    var wrap = document.createElement('div'), btn = document.createElement('button'), pop = document.createElement('div'), year;
    wrap.className = 'mpick';
    btn.type = 'button'; btn.className = 'auth__input mpick__btn';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    pop.className = 'mpick__pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
    input.type = 'hidden';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input); wrap.appendChild(btn); wrap.appendChild(pop);
    function now() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
    function sync() {
      btn.disabled = input.disabled;
      btn.innerHTML = '<span class="' + (input.value ? '' : 'mpick__ph') + '">' + (input.value ? monthLabel(input.value + '-01') : 'Select month') + '</span>' +
        '<svg class="mpick__icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" fill="none" stroke="currentColor"/><path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor"/></svg>';
      if (input.disabled) close();
    }
    function render() {
      var cur = now(), html = '<div class="mpick__head">' +
        '<button type="button" class="mpick__nav" data-y="-1" aria-label="Previous year">‹</button>' +
        '<span class="mpick__year">' + year + '</span>' +
        '<button type="button" class="mpick__nav" data-y="1" aria-label="Next year">›</button></div><div class="mpick__grid">';
      MONTHS.forEach(function (m, i) {
        var v = year + '-' + ('0' + (i + 1)).slice(-2);
        html += '<button type="button" class="mpick__m' + (v === input.value ? ' is-sel' : '') + (v === cur ? ' is-now' : '') + '" data-v="' + v + '">' + m + '</button>';
      });
      html += '</div><div class="mpick__foot"><button type="button" class="auth__link" data-v="">Clear</button>' +
        '<button type="button" class="auth__link" data-v="' + cur + '">This month</button></div>';
      pop.innerHTML = html;
    }
    function open() {
      year = +(input.value || now()).slice(0, 4);
      render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
      var sel = $('.is-sel', pop) || $('.is-now', pop) || $('.mpick__m', pop); sel.focus();
    }
    function close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    function pick(v) {
      input.value = v; sync(); close(); btn.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    btn.addEventListener('click', function () { if (pop.hidden) open(); else close(); });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      if (b.hasAttribute('data-y')) { year += +b.getAttribute('data-y'); render(); $('[data-y="' + b.getAttribute('data-y') + '"]', pop).focus(); }
      else pick(b.getAttribute('data-v'));
    });
    pop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); return; }
      var ms = Array.prototype.slice.call(pop.querySelectorAll('.mpick__m')), i = ms.indexOf(document.activeElement);
      var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
      if (i > -1 && d) { e.preventDefault(); ms[(i + d + 12) % 12].focus(); }
    });
    document.addEventListener('mousedown', function (e) { if (!pop.hidden && !wrap.contains(e.target)) close(); });
    wrap.addEventListener('focusout', function (e) { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) close(); });
    input._sync = sync;
    sync();
  }

  function RolesEditor(root) {
    var removed = [];
    var tpl = $('#role-template');
    function add(r) {
      var el = tpl.content.firstElementChild.cloneNode(true);
      r = r || {};
      el.setAttribute('data-id', r.id || '');
      $('[name=industry]', el).value = r.industry || '';
      Combo($('[name=industry]', el));
      $('[name=position]', el).value = r.position || '';
      Combo($('[name=position]', el), POSITIONS, null, true);
      $('[name=firm]', el).value = r.firm || '';
      FirmCombo($('[name=firm]', el));
      $('[name=location]', el).value = r.location || '';
      Combo($('[name=location]', el), LOCATIONS);
      $('[name=start_month]', el).value = (r.start_month || '').slice(0, 7);
      $('[name=end_month]', el).value = (r.end_month || '').slice(0, 7);
      var present = $('[name=present]', el), end = $('[name=end_month]', el);
      present.checked = r.present != null ? !!r.present : !!r.id && !r.end_month;
      end.disabled = present.checked;
      MonthPicker($('[name=start_month]', el));
      MonthPicker(end);
      present.addEventListener('change', function () { end.disabled = present.checked; if (present.checked) end.value = ''; end._sync(); });
      $('.role__remove', el).addEventListener('click', function () {
        if (el.getAttribute('data-id')) removed.push(el.getAttribute('data-id'));
        el.remove();
        number();
      });
      $('.role__toggle', el).addEventListener('click', function () { expand(el.classList.contains('is-collapsed') ? el : null); });
      $('.role__edit', el).addEventListener('click', function () { expand(el.classList.contains('is-collapsed') ? el : null); });
      // Adding a role folds the others into one-line summaries so the page stays short
      Array.prototype.slice.call(root.children).forEach(function (other) { if (!blank(other)) collapse(other); else other.remove(); });
      root.appendChild(el);
      number();
      if (r.id) collapse(el);
      return el;
    }
    function blank(el) {
      return !el.getAttribute('data-id') && ['industry', 'position', 'firm', 'location', 'start_month', 'end_month'].every(function (n) { return !$('[name=' + n + ']', el).value.trim(); });
    }
    // Folded role: firm logo, position, then firm · location · dates
    function summarize(el) {
      var v = function (n) { return $('[name=' + n + ']', el).value.trim(); };
      var month = function (m) { return m ? monthLabel(m + '-01') : ''; };
      var start = month(v('start_month')), end = $('[name=present]', el).checked ? 'Present' : month(v('end_month'));
      var when = start ? start + (end ? ' – ' + end : '') : '';
      var meta = [v('firm'), v('location'), when].filter(Boolean).join(' · ');
      $('.role__sum', el).innerHTML = (v('firm') ? firmTile(v('firm'), 'role__tile') : '<span class="role__tile" aria-hidden="true">+</span>') +
        '<span class="role__sumtext"><span class="role__sumhead">' + esc(v('position') || 'Untitled role') + '</span>' +
        '<span class="role__summeta">' + esc(meta || 'Not filled in yet') + '</span></span>';
    }
    function collapse(el) {
      summarize(el);
      el.classList.add('is-collapsed');
      $('.role__toggle', el).setAttribute('aria-expanded', 'false');
      $('.role__edit', el).textContent = 'Edit';
    }
    // Open one role (or none) and fold the rest
    function expand(target) {
      Array.prototype.forEach.call(root.children, function (el) {
        if (el === target) {
          el.classList.remove('is-collapsed');
          $('.role__toggle', el).setAttribute('aria-expanded', 'true');
          $('.role__edit', el).textContent = 'Done';
        } else collapse(el);
      });
    }
    function number() {
      Array.prototype.forEach.call(root.children, function (el, i) { $('.role__title', el).textContent = 'Role ' + (i + 1); });
    }
    function read(msg) {
      var out = [], bad = null;
      Array.prototype.forEach.call(root.children, function (el) {
        var r = {
          industry: $('[name=industry]', el).value.trim(),
          position: $('[name=position]', el).value.trim(),
          firm: $('[name=firm]', el).value.trim(),
          location: $('[name=location]', el).value.trim(),
          start_month: $('[name=start_month]', el).value,
          end_month: $('[name=present]', el).checked ? '' : $('[name=end_month]', el).value
        };
        var id = el.getAttribute('data-id');
        if (!id && !r.industry && !r.position && !r.firm && !r.location && !r.start_month && !r.end_month) return; // untouched blank row
        var before = bad;
        if (!bad && (!r.industry || !r.position || !r.firm || !r.location || !r.start_month)) bad = 'Each role needs an industry, position, firm, location and start date.';
        if (!bad && !r.end_month && !$('[name=present]', el).checked) bad = 'Add an end date, or tick “I currently work here”.';
        if (!bad && r.end_month && r.end_month < r.start_month) bad = 'A role’s end date is before its start date.';
        if (bad && !before) expand(el); // show the role that needs fixing
        r.start_month = r.start_month ? r.start_month + '-01' : null;
        r.end_month = r.end_month ? r.end_month + '-01' : null;
        if (id) r.id = id;
        out.push(r);
      });
      if (bad) { say(msg, bad); return null; }
      say(msg, '');
      return out;
    }
    // Raw field values, unvalidated, for saving a draft
    function dump() {
      return Array.prototype.map.call(root.children, function (el) {
        var r = { present: $('[name=present]', el).checked };
        ['industry', 'position', 'firm', 'location', 'start_month', 'end_month'].forEach(function (n) { r[n] = $('[name=' + n + ']', el).value; });
        return r;
      });
    }
    return { add: add, read: read, dump: dump, removed: removed };
  }

  // ---------- pages ----------
  function wireSignOut() {
    document.querySelectorAll('.js-signout').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        var menu = $('.acct__menu'); if (menu) menu.hidden = true;
        var out = api.signOut();
        if (window.uaicLeave) window.uaicLeave('/login', out);
        else out.then(function () { location.href = '/login'; }, function () { location.href = '/login'; });
      });
    });
  }

  // Account menu in the header corner: who is signed in, plus links to their
  // profile and the directory. Not shown on /onboarding.
  function fillAccount(user, mine) {
    var root = $('#acct'); if (!root) return;
    var name = mine ? mine.first_name + ' ' + mine.last_name : 'New member';
    var initials = mine ? (mine.first_name.charAt(0) + mine.last_name.charAt(0)).toUpperCase() : user.email.charAt(0).toUpperCase();
    root.querySelectorAll('.acct__name').forEach(function (el) { el.textContent = name; });
    root.querySelectorAll('.acct__email').forEach(function (el) { el.textContent = mine ? mine.gmail : user.email; });
    root.querySelectorAll('.acct__avatar').forEach(function (el) { el.textContent = initials; });
    // Club role under the name: "UAIC President" for board members, "UAIC Member" otherwise
    var cur = $('.acct__current', root);
    cur.textContent = mine ? 'UAIC ' + (mine.board_role || 'Member') : '';
    cur.hidden = !mine;
  }
  function accountMenu(user, mine) {
    var root = $('#acct'); if (!root) return;
    fillAccount(user, mine);
    if (!mine) root.querySelectorAll('[data-member]').forEach(function (el) { el.remove(); });
    root.querySelectorAll('.acct__group').forEach(function (g) { if (!g.children.length) g.remove(); });
    root.querySelectorAll('.acct__item[href]').forEach(function (a) {
      if (a.getAttribute('href') === '/' + page) a.setAttribute('aria-current', 'page');
    });

    var btn = $('.acct__btn', root), menu = $('.acct__menu', root);
    function set(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    btn.addEventListener('click', function () { set(menu.hidden); });
    document.addEventListener('click', function (e) { if (!root.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    root.hidden = false;
  }

  function membersPage() {
    var root = $('#directory'), list = $('#dir-list'), empty = $('#dir-empty'), search = $('#dir-search');
    var count = $('#dir-count'), clear = $('#dir-clear');
    var filters = { industry: $('#f-industry'), firm: $('#f-firm'), location: $('#f-location'), position: $('#f-position') };
    api.directory().then(function (people) {
      var roles = [].concat.apply([], people.map(function (p) { return p.experiences || []; }));
      // Options are only what members have actually entered, grouped like the role pickers
      function present(field, groups, label) {
        var seen = {}, out = [], known = {};
        roles.forEach(function (r) { var v = (r[field] || '').trim(); if (v) seen[v.toLowerCase()] = v; });
        (groups || []).forEach(function (g) {
          var hits = g[1].filter(function (o) { known[o.toLowerCase()] = 1; return seen[o.toLowerCase()]; });
          if (hits.length) out.push([g[0], hits]);
        });
        var rest = Object.keys(seen).filter(function (k) { return !known[k]; }).map(function (k) { return seen[k]; }).sort();
        if (rest.length) out.push([label || 'Other', rest]);
        return out;
      }
      var none = function () { return 'No members list that yet.'; };
      var picks = {
        industry: MultiCombo(filters.industry, present('industry', INDUSTRIES), none),
        firm: MultiCombo(filters.firm, present('firm', null, 'Companies'), none),
        location: MultiCombo(filters.location, present('location', LOCATIONS), none),
        position: MultiCombo(filters.position, present('position', null, 'Positions'), none)
      };

      // A role passes a filter if that filter is empty or the role's value is one of the picks
      function within(v, set) { return !set.length || set.indexOf(String(v || '').trim().toLowerCase()) !== -1; }
      function render() {
        var term = search.value.trim().toLowerCase();
        var f = {};
        Object.keys(picks).forEach(function (k) { f[k] = picks[k].values().map(function (v) { return v.toLowerCase(); }); });
        var any = f.industry.length || f.firm.length || f.location.length || f.position.length;
        var shown = people.filter(function (p) {
          var rs = p.experiences || [];
          // Filters apply together to one role: "Investment Banking" + "New York" means IB in New York
          if (any && !rs.some(function (r) { return within(r.industry, f.industry) && within(r.firm, f.firm) && within(r.location, f.location) && within(r.position, f.position); })) return false;
          if (!term) return true;
          var hay = [p.first_name, p.last_name, p.class_year ? classLabel(p.class_year) : ''].concat(rs.map(function (r) { return [r.firm, r.industry, r.position, r.location].join(' '); })).join(' ').toLowerCase();
          return hay.indexOf(term) !== -1;
        });
        list.innerHTML = shown.map(function (p) { return personCard(p, true); }).join('');
        empty.hidden = shown.length > 0;
        clear.disabled = !any && !term;
        count.innerHTML = '<strong>' + shown.length + '</strong> of ' + people.length;
      }
      var drawer = Drawer();
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.person__open'); if (!b) return;
        var p = people.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
        if (p) drawer.open(p, b);
      });
      search.addEventListener('input', render);
      Object.keys(filters).forEach(function (k) { filters[k].addEventListener('change', render); });
      clear.addEventListener('click', function () {
        search.value = '';
        Object.keys(picks).forEach(function (k) { picks[k].clear(); });
        render();
      });
      render();
      root.hidden = false;
    });
  }

  function onboardingPage(user) {
    var form = $('#onboard'), msg = $('.auth__msg', form), step = 1, LAST = 5;
    var FIELDS = ['first_name', 'last_name', 'class_year', 'gmail', 'linkedin_url', 'board', 'board_role', 'advisor', 'advisor_type'];
    var roles = RolesEditor($('#roles'));
    var profile;
    // Progress is kept in this browser so a refresh or return visit picks up where they left off
    var draftKey = 'uaic-onboard-' + user.id;
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch (e) {}
    function saveDraft() {
      var d = { step: step, roles: roles.dump() };
      FIELDS.forEach(function (n) { d[n] = form[n].value; });
      try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch (e) {}
    }
    ClassCombo(form.class_year);
    BoardCombos(form);
    AdvisorCombos(form);
    fillProfile(form, null, user.email);
    if (draft) {
      FIELDS.forEach(function (n) { form[n].value = draft[n] || ''; });
      (draft.roles || []).forEach(function (r) { roles.add(r); });
      form.board.dispatchEvent(new Event('change', { bubbles: true }));
      form.advisor.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (!$('#roles').children.length) roles.add();
    $('#add-role').addEventListener('click', function () { $('[name=industry]', roles.add()).focus(); });

    function preview(rs) { $('#wiz-preview').innerHTML = personCard(Object.assign({}, profile, { experiences: rs })); }
    function show(n) {
      step = n;
      Array.prototype.forEach.call(form.querySelectorAll('.wiz__step'), function (s) { s.hidden = +s.getAttribute('data-step') !== n; });
      $('#wiz-count').textContent = 'Step ' + n + ' of ' + LAST;
      $('#wiz-back').hidden = n === 1;
      $('#wiz-next').textContent = n === LAST ? 'Finish' : 'Continue';
      say(msg, '');
      window.scrollTo(0, 0);
      saveDraft();
      gate();
    }
    // Steps 1 to 3 can't be continued until every box has something in it
    function gate() {
      $('#wiz-next').disabled =
        (step === 1 && ['first_name', 'last_name', 'class_year', 'gmail', 'linkedin_url'].some(function (n) { return !form[n].value.trim(); })) ||
        (step === 2 && (!form.board.value || (form.board.value === 'Yes' && !form.board_role.value))) ||
        (step === 3 && (!form.advisor.value || (form.advisor.value === 'Yes' && !form.advisor_type.value)));
    }
    $('#wiz-back').addEventListener('click', function () { show(step - 1); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (step === 1) { profile = readProfile(form, msg); if (profile) show(2); return; }
      if (step === 2) {
        var b = readBoard(form, msg);
        if (b === undefined) return;
        profile.board_role = b;
        show(3);
        return;
      }
      if (step === 3) {
        var a = readAdvisor(form, msg);
        if (a === undefined) return;
        profile.advisor_type = a;
        show(4);
        return;
      }
      if (step === 4) {
        var rs = roles.read(msg);
        if (!rs) return;
        preview(rs);
        show(5);
        return;
      }
      var btn = $('#wiz-next'); btn.disabled = true;
      api.save(user.id, profile, roles.read(msg), roles.removed).then(function () {
        try { localStorage.removeItem(draftKey); } catch (e) {}
        location.href = '/members';
      }, function () { btn.disabled = false; say(msg, 'Something went wrong saving your profile. Please try again.'); });
    });
    form.addEventListener('input', saveDraft);
    form.addEventListener('input', gate);
    form.addEventListener('change', saveDraft);
    form.addEventListener('change', gate);
    form.addEventListener('click', function () { setTimeout(saveDraft); }); // role add/remove
    // Resume on the saved step, as long as the earlier steps still check out
    show(1);
    if (draft && draft.step > 1 && (profile = readProfile(form, msg))) {
      show(2);
      var b = draft.step > 2 ? readBoard(form, msg) : undefined;
      if (b !== undefined) {
        profile.board_role = b;
        show(3);
        var a = draft.step > 3 ? readAdvisor(form, msg) : undefined;
        if (a !== undefined) {
          profile.advisor_type = a;
          show(4);
          var rs = draft.step > 4 && roles.read(msg);
          if (rs) { preview(rs); show(5); }
        }
      }
      say(msg, '');
    }
    form.hidden = false;
  }

  // My Profile (/profile): your card, with an Edit Profile button that swaps it for
  // the details + roles form in place. Saving swaps back to the refreshed card.
  function profilePage(user, mine) {
    var view = $('#me'), form = $('#me-edit'), msg = $('.auth__msg', form), note = $('#me-msg');
    var roles = RolesEditor($('#roles'));
    ClassCombo(form.class_year);
    function show(p) {
      mine = p;
      $('#me-card').innerHTML = personCard(p);
      var g = $('#me-gmail'); g.textContent = p.gmail; g.href = 'mailto:' + p.gmail;
    }
    function editing(on) {
      view.hidden = on; form.hidden = !on;
      $('#profile-title').textContent = on ? 'Edit Profile' : 'My Profile';
      window.scrollTo(0, 0);
    }
    function open() {
      fillProfile(form, mine, user.email);
      $('#roles').innerHTML = '';
      roles.removed.splice(0);
      (mine.experiences || []).slice().sort(byStart).forEach(roles.add);
      say(msg, ''); say(note, '');
      editing(true);
      form.first_name.focus();
    }
    $('#me-open').addEventListener('click', open);
    $('#me-cancel').addEventListener('click', function () { editing(false); $('#me-open').focus(); });
    $('#add-role').addEventListener('click', function () { $('[name=industry]', roles.add()).focus(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = readProfile(form, msg); if (!p) return;
      var rs = roles.read(msg); if (!rs) return;
      var btn = $('.auth__btn', form); btn.disabled = true;
      api.save(user.id, p, rs, roles.removed.slice()).then(function () {
        return api.profile(user.id);
      }).then(function (fresh) {
        btn.disabled = false;
        show(fresh);
        fillAccount(user, fresh);
        editing(false);
        say(note, 'Saved.', true);
      }, function () { btn.disabled = false; say(msg, 'Something went wrong saving your changes. Please try again.'); });
    });
    show(mine);
    view.hidden = false;
    if (location.hash === '#edit') open();
  }

  wireSignOut();
  api.user().then(function (user) {
    if (!user) { location.replace('/login'); return; }
    return api.profile(user.id).then(function (mine) {
      if (page === 'onboarding' && mine) return location.replace('/members');
      if (page !== 'onboarding' && !mine) return location.replace('/onboarding');
      accountMenu(user, mine);
      if (page === 'onboarding') onboardingPage(user);
      if (page === 'members') membersPage();
      if (page === 'profile') profilePage(user, mine);
    });
  }).catch(function () {
    // Say so instead of leaving a blank page when the profile lookup fails
    var box = $('main .container'), note = document.createElement('p');
    note.className = 'auth__msg';
    say(note, 'We couldn’t load your account. Please refresh, or try again in a few minutes.');
    if (box) box.appendChild(note);
  });
})();
