export const DEFAULT_STATION_VIEW = { center: [32.0853, 34.7818] as [number, number], zoom: 13 };

interface Camera {
  stop(): unknown;
  closePopup(): unknown;
  setView(center: [number, number], zoom: number, options: { animate: boolean }): unknown;
  fitBounds(bounds: [number, number][], options: { padding: [number, number]; maxZoom: number; animate: boolean }): unknown;
}

/** One controller per keyed Leaflet instance. A disposed epoch cannot re-fit. */
export function stationViewport(camera: Camera) {
  let fitted = false;
  let disposed = false;
  camera.stop();
  camera.closePopup();
  camera.setView(DEFAULT_STATION_VIEW.center, DEFAULT_STATION_VIEW.zoom, { animate: false });
  return {
    fit(stations: { location: { lat: number; lng: number } }[]) {
      if (disposed || fitted || !stations.length) return;
      camera.fitBounds(stations.map(station => [station.location.lat, station.location.lng]), {
        padding: [24, 24], maxZoom: 13, animate: false,
      });
      fitted = true;
    },
    // MapContainer removes the map before this child's passive cleanup. Leaflet
    // remove() already stops motion and removes layers/popups; public camera
    // methods such as stop() are unsafe once it has deleted the map pane.
    dispose() { disposed = true; },
  };
}
