export type DeviceProfile = "desktop" | "mobile";

const STORAGE_KEY = "patriot_device_profile";

export function detectDevice(): DeviceProfile | null {
  const ua = navigator.userAgent;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobileUA =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (isMobileUA && hasTouch) return "mobile";
  if (!hasTouch && !isMobileUA) return "desktop";
  return null; // ambiguous (touchscreen laptop, tablet, etc.)
}

export function getStoredProfile(): DeviceProfile | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "desktop" || stored === "mobile") return stored;
  return null;
}

export function setStoredProfile(profile: DeviceProfile): void {
  localStorage.setItem(STORAGE_KEY, profile);
}

export function clearStoredProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
