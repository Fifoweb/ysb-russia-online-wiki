// Restore routes forwarded by the GitHub Pages 404 page before the React app starts.
(function () {
  var params = new URLSearchParams(window.location.search);
  var p = params.get('__spa');
  if (!p) {
    try {
      p = window.sessionStorage.getItem('spa-path');
      if (p) window.sessionStorage.removeItem('spa-path');
    } catch (_) {
      p = null;
    }
  }
  if (p && p.charAt(0) === '/' && !p.startsWith('//')) {
    window.history.replaceState(null, '', '/ysb-russia-online-wiki' + p);
  }
})();
