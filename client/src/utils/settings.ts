export function getDebugFlag(flag: string): boolean {
  // Check URL query params
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === flag) return true;

  // Check localStorage
  if (localStorage.getItem(`patriot_debug_${flag}`) === "true") return true;

  return false;
}
