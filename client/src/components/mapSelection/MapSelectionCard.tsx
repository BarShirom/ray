import type { ReactNode, Ref } from "react";
import { t } from "../../i18n";

/** In document flow below Leaflet: no modal semantics, overlay or focus trap. */
export default function MapSelectionCard({ kind, itemId, title, headingRef, expandRef, onClose, onExpand, children }: {
  kind: "report" | "station";
  itemId: string;
  title: string;
  headingRef: Ref<HTMLHeadingElement>;
  expandRef: Ref<HTMLButtonElement>;
  onClose: () => void;
  onExpand: () => void;
  children: ReactNode;
}) {
  return <section className="map-selection-card" role="region" aria-labelledby="map-selection-title"
    data-selection-kind={kind} data-selection-id={itemId}>
    <div className="map-selection-heading">
      <h3 id="map-selection-title" tabIndex={-1} ref={headingRef} dir="auto">{title}</h3>
      <button className="btn" type="button" data-selection-close="true" onClick={onClose}>{t("map.closeSelection")}</button>
    </div>
    {children}
    <button className="btn btn-brand" type="button" ref={expandRef} data-selection-expand="true" onClick={onExpand}>{t("map.fullDetails")}</button>
  </section>;
}
