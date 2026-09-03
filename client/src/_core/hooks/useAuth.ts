import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const FORCE_LOGGED_OUT_KEY = "fdp-force-logged-out";
const FORCE_LOGGED_OUT_TTL_MS = 30000;

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const [forceLoggedOut, setForceLoggedOut] = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.sessionStorage.getItem(FORCE_LOGGED_OUT_KEY);
    if (!raw) return false;

    const markerTime = Number.parseInt(raw, 10);
    if (!Number.isFinite(markerTime)) {
      window.sessionStorage.removeItem(FORCE_LOGGED_OUT_KEY);
      return false;
    }

    const isFresh = Date.now() - markerTime < FORCE_LOGGED_OUT_TTL_MS;
    if (!isFresh) {
      window.sessionStorage.removeItem(FORCE_LOGGED_OUT_KEY);
    }
    return isFresh;
  });
  const syncBisPresenceMutation = trpc.auth.syncBisPresence.useMutation();
  const syncBisPresenceMutateAsync = syncBisPresenceMutation.mutateAsync;
  const syncInFlightRef = useRef(false);
  const bisPresenceSessionId = useMemo(() => {
    if (typeof window === "undefined") return "server";

    const storageKey = "fdp-bis-presence-session-id";
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const generated =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(storageKey, generated);
    return generated;
  }, []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const withLogoutMarker = useCallback((url: string) => {
    try {
      const target = new URL(url, window.location.origin);
      target.searchParams.set("loggedOut", Date.now().toString());
      return target.toString();
    } catch {
      return url;
    }
  }, []);

  const logout = useCallback(async () => {
    setForceLoggedOut(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(FORCE_LOGGED_OUT_KEY, Date.now().toString());
    }
    utils.auth.me.setData(undefined, null);

    try {
      if (meQuery.data) {
        void syncBisPresenceMutateAsync({
            sessionId: bisPresenceSessionId,
            online: false,
          })
          .catch((presenceError) => {
            console.warn("[BIS Presence] Failed to clear survey presence", presenceError);
          });
      }

      await logoutMutation.mutateAsync({
        sessionId: bisPresenceSessionId,
      });

      if (typeof window !== "undefined") {
        window.location.href = withLogoutMarker(getLoginUrl());
      }
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        if (typeof window !== "undefined") {
          window.location.href = withLogoutMarker(getLoginUrl());
        }
        return;
      }
      console.warn("[Auth] Logout mutation failed", error);
      if (typeof window !== "undefined") {
        window.location.href = withLogoutMarker(getLoginUrl());
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [
    bisPresenceSessionId,
    logoutMutation,
    meQuery.data,
    syncBisPresenceMutateAsync,
    utils,
    withLogoutMarker,
  ]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );

    if (forceLoggedOut) {
      return {
        user: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      };
    }

    return {
      user: meQuery.data ?? null,
      // Block UI only during initial auth load (or explicit logout),
      // not during normal background refetches.
      loading:
        meQuery.isLoading ||
        (!meQuery.data && meQuery.isFetching),
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    forceLoggedOut,
    meQuery.data,
    meQuery.error,
    meQuery.isFetching,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (forceLoggedOut) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (!meQuery.data && meQuery.isFetching) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    forceLoggedOut,
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.data,
    meQuery.isFetching,
    meQuery.isLoading,
    state.user,
  ]);

  useEffect(() => {
    if (!forceLoggedOut) return;
    if (!meQuery.data) return;

    setForceLoggedOut(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(FORCE_LOGGED_OUT_KEY);
    }
  }, [forceLoggedOut, meQuery.data]);

  useEffect(() => {
    if (forceLoggedOut) return;
    if (!state.user) return;

    let cancelled = false;
    const syncPresence = async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        await syncBisPresenceMutateAsync({
          sessionId: bisPresenceSessionId,
          online: true,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("[BIS Presence] Failed to sync survey presence", error);
        }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void syncPresence();
    const interval = window.setInterval(() => {
      void syncPresence();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bisPresenceSessionId, forceLoggedOut, state.user, syncBisPresenceMutateAsync]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
