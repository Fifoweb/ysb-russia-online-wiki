// GitHub Pages serves 404.html for SPA routes, including URLs with search/hash.
(function () {
  var base = '/ysb-russia-online-wiki';
  var path = window.location.pathname;
  var route = path.startsWith(base + '/') ? path.slice(base.length) : '/';
  var requested = route + window.location.search + window.location.hash;
  window.location.replace(base + '/?__spa=' + encodeURIComponent(requested));
})();
