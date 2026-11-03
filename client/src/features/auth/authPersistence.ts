import type { AuthState, User } from "./authSlice";
import { AUTHORITY_STORAGE_KEY } from "./session";

export const AUTH_STORAGE_KEY = "persist:root";
type Identity = { user: User | null; sessionId: string };
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function validUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<User>;
  return [user.id, user.token, user.firstName, user.lastName, user.email]
    .every((field) => typeof field === "string") && Boolean(user.id && user.token);
}

function identityFromEncoded(value: string): Identity | null {
  try {
    const decoded = JSON.parse(value) as { auth?: string };
    if (typeof decoded.auth !== "string") return null;
    const auth = JSON.parse(decoded.auth) as Partial<Identity>;
    if (typeof auth.sessionId !== "string") return null;
    if (auth.user !== null && !validUser(auth.user)) return null;
    return { user: auth.user ?? null, sessionId: auth.sessionId };
  } catch { return null; }
}

/** Only identity is persisted. Busy/error/request state and protected data never are. */
export function persistedIdentity(auth: AuthState): Identity {
  return { user: auth.user, sessionId: auth.sessionId };
}

export function createAuthPersistence(storage: StorageAccess | null) {
  let blocked = false;
  let logoutRecoveryOwners: Set<string | null> | null = null;
  const owns = (sessionId: string) => {
    try { return storage?.getItem(AUTHORITY_STORAGE_KEY) === sessionId; }
    catch { return false; }
  };

  const encode = (auth: AuthState) => JSON.stringify({
    auth: JSON.stringify(persistedIdentity(auth)),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  });
  const removeOwnedIdentity = (sessionIds: (string | null)[]) => {
    try {
      const marker = storage?.getItem(AUTHORITY_STORAGE_KEY) ?? null;
      if (sessionIds.includes(marker)) storage?.removeItem(AUTHORITY_STORAGE_KEY);
      const saved = storage?.getItem(AUTH_STORAGE_KEY);
      const identity = saved ? identityFromEncoded(saved) : null;
      if (!identity || sessionIds.includes(identity.sessionId)) storage?.removeItem(AUTH_STORAGE_KEY);
    } catch { /* Unavailable storage cannot become an authorization source. */ }
  };
  const publish = (auth: AuthState): boolean => {
    if (!storage) return false;
    let previousAuthority: string | null = null;
    blocked = false;
    try {
      previousAuthority = storage.getItem(AUTHORITY_STORAGE_KEY);
      // Synchronous writes establish authority before a thunk can finish. Later
      // redux-persist writes must prove this same authority and cannot resurrect A.
      storage.setItem(AUTHORITY_STORAGE_KEY, auth.sessionId);
      storage.setItem(AUTH_STORAGE_KEY, encode(auth));
      blocked = !owns(auth.sessionId);
      return !blocked;
    } catch {
      // Quota failure can still permit removal. Never intentionally leave old
      // credentials behind when the current intent cannot be recorded.
      blocked = true;
      removeOwnedIdentity([previousAuthority, auth.sessionId]);
      return false;
    }
  };

  return {
    owns,
    publish,
    matches(auth: AuthState): boolean {
      try {
        if (!storage || !owns(auth.sessionId)) return false;
        const value = storage.getItem(AUTH_STORAGE_KEY);
        const identity = value ? identityFromEncoded(value) : null;
        return identity?.sessionId === auth.sessionId && identity.user?.id === auth.user?.id
          && identity.user?.token === auth.user?.token;
      } catch { return false; }
    },
    publishLogout(auth: AuthState, previousSessionId: string, retry: boolean): "complete" | "failed" | "superseded" {
      // Recovery only observes external/site-data clearing. localStorage has no
      // cross-tab compare-and-swap: even a checked retry must never publish or
      // remove shared state, nor allow queued persistence to write afterward.
      if (retry) blocked = true;
      if (!retry) logoutRecoveryOwners = new Set([previousSessionId, null]);
      if (!storage || !logoutRecoveryOwners) return "failed";
      try {
        const marker = storage.getItem(AUTHORITY_STORAGE_KEY);
        const value = storage.getItem(AUTH_STORAGE_KEY);
        const identity = value ? identityFromEncoded(value) : null;
        // A foreign identity/intent supersedes this failed logout. These reads
        // are observations, not an exclusive claim over a concurrent publisher.
        if (!logoutRecoveryOwners.has(marker) || (identity && !logoutRecoveryOwners.has(identity.sessionId))) return "superseded";
        if (retry) {
          // Require both keys to be absent. An old authority marker alone can
          // still admit an older tab's queued identity write after root removal.
          if (marker !== null || value !== null) return "failed";
          logoutRecoveryOwners = null;
          return "complete";
        }
        if (value && !identity) return "failed";
        logoutRecoveryOwners.add(auth.sessionId);
        if (!publish(auth)) return "failed";
        logoutRecoveryOwners = null;
        return "complete";
      } catch { return "failed"; }
    },
    block: () => { blocked = true; },
    commit(auth: AuthState): boolean {
      if (blocked || !storage || !owns(auth.sessionId)) return false;
      try {
        // Authentication completion never advances authority. A newer tab's
        // intent wins even if it arrives between this read and identity write.
        storage.setItem(AUTH_STORAGE_KEY, encode(auth));
        return owns(auth.sessionId);
      } catch {
        blocked = true;
        removeOwnedIdentity([auth.sessionId]);
        return false;
      }
    },
    restore(value: unknown): Identity | null {
      if (!storage || !value || typeof value !== "object") return null;
      const auth = value as Partial<Identity>;
      if (!validUser(auth.user)) return null;
      try {
        const authority = storage.getItem(AUTHORITY_STORAGE_KEY);
        if (typeof auth.sessionId === "string") {
          return authority === auth.sessionId ? { user: auth.user, sessionId: auth.sessionId } : null;
        }
        // Pre-fencing storage has no provable ordering relative to other tabs.
        // Require authentication once rather than claim authority for old data.
        return null;
      } catch { return null; }
    },
    storage: {
      getItem(key: string): Promise<string | null> {
        try { return Promise.resolve(storage?.getItem(key) ?? null); }
        catch { return Promise.resolve(null); }
      },
      setItem(key: string, value: string): Promise<void> {
        const identity = identityFromEncoded(value);
        if (!blocked && storage && identity && owns(identity.sessionId)) {
          try { storage.setItem(key, value); } catch { /* Local state remains fail-closed. */ }
        }
        return Promise.resolve();
      },
      removeItem(key: string): Promise<void> {
        try { storage?.removeItem(key); } catch { /* No credential logging. */ }
        return Promise.resolve();
      },
    },
  };
}
