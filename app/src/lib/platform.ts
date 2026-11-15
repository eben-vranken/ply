// What the browser can do, where it differs between Android Chrome, Safari and desktop.

const ua = () => globalThis.navigator?.userAgent ?? '';

/** iPhone, iPad (iPadOS reports itself as a Mac with touch) */
export const isIOS = () => /iPad|iPhone|iPod/.test(ua()) || (/Macintosh/.test(ua()) && (globalThis.navigator?.maxTouchPoints ?? 0) > 1);
/** Safari on a Mac or any browser on iOS: all of them are WebKit with Safari's storage rules */
export const isWebKitStorage = () => isIOS() || (/Safari\//.test(ua()) && !/Chrome|Chromium|Edg\/|OPR\/|Android/.test(ua()));
/** opened from the Home Screen or Dock rather than in a browser tab */
export const isInstalled = () =>
  (globalThis.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches ?? false) || (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true;
/**
 * Safari deletes everything a website stored after 7 days without a visit, unless the site was added
 * to the Home Screen (or the Dock on a Mac). Ply keeps all progress on the device, so say so once.
 */
export const storageAtRisk = () => isWebKitStorage() && !isInstalled();
export const canVibrate = () => typeof globalThis.navigator?.vibrate === 'function';
