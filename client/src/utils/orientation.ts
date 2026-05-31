export function setupOrientationEnforcement() {
  const warning = document.getElementById("orientation-warning");
  if (!warning) return;

  const isMobile =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    ("ontouchstart" in window && window.innerWidth < 1024);

  if (!isMobile) return;

  const update = () => {
    const portrait = window.innerHeight > window.innerWidth;
    warning.style.display = portrait ? "flex" : "none";
  };

  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 100));

  // Try to lock orientation (only works in fullscreen on most browsers)
  try {
    screen.orientation?.lock?.("landscape").catch(() => {});
  } catch {
    // Not supported — the rotate warning is sufficient
  }
}
