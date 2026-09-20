import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectIsLoggedIn } from "../../features/auth/authSelectors";
import { selectFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsSelectors";
import { createFeedingLog, fetchFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsThunks";
import type { FeedingPeriod } from "../../features/feedingLogs/types";
import type { FeedingStation } from "../../features/feedingStations/types";
import "./FeedingStationDetails.css";

export default function FeedingStationDetails({ station, onClose }: {
  station: FeedingStation;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector(selectIsLoggedIn);
  const { data: logs, loading, submitting, loadError, submitError } =
    useAppSelector((state) => selectFeedingLogsForStation(state, station._id));
  const dialog = useRef<HTMLDialogElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState<FeedingPeriod | "">("");
  const [food, setFood] = useState(true);
  const [water, setWater] = useState(false);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    dispatch(fetchFeedingLogsForStation(station._id));
  }, [dispatch, station._id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLoggedIn || !station.active || submitting) return;
    setSuccess(false);
    const result = await dispatch(createFeedingLog({
      stationId: station._id,
      data: { period: period || undefined, food, water, note: note.trim() || undefined },
    }));
    if (createFeedingLog.fulfilled.match(result)) {
      setSuccess(true);
      setShowForm(false);
      setPeriod("");
      setFood(true);
      setWater(false);
      setNote("");
    }
  };

  return (
    <dialog
      ref={dialog}
      className="station-details"
      aria-labelledby="station-details-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
    >
      <header className="station-details-header">
        <div>
          <small>Feeding station</small>
          <h2 id="station-details-title">{station.name}</h2>
        </div>
        <button type="button" className="btn" onClick={onClose} aria-label="Close station details">Close</button>
      </header>
      <div className="station-details-body">
        {station.image && <img className="station-details-image" src={station.image} alt={station.name} />}
        <p>Estimated cats: <strong>{station.estimatedCats}</strong> · Estimated kittens: <strong>{station.estimatedKittens}</strong></p>
        {station.notes && <p className="station-details-note">{station.notes}</p>}
        {logs[0] && <p>Most recent feeding: <time dateTime={logs[0].fedAt}>{new Date(logs[0].fedAt).toLocaleString()}</time></p>}

        {success && <p className="station-details-success" role="status">Feeding recorded. Thank you for caring for these cats!</p>}
        {!station.active ? <p>This station is inactive and cannot receive new feeding logs.</p> : !isLoggedIn ? (
          <p><Link to="/login">Log in</Link> or <Link to="/register">sign up</Link> to record that you fed here.</p>
        ) : !showForm ? (
          <button className="btn btn-brand" type="button" disabled={submitting} onClick={() => { setSuccess(false); setShowForm(true); }}>
            {submitting ? "Saving feeding..." : "I Fed Here"}
          </button>
        ) : (
          <form className="station-feeding-form" onSubmit={submit} aria-label="Record a feeding">
            <fieldset disabled={submitting}>
              <legend>Record a feeding</legend>
              <label htmlFor="feeding-period">Time of day (optional)</label>
              <select id="feeding-period" value={period} onChange={(event) => setPeriod(event.target.value as FeedingPeriod | "")}>
                <option value="">Not specified</option>
                <option value="morning">Morning</option>
                <option value="noon">Noon</option>
                <option value="evening">Evening</option>
              </select>
              <div className="station-feeding-options">
                <label><input type="checkbox" checked={food} onChange={(event) => setFood(event.target.checked)} /> Food</label>
                <label><input type="checkbox" checked={water} onChange={(event) => setWater(event.target.checked)} /> Water</label>
              </div>
              <label htmlFor="feeding-note">Note (optional)</label>
              <textarea id="feeding-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              <div className="station-feeding-actions">
                <button className="btn btn-brand" type="submit">{submitting ? "Saving feeding..." : "Save feeding"}</button>
                <button className="btn" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </fieldset>
            {submitting && <p role="status">Saving your feeding...</p>}
            {submitError && <p role="alert">{submitError}</p>}
          </form>
        )}

        <section className="station-feeding-history" aria-labelledby="feeding-history-title">
          <h3 id="feeding-history-title">Recent feeding history</h3>
          {loading && <p role="status">Loading feeding history...</p>}
          {loadError && <div role="alert"><p>{loadError}</p><button className="btn" type="button" onClick={() => dispatch(fetchFeedingLogsForStation(station._id))}>Retry history</button></div>}
          {!loading && !loadError && logs.length === 0 && <p>No feedings recorded yet.</p>}
          <ul>
            {logs.slice(0, 10).map((log) => (
              <li key={log._id}>
                <time dateTime={log.fedAt}>{new Date(log.fedAt).toLocaleString()}</time>
                {log.period && <span className="station-feeding-period"> · {log.period}</span>}
                <p>Food: {log.food ? "Yes" : "No"} · Water: {log.water ? "Yes" : "No"}</p>
                {log.note && <p className="station-details-note">{log.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </dialog>
  );
}
