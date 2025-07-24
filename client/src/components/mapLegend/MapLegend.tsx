import "./MapLegend.css"

const MapLegend = () => {
  return (
    <div className="map-legend">
      <h4>🗺️ Legend</h4>
      <div className="legend-item">
        <img src="/icons/marker-icon-red.png" alt="Red marker" />
        Emergency (new)
      </div>
      <div className="legend-item">
        <img src="/icons/marker-icon-green.png" alt="Green marker" />
        Food given (new)
      </div>
      <div className="legend-item">
        <img src="/icons/marker-icon-yellow.png" alt="Yellow marker" />
        General (new)
      </div>
      <div className="legend-item">
        <img src="/icons/marker-icon-blue.png" alt="Blue marker" />
        In progress
      </div>
      <div className="legend-item">
        <img src="/icons/marker-icon-grey.png" alt="Gray marker" />
        Resolved
      </div>
    </div>
  );
};

export default MapLegend;
