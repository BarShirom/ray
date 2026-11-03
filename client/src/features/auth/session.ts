export interface SessionSnapshot {
  id: string;
  actorId: string | null;
  token: string | null;
}

export interface SessionState {
  auth: {
    sessionId: string;
    user: { id: string; token: string } | null;
    loading: boolean;
  };
}

export const AUTHORITY_STORAGE_KEY = "ray:auth-authority";

/** A shared authority marker contains no credentials or account information. */
export function browserStorage(): Storage | null {
  try {
    if (typeof window !== "undefined") return window.localStorage;
    if (typeof self !== "undefined" && "localStorage" in self) return self.localStorage;
  } catch { /* Access can be blocked by browser privacy settings. */ }
  return null;
}

export function ownsBrowserAuthority(sessionId: string): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return typeof window === "undefined";
    const authority = storage.getItem(AUTHORITY_STORAGE_KEY);
    return authority === sessionId || (authority === null && typeof window === "undefined");
  } catch {
    return false;
  }
}

export function captureSession(state: SessionState): SessionSnapshot {
  return {
    id: state.auth.sessionId,
    actorId: state.auth.user?.id ?? null,
    token: state.auth.loading || !ownsBrowserAuthority(state.auth.sessionId)
      ? null : state.auth.user?.token ?? null,
  };
}

export function isSessionCurrent(state: SessionState, snapshot: SessionSnapshot): boolean {
  const current = captureSession(state);
  // Public Report work remains valid for a local guest even when another tab
  // owns an authenticated identity. A guest never borrows that tab's token.
  const publicGuest = snapshot.actorId === null && snapshot.token === null
    && state.auth.user === null && !state.auth.loading;
  return current.id === snapshot.id && current.actorId === snapshot.actorId
    && current.token === snapshot.token && (publicGuest || ownsBrowserAuthority(snapshot.id));
}
