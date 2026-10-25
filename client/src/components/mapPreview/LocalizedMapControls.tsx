import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { t } from "../../i18n";

export default function LocalizedMapControls() {
  const map = useMap();

  useEffect(() => {
    const control = L.control.zoom({
      position: "topleft",
      zoomInTitle: t("map.zoomIn"),
      zoomOutTitle: t("map.zoomOut"),
    }).addTo(map);
    return () => { control.remove(); };
  }, [map]);

  return null;
}
