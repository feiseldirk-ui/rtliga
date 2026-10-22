(function restoreGitHubPagesPath() {
  "use strict";
  const params = new URLSearchParams(window.location.search);
  const path = params.get("p");
  if (!path) return;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const restoredPath = normalized.replace(/~and~/g, "&");
  window.history.replaceState(null, "", restoredPath + window.location.hash);
})();
