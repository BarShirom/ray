import type L from "leaflet";
import { t } from "../../i18n";

export function localizePopupClose(popup: L.Popup) {
  const button = popup.getElement()?.querySelector<HTMLAnchorElement>(".leaflet-popup-close-button");
  if (button) {
    button.setAttribute("aria-label", t("map.closePopup"));
    button.title = t("map.closePopup");
  }
}
