import { useEffect, useState } from "react";
import { mediaEnabled } from "../../api/media";
import { t } from "../../i18n";
import { formatNumber } from "../../i18n/formatters";
import "./Media.css";
export function useMediaCapability() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void mediaEnabled(controller.signal).then(value => { if (!controller.signal.aborted) setEnabled(value); });
    return () => controller.abort();
  }, []);
  return enabled;
}
export function FilePreview({ file, index = 0 }: { file: File; index?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const object = URL.createObjectURL(file); setUrl(object); return () => URL.revokeObjectURL(object); }, [file]);
  if (!url) return null;
  return <figure className="media-file-preview">
    {file.type.startsWith("image/")
      ? <img className="media-thumb" src={url} alt={t("media.selectedImage", { number: formatNumber(index + 1) })} style={{ maxWidth: 160, maxHeight: 120 }} />
      : <video className="media-thumb" src={url} controls preload="metadata" aria-label={t("media.selectedVideo", { number: formatNumber(index + 1) })} />}
    <figcaption><bdi dir="auto">{file.name}</bdi></figcaption>
  </figure>;
}
export function MediaImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  useEffect(() => { setFailed(false); setRetried(false); }, [src]);
  if (failed) return <span className="media-unavailable">{t("media.unavailable")} {!retried && <button className="btn" type="button" onClick={() => { setRetried(true); setFailed(false); }}>{t("media.retry")}</button>}</span>;
  const source = retried && src.startsWith("http://127.0.0.1:4001/api/media/") ? `${src}?retry=1` : src;
  return <img src={source} alt={alt} className={className} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
