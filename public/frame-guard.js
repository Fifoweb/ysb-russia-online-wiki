// GitHub Pages cannot set frame-ancestors / X-Frame-Options HTTP headers.
// Defence in depth: do not display interactive UI when loaded inside an iframe.
// This is NOT a replacement for frame-ancestors: a reverse proxy must set the real header.
(function () {
  if (window.self !== window.top) {
    document.documentElement.style.setProperty('display', 'none', 'important');
  }
})();
