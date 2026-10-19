/* Page-to-page view transitions. Loaded in <head> on every page so the
   listeners exist before the first frame: the old page sets things up as it is
   captured (pageswap), the new one before it is shown (pagereveal). Each
   page's <link rel="expect" href="#page-end"> holds that first frame until the
   whole page is parsed, so the cross-fade never fades into a half-built page.

   - Inner page -> inner page: the maroon banner is the same on both, so it
     should hold perfectly still while only the title changes. The banner's
     entrance (slow zoom, shade fade) is skipped so the new one already matches.
   - Login <-> Create an Account: morph the card instead of cross-fading the
     page (see .auth-swap in styles.css). Entrances in the card are skipped so
     it is already there to morph into. */
(function () {
  var root = document.documentElement;
  /* main.js sets these too, but it runs at the end of <body>, after the first
     frame. Without them that frame shows every entrance already finished, and
     the cross-fade would fade into content that then blinks out and replays. */
  root.classList.add('js');
  if ('CSSViewTransitionRule' in window) root.classList.add('vt');
  var KEY = 'uaic-banner';
  var isAuth = function (u) {
    try { return /^\/(login|signup)(\.html)?$/.test(new URL(u, location.href).pathname); } catch (err) { return false; }
  };
  var fromOtherAuth = function (u) { return isAuth(u) && new URL(u, location.href).pathname !== location.pathname; };

  window.addEventListener('pageswap', function (e) {
    try { sessionStorage.setItem(KEY, document.querySelector('.page-hero') ? '1' : '0'); } catch (err) {}
    var to = e.activation && e.activation.entry && e.activation.entry.url;
    if (e.viewTransition && fromOtherAuth(to)) root.classList.add('auth-swap');
  });
  // Back to this page from the bfcache: drop the outgoing names
  window.addEventListener('pageshow', function (e) { if (e.persisted) root.classList.remove('auth-swap'); });

  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var hadBanner = false;
    try { hadBanner = sessionStorage.getItem(KEY) === '1'; sessionStorage.removeItem(KEY); } catch (err) {}
    if (hadBanner) root.classList.add('banner-hold');

    var act = window.navigation && navigation.activation;
    if (!fromOtherAuth((act && act.from && act.from.url) || document.referrer)) return;
    root.classList.add('auth-swap');
    // main.js skips anything already marked _shown
    document.querySelectorAll('.auth .a-reveal, .auth .a-fade, .auth .a-expand, .footer .a-fade').forEach(function (el) {
      el._shown = true;
      el.classList.add('in', 'done');
    });
    e.viewTransition.finished.finally(function () { root.classList.remove('auth-swap'); });
  });
})();
