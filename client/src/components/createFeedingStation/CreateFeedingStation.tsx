import { isPostgresPreview } from "../../preview";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { uploadImages, validateImages, type ImageUploads } from "../../api/media";
import { FilePreview, useMediaCapability } from "../media/Media";
import { selectIsLoggedIn, selectToken } from "../../features/auth/authSelectors";
import { createFeedingStation } from "../../features/feedingStations/feedingStationsThunks";
import { selectStationCreating, selectStationCreateError } from "../../features/feedingStations/feedingStationsSelectors";
import { validateStationCreation } from "../../features/feedingStations/validateStationCreation";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
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
  const token = useAppSelector(selectToken);
  const mediaEnabled = useMediaCapability();
  const imageUploads = useRef<ImageUploads>(new WeakMap());
  const [progress, setProgress] = useState("");
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
    if (!location) { setError(t("stations.selectLocation")); return; }
    const data = {
      name, location,
      estimatedCats: cats.trim() ? Number(cats) : NaN,
      estimatedKittens: kittens.trim() ? Number(kittens) : NaN,
      notes: notes.trim() || undefined,
    };
    const validationError = validateStationCreation(data);
    if (validationError) { setError(localizeError(validationError, "station")); return; }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      let imageUrl = uploadedImage;
      let imageAssetId: string | undefined;
      if (image && isPostgresPreview) {
        if (!mediaEnabled) throw new Error("Image uploads are disabled in local preview.");
        [imageAssetId] = await uploadImages([image], "station", token, imageUploads.current, setProgress);
      } else if (image && !imageUrl) {
        const { uploadMedia } = await import("../../api/upload");
        [imageUrl] = await uploadMedia([image]);
        if (!imageUrl) throw new Error("Image upload did not return a URL. Please try again.");
        setUploadedImage(imageUrl);
      }
      const result = await dispatch(createFeedingStation({ ...data, ...(isPostgresPreview ? { imageAssetId } : { image: imageUrl }) }));
      if (createFeedingStation.fulfilled.match(result)) onCreated(result.payload);
    } catch (err) {
      setError(localizeError(err, "upload"));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="create-station-dialog" aria-labelledby="create-station-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
      <header><h2 id="create-station-title">{t("stations.add")}</h2>
        <button className="btn" type="button" disabled={pending} onClick={onCancel}>{t("stations.cancel")}</button>
      </header>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={pending || !authenticated}>
          <legend className="create-station-legend">{t("stations.information")}</legend>
          <p className="create-station-location">{location
            ? <>{t("stations.selectedLocation")} <bdi dir="ltr">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</bdi></>
            : t("stations.selectLocation")}</p>
          <button className="btn" type="button" onClick={onChangeLocation}>{t("stations.changeLocation")}</button>
          <label htmlFor="station-name">{t("stations.name")}</label>
          <input id="station-name" dir="auto" value={name} onChange={(event) => setName(event.target.value)} required />
          <div className="create-station-counts">
            <div><label htmlFor="station-cats">{t("stations.estimatedCats")}</label>
              <input id="station-cats" type="number" min="0" step="1" required value={cats} onChange={(event) => setCats(event.target.value)} /></div>
            <div><label htmlFor="station-kittens">{t("stations.estimatedKittens")}</label>
              <input id="station-kittens" type="number" min="0" step="1" required value={kittens} onChange={(event) => setKittens(event.target.value)} /></div>
          </div>
          <label htmlFor="station-notes">{t("stations.notes")}</label>
          <textarea id="station-notes" dir="auto" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <label htmlFor="station-image">{t(isPostgresPreview ? "stations.imagePreview" : "stations.imageLegacy")}</label>
          {isPostgresPreview && !mediaEnabled && <p>{t("stations.uploadsUnavailable")}</p>}
          <input disabled={isPostgresPreview && !mediaEnabled} id="station-image" type="file" accept={isPostgresPreview ? "image/jpeg,image/png,image/webp" : "image/*"} onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setUploadedImage(undefined);
            setImage(null);
            if (file && isPostgresPreview) {
              try { validateImages([file], "station"); } catch (error) { setError(localizeError(error, "upload")); event.target.value = ""; return; }
            }
            if (!isPostgresPreview && file && (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)) {
              setError(localizeError("Choose an image no larger than 25 MB.", "upload"));
              event.target.value = "";
              return;
            }
            setError(null);
            setImage(file);
          }} />
          {image && <FilePreview file={image} />}
          <button className="btn btn-brand" type="submit" disabled={!location}>
            {t(pending ? "stations.saving" : "stations.create")}
          </button>
        </fieldset>
        {pending && <p role="status">{progress || t(image && !uploadedImage ? "media.uploadingImage" : "stations.saving")}</p>}
        {(error || createError) && <p role="alert">{error || createError}</p>}
      </form>
    </dialog>
  );
}
