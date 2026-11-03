import { useEffect, useRef, useState } from "react";
import { useStore } from "react-redux";
import { useAppSelector } from "../../app/hooks";
import type { RootState } from "../../app/store";
import { beginStationImageLoad } from "../../api/media";
import { toApiFailure, type ApiFailure } from "../../api/errors";
import { invalidateSession } from "../../features/auth/authSlice";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import { selectSessionId } from "../../features/auth/authSelectors";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import { useApiRetryGate } from "../../api/useApiRetryGate";
import "./Media.css";

type ImageIdentity = { sessionId: string; source: string; attempt: number };
type Loaded = ImageIdentity & { url: string };
type Failure = ImageIdentity & { error: ApiFailure };

export function StationMediaImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const store = useStore<RootState>();
  const sessionId = useAppSelector(selectSessionId);
  const token = useAppSelector(state => state.auth.user?.token ?? "");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState<ImageIdentity | null>(null);
  const attempt = retry?.sessionId === sessionId && retry.source === src ? retry.attempt : 0;
  const [failure, setFailure] = useState<Failure | null>(null);
  const retryBlocked = useApiRetryGate(failure?.error);
  const dispose = useRef<(() => void) | null>(null);
  useEffect(() => {
    const session = captureSession(store.getState());
    if (!session || session.id !== sessionId) return;
    const current = () => isSessionCurrent(store.getState(), session);
    const identity = { sessionId, source: src, attempt };
    const task = beginStationImageLoad(src, token, current,
      url => setLoaded({ ...identity, url }),
      error => {
        if (!current()) return;
        const failure = toApiFailure(error, { context: "upload", sessionId, requestId: "station-image:" + attempt });
        if (failure.status === 401) store.dispatch(invalidateSession({ sessionId }));
        // Asset 404 is not evidence that the station parent disappeared.
        setFailure({ ...identity, error: failure });
      });
    dispose.current = task.dispose;
    return () => { task.dispose(); dispose.current = null; };
  }, [src, token, sessionId, attempt, store]);
  const matches = (value: ImageIdentity | null) => !!token && value?.sessionId === sessionId && value.source === src && value.attempt === attempt;
  if (!token) return <span className="media-unavailable">{t("media.unavailable")}</span>;
  if (matches(failure) && failure) return <span className="media-unavailable" role="status">
    {failure.error.kind === "rate-limit" ? localizeError(failure.error, "upload") : t("media.unavailable")}{" "}
    {attempt === 0 && <button className="btn" type="button" disabled={retryBlocked} onClick={() => setRetry({ sessionId, source: src, attempt: 1 })}>{t("media.retry")}</button>}
  </span>;
  if (matches(loaded) && loaded) return <img key={sessionId + ":" + src + ":" + attempt} src={loaded.url} alt={alt} className={className} referrerPolicy="no-referrer" onError={() => {
    dispose.current?.();
    setFailure({ sessionId, source: src, attempt, error: toApiFailure(new Error("Image unavailable"), { context: "upload", sessionId, requestId: "station-image:" + attempt }) });
  }} />;
  return <span role="status">{t("media.loading")}</span>;
}
