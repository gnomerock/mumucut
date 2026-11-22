(function () {
  try {
    var t = localStorage.getItem("theme") || "system";
    var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.mode = dark ? "dark" : "light";
  } catch (e) {}
})();
