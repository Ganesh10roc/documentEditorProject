/**
 * Connectivity signal. Wraps navigator.onLine plus the online/offline events,
 * exposing a subscribe API. The sync engine listens to flip between offline
 * queuing and active flushing the instant the network resolves.
 *
 * navigator.onLine is a hint, not a guarantee (it only reflects the OS network
 * interface state), so the sync engine also treats a failed fetch as "offline"
 * and a successful one as "online" — this module is the fast-path signal.
 */
type Listener = (online: boolean) => void;

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function onConnectivityChange(listener: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  const handleOnline = () => listener(true);
  const handleOffline = () => listener(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
