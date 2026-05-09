'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { deleteHousePhotoAction, uploadHousePhotoAction } from '../actions';

const MAX_PHOTOS = 10;

export function HousePhotosEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: string[];
}): React.JSX.Element {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photos.length >= MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} foto.`);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.append('photo', file);
    startTransition(async () => {
      const r = await uploadHousePhotoAction(propertyId, formData);
      if (!r.ok) {
        setError(`Upload fallito: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
        return;
      }
      setPhotos((prev) => [...prev, r.url]);
      e.target.value = '';
    });
  }

  function handleDelete(url: string): void {
    setError(null);
    startTransition(async () => {
      const r = await deleteHousePhotoAction(propertyId, url);
      if (!r.ok) {
        setError(`Eliminazione fallita: ${r.reason}`);
        return;
      }
      setPhotos((prev) => prev.filter((u) => u !== url));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-soft">
        Foto della casa visibili in dashboard e nei messaggi guest. Max {MAX_PHOTOS}, JPG/PNG/WebP,
        10MB cad.
      </p>

      {error && (
        <div className="rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-body-sm text-terracotta-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url) => (
          <figure key={url} className="relative overflow-hidden rounded-card border border-line">
            <Image
              src={url}
              alt="Foto casa"
              width={400}
              height={300}
              className="h-32 w-full object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => handleDelete(url)}
              disabled={pending}
              className="absolute top-1 right-1 rounded-full bg-paper/90 px-2 py-0.5 text-xs text-terracotta-2 shadow disabled:opacity-60"
            >
              Rimuovi
            </button>
          </figure>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-line bg-paper text-body-sm text-ink-mute hover:border-terracotta">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              disabled={pending}
              className="sr-only"
            />
            <span className="text-2xl">📸</span>
            <span>{pending ? 'Caricamento…' : 'Aggiungi foto'}</span>
          </label>
        )}
      </div>

      <p className="text-body-sm text-ink-mute">
        {photos.length}/{MAX_PHOTOS} foto caricate
      </p>
    </div>
  );
}
