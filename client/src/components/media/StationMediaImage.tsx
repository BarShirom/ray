import { useEffect, useState } from "react";
import { useAppSelector } from "../../app/hooks";
import { store } from "../../app/store";
import { loadStationImage } from "../../api/media";
import { t } from "../../i18n";
import "./Media.css";

type Loaded = { token: string; actor: string; source: string; attempt: number; url: string };

// Local image compatibility only. The wider auth-generation and station/map
// isolation work remains mandatory before frontend privacy acceptance.
export function StationMediaImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const identity = useAppSelector(state => state.auth.user);
  const token = identity?.token ?? "";
  const actor = identity?.id ?? "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<Loaded | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const current = () => {
      const user = store.getState().auth.user;
      return !controller.signal.aborted && user?.token === token && user?.id === actor;
    };
    if (token && actor) void loadStationImage(src, token, controller.signal, current).then(blob => {
      if (!current()) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ token, actor, source: src, attempt, url: objectUrl });
    }).catch(() => {
      if (current()) setFailure({ token, actor, source: src, attempt, url: "" });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, token, actor, attempt]);
  // Gate synchronously in render: a new identity never paints the previous
  // identity's decoded image while waiting for effect cleanup.
  const matches = (value: Loaded | null) => !!token && value?.token === token && value.actor === actor && value.source === src && value.attempt === attempt;
  if (!token || matches(failure)) return <span className="media-unavailable">{t("media.unavailable")} {token && attempt === 0 && <button className="btn" type="button" onClick={() => setAttempt(1)}>{t("media.retry")}</button>}</span>;
  if (matches(loaded) && loaded) return <img src={loaded.url} alt={alt} className={className} referrerPolicy="no-referrer" onError={() => setFailure({ ...loaded, url: "" })} />;
  return null;
}
