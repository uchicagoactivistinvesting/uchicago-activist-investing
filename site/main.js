/* UChicago Activist Investing — behaviour
   - marks <html class="js"> so hidden-until-revealed states only apply with JS
   - reveals .a-reveal / .a-fade / .a-expand elements as they enter the viewport
   - home header floats over the hero and turns solid after it scrolls away
   - hero fade-in on load and a gentle parallax on scroll
   - mobile menu, active nav link with an animated underline
   - cross-fade between pages on internal links
   - partner area password gate
*/
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reload starts at the top ----------
     The browser otherwise restores the old scroll position on refresh, which
     drops the reader mid-page with the hero already scrolled past and every
     entrance animation skipped. Owning the restore means a refresh replays the
     page from the hero down. In-page #hash links are unaffected. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  /* ---------- active nav link ----------
     Match on the bare page name with any .html stripped from both sides, so the
     link still lights up on hosts that serve extensionless URLs (/events as well
     as /events.html). The home page is the empty name. */
  var here = location.pathname.split('/').pop().replace(/\.html$/, '');
  if (here === 'index') here = '';
  document.querySelectorAll('.nav a[href]').forEach(function (a) {
    var raw = a.getAttribute('href');
    if (/^[a-z]+:/i.test(raw)) return; /* the Interest Form and other off-site links */
    var name = raw.replace(/^\.\//, '').replace(/\.html$/, '').replace(/^\/$/, '');
    if (name === 'index') name = '';
    if (name === here) a.setAttribute('aria-current', 'page');
  });

  /* ---------- page transitions ---------- */
  /* Content fades in on arrival and out again on the way to the next page, so
     the header and the maroon rules appear to stay put between pages. */
  var FADE_OUT = 260;
  if (reduce) {
    root.classList.add('is-ready');
  } else {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('is-ready'); });
    });
    // Safety net: the page must never stay faded out.
    setTimeout(function () { root.classList.add('is-ready'); }, 600);

    var leaving = false;
    var isInternal = function (a) {
      if (a.target && a.target !== '_self') return false;
      if (a.hasAttribute('download')) return false;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return false;
      if (!/\.html$|\/$/.test(url.pathname)) return false;
      if (url.pathname === location.pathname && url.hash) return false;
      return true;
    };
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || leaving || !isInternal(a)) return;
      e.preventDefault();
      leaving = true;
      root.classList.add('is-leaving');
      var go = function () { location.href = a.href; };
      setTimeout(go, FADE_OUT);
    });

    // Coming back through history: show the page instead of the fade-out state.
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { leaving = false; root.classList.remove('is-leaving'); root.classList.add('is-ready'); }
    });
  }

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      var hdr = toggle.closest('.header');
      if (hdr) hdr.classList.toggle('menu-open', open);
    });
  }

  /* ---------- one scroll loop ----------
     Every scroll-driven effect on the page runs from this single rAF-throttled
     loop and reads the same scrollY, so a scroll costs one frame of work no
     matter how many effects are on the page. Layout is never measured during
     a scroll: each effect caches what it needs in a `measure` job that runs on
     load, on resize, and when the tab becomes visible again. */
  var frameJobs = [];
  var measureJobs = [];
  var frameQueued = false;
  function runFrame() {
    frameQueued = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    for (var i = 0; i < frameJobs.length; i++) frameJobs[i](y);
  }
  function queueFrame() {
    if (!frameQueued) { frameQueued = true; requestAnimationFrame(runFrame); }
  }
  function remeasure() {
    for (var i = 0; i < measureJobs.length; i++) measureJobs[i]();
    runFrame();
  }
  window.addEventListener('scroll', queueFrame, { passive: true });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasure, 120);
  });
  /* A page loaded in a background tab has its animation frames paused, so the
     loop above cannot run. Catch up the moment it is looked at. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) remeasure();
  });
  window.addEventListener('load', remeasure);

  /* ---------- scroll reveal ----------
     Elements are revealed by an IntersectionObserver. The scroll loop is only a
     fallback for when the observer is throttled or unavailable, and it walks a
     shrinking list of not-yet-revealed elements whose positions were measured
     ahead of time — so it never reads layout mid-scroll and never touches an
     element twice. */
  var targets = [].slice.call(document.querySelectorAll('.a-reveal, .a-fade, .a-expand'));
  // Once an element's entrance has played (or had time to), drop the clip and
  // animation entirely so nothing can stay hidden or clipped if animations stall.
  function settle(el) { el.classList.add('done'); }
  function show(el) {
    if (el._shown) return;
    el._shown = true;
    el.classList.add('in');
    setTimeout(function () { settle(el); }, 1800);
  }
  document.addEventListener('animationend', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('in')) settle(e.target);
  });

  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(show);
  } else {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { show(entries[i].target); io.unobserve(entries[i].target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });

    /* Waiting elements, with each one's distance from the top of the document.
       "In view" counts anything already scrolled past, so a jump down the page
       (anchor link, restored scroll, fast fling) never leaves a section stuck
       in its hidden pre-entrance state. */
    var waiting = [];
    var viewH = window.innerHeight || document.documentElement.clientHeight;
    measureJobs.push(function () {
      viewH = window.innerHeight || document.documentElement.clientHeight;
      var y = window.pageYOffset || 0;
      waiting.length = 0;
      for (var i = 0; i < targets.length; i++) {
        var el = targets[i];
        if (el._shown) continue;
        el._top = el.getBoundingClientRect().top + y;
        waiting.push(el);
      }
    });
    frameJobs.push(function (y) {
      if (!waiting.length) return;
      var edge = y + viewH;
      for (var i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i]._top < edge) {
          show(waiting[i]);
          io.unobserve(waiting[i]);
          waiting.splice(i, 1);
        }
      }
    });

    // Anything already on screen when the script runs is revealed at once,
    // without waiting for the observer's first callback.
    var y0 = window.pageYOffset || 0;
    for (var t = 0; t < targets.length; t++) {
      if (targets[t].getBoundingClientRect().top < viewH) { show(targets[t]); } else { io.observe(targets[t]); }
    }
    remeasure();
  }

  /* ---------- overlay header: turn solid once the hero scrolls away ---------- */
  var overlay = document.querySelector('.header--overlay');
  var hero = document.querySelector('.hero');
  if (overlay && hero) {
    var heroText = hero.querySelector('.hero__title');
    var solidAt = 0;
    var isSolid = null;
    measureJobs.push(function () {
      /* Go solid just before the hero copy slides under the floating header, so
         the white text never sits on the white bar. */
      if (reduce && heroText) {
        var textTop = heroText.getBoundingClientRect().top + (window.pageYOffset || 0);
        solidAt = Math.min(hero.offsetHeight - overlay.offsetHeight, textTop - overlay.offsetHeight);
      } else {
        /* The hero is pinned and its copy dissolves with scroll, so switch
           once roughly half a hero-height has scrolled past. */
        solidAt = hero.offsetHeight * 0.5;
      }
      solidAt = Math.max(0, solidAt);
      isSolid = null; // force the next frame to re-apply the class
    });
    frameJobs.push(function (y) {
      var want = y > solidAt;
      if (want === isSolid) return;
      isSolid = want;
      overlay.classList.toggle('is-solid', want);
    });
  }

  /* ---------- logo click: back to the hero ---------- */
  /* On the home page the logo scrolls back up to the hero instead of
     reloading; anywhere else it navigates home and lands on the hero. */
  var samePage = function (a) {
    var here = location.pathname.replace(/index\.html$/, '');
    var there = new URL(a.href, location.href).pathname.replace(/index\.html$/, '');
    return here === there;
  };
  document.querySelectorAll('.header__logo, .footer__logo').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!samePage(a)) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    });
  });

  /* ---------- hero: fade-in + parallax ---------- */
  var heroImg = hero && hero.querySelector('.hero__img');
  if (heroImg) {
    heroImg.classList.add('is-loading');
    var done = function () { heroImg.classList.remove('is-loading'); };
    if (heroImg.complete && heroImg.naturalWidth) { setTimeout(done, 30); } else { heroImg.addEventListener('load', done); heroImg.addEventListener('error', done); }
    setTimeout(done, 3000); // never leave the hero blurred
    if (!reduce) {
      /* The hero is sticky, so the next section slides over it. Progress
         (0 -> 1 as one hero-height scrolls past) drives the image drift, the
         copy lift and the tint veil in CSS via --hero-p.
         The image is moved with translate3d only — never scaled — so its
         blurred, colour-graded bitmap is rasterised once and every later frame
         is a compositor move rather than a repaint of a full-screen filter. */
      var heroH = window.innerHeight;
      var lastP = -1;
      var wasPast = null;
      measureJobs.push(function () {
        heroH = hero.offsetHeight || window.innerHeight;
        lastP = -1;
        wasPast = null;
      });
      frameJobs.push(function (y) {
        var p = y / heroH;
        if (p < 0) p = 0; else if (p > 1) p = 1;
        if (Math.abs(p - lastP) < 0.0005) return;
        lastP = p;
        hero.style.setProperty('--hero-p', p.toFixed(3));
        heroImg.style.transform = 'translate3d(0,' + (p * heroH * 0.22).toFixed(1) + 'px,0)';
        var past = p >= 1;
        if (past !== wasPast) { wasPast = past; hero.classList.toggle('is-past', past); }
      });
    }
  }

  /* ---------- inner page banner: gentle drift as it scrolls away ----------
     Mirrors the home hero at a smaller scale. --ph-p runs 0 -> 1 over one
     banner height and drives the copy lift and fade in CSS. */
  var pageHero = document.querySelector('.page-hero');
  if (pageHero && !reduce) {
    var phImg = pageHero.querySelector('.page-hero__img');
    var phH = 1;
    var phLast = -1;
    measureJobs.push(function () {
      phH = pageHero.offsetHeight || 1;
      phLast = -1;
    });
    frameJobs.push(function (y) {
      var p = y / phH;
      if (p < 0) p = 0; else if (p > 1) p = 1;
      if (Math.abs(p - phLast) < 0.0005) return;
      phLast = p;
      pageHero.style.setProperty('--ph-p', p.toFixed(3));
      if (phImg) phImg.style.transform = 'translate3d(0,' + (p * phH * 0.18).toFixed(1) + 'px,0)';
    });
  }

  remeasure();

  /* FAQ — quick height slide on open/close. The <details> element has no
     native transition, so we animate the answer's height ourselves and let
     the browser keep the open/closed state and keyboard behaviour. */
  (function () {
    var items = document.querySelectorAll('.faq__item');
    if (!items.length) return;
    var quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var DUR = 220;
    var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

    function slide(item, opening) {
      var panel = item.querySelector('.faq__a');
      if (!panel || !panel.animate) { if (!opening) item.open = false; return; }
      if (item._faqDone) item._faqDone();

      var h = panel.scrollHeight;
      var frames = [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }];
      var anim = panel.animate(opening ? frames : frames.slice().reverse(), {
        duration: DUR, easing: EASE
      });

      var settled = false;
      var finish = function () {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        item._faqDone = null;
        try { anim.cancel(); } catch (e) {}
        panel.style.height = '';
        if (!opening) item.open = false;
      };
      var guard = setTimeout(finish, DUR + 120);
      anim.onfinish = finish;
      item._faqDone = finish;
    }

    items.forEach(function (item) {
      var summary = item.querySelector('.faq__q');
      if (!summary) return;
      summary.addEventListener('click', function (e) {
        if (quick) return;
        e.preventDefault();
        if (item.open) {
          slide(item, false);
        } else {
          var group = item.getAttribute('name');
          if (group) {
            document.querySelectorAll('.faq__item[name="' + group + '"][open]').forEach(function (other) {
              if (other !== item) slide(other, false);
            });
          }
          item.open = true;
          slide(item, true);
        }
      });
    });
  })();

})();
