(function redirectGitHubPagesRoute() {
  "use strict";
  const location = window.location;
  const repoBase = "/rtliga";
  const path = location.pathname.replace(repoBase, "") + location.search;
  const encoded = path.replace(/&/g, "~and~");
  location.replace(
    `${location.protocol}//${location.hostname}${location.port ? `:${location.port}` : ""}${repoBase}/?p=${encoded}${location.hash}`,
  );
})();
