import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { uploadMedia } from "../../api/upload";
import { selectIsLoggedIn } from "../../features/auth/authSelectors";
import { createFeedingStation } from "../../features/feedingStations/feedingStationsThunks";
import { selectStationCreating, selectStationCreateError } from "../../features/feedingStations/feedingStationsSelectors";
import { validateStationCreation } from "../../features/feedingStations/validateStationCreation";
import type { FeedingStation } from "../../features/feedingStations/types";
import "./CreateFeedingStation.css";

export default function CreateFeedingStation({ open, location, onCancel, onChangeLocation, onCreated }: {
  open: boolean;
  location: FeedingStation["location"] | null;
  onCancel: () => void;
  onChangeLocation: () => void;
  onCreated: (station: FeedingStation) => void;
}) {
  const dispatch = useAppDispatch();
  const authenticated = useAppSelector(selectIsLoggedIn);
  const creating = useAppSelector(selectStationCreating);
  const createError = useAppSelector(selectStationCreateError);
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState("0");
  const [kittens, setKittens] = useState("0");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = busy || creating;

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!open) dialog.current?.close();
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authenticated || locked.current || creating) return;
    if (!location) { setError("Select a location on the map."); return; }
    const data = {
      name, location,
      estimatedCats: cats.trim() ? Number(cats) : NaN,
      estimatedKittens: kittens.trim() ? Number(kittens) : NaN,
      notes: notes.trim() || undefined,
    };
    const validationError = validateStationCreation(data);
    if (validationError) { setError(validationError); return; }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      let imageUrl = uploadedImage;
      if (image && !imageUrl) {
        [imageUrl] = await uploadMedia([image]);
        if (!imageUrl) throw new Error("Image upload did not return a URL. Please try again.");
        setUploadedImage(imageUrl);
      }
      const result = await dispatch(createFeedingStation({ ...data, image: imageUrl }));
      if (createFeedingStation.fulfilled.match(result)) onCreated(result.payload);
    } catch (err) {
      setError(axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message ?? err.message
        : err instanceof Error ? err.message : "Could not upload the image. Please try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="create-station-dialog" aria-labelledby="create-station-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
      <header><h2 id="create-station-title">Add Feeding Station</h2>
        <button className="btn" type="button" disabled={pending} onClick={onCancel}>Cancel</button>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={pending || !authenticated}>
          <legend className="create-station-legend">Station information</legend>
          <p className="create-station-location">{location
            ? `Location selected: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : "Select a location on the map."}</p>
          <button className="btn" type="button" onClick={onChangeLocation}>Change map location</button>
          <label htmlFor="station-name">Station name</label>
          <input id="station-name" value={name} onChange={(event) => setName(event.target.value)} required />
          <div className="create-station-counts">
            <div><label htmlFor="station-cats">Estimated cats</label>
              <input id="station-cats" type="number" min="0" step="1" required value={cats} onChange={(event) => setCats(event.target.value)} /></div>
            <div><label htmlFor="station-kittens">Estimated kittens</label>
              <input id="station-kittens" type="number" min="0" step="1" required value={kittens} onChange={(event) => setKittens(event.target.value)} /></div>
          </div>
          <label htmlFor="station-notes">Notes (optional)</label>
          <textarea id="station-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <label htmlFor="station-image">Image (optional, up to 25 MB)</label>
          <input id="station-image" type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setUploadedImage(undefined);
            setImage(null);
            if (file && (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)) {
              setError("Choose an image no larger than 25 MB.");
              event.target.value = "";
              return;
            }
            setError(null);
            setImage(file);
          }} />
          <button className="btn btn-brand" type="submit" disabled={!location || !name.trim()}>
            {pending ? "Saving station..." : "Create station"}
          </button>
        </fieldset>
        {pending && <p role="status">{image && !uploadedImage ? "Uploading image..." : "Saving station..."}</p>}
        {(error || createError) && <p role="alert">{error || createError}</p>}
      </form>
    </dialog>
  );
}
