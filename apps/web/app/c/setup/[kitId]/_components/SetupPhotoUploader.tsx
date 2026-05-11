'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadKitSetupPhotoAction } from '../../../actions';

// Slice D — Setup photo uploader.
// Client-side resize (max 1280×1280, JPEG q=0.85) per ridurre upload payload.
// Camera nativa via <input type=file accept="image/*" capture="environment">.

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

export function SetupPhotoUploader({
  kitId,
  alreadyHasPhoto,
}: {
  kitId: string;
  alreadyHasPhoto: boolean;
}): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    try {
      const { blob, dataUrl } = await compressImage(f);
      setFile(blob);
      setPreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la lettura della foto');
    }
  }

  function handleSubmit(): void {
    if (!file) {
      setError('Scatta o seleziona prima una foto.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('photo', new File([file], 'setup.jpg', { type: 'image/jpeg' }));
      const r = await uploadKitSetupPhotoAction(kitId, fd);
      if (!r.ok) {
        setError(`Upload fallito: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
        return;
      }
      setCompleted(true);
    });
  }

  if (completed) {
    return (
      <section className="mt-6 rounded-card border border-ok/30 bg-line-soft p-6 text-center">
        <div className="text-4xl" aria-hidden>
          ✅
        </div>
        <p className="mt-3 text-body font-medium text-ok">Setup confermato</p>
        <p className="mt-1 text-body-sm text-ink-mute">
          Andrea riceve la notifica e il guest riceverà la foto la mattina del check-in.
        </p>
        <a
          href="/c/dashboard"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper hover:bg-terracotta-2"
        >
          Torna alla lista
        </a>
      </section>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-4">
      {alreadyHasPhoto && !preview && (
        <p className="rounded-card border border-line bg-paper px-3 py-2 text-body-sm text-ink-mute">
          Hai già caricato una foto. Caricando una nuova la sostituisci.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-body-sm text-terracotta-2">
          {error}
        </div>
      )}

      {preview ? (
        <figure className="flex flex-col gap-2">
          <img src={preview} alt="Anteprima setup" className="w-full rounded-card" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setFile(null);
              inputRef.current?.click();
            }}
            className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
          >
            Rifai foto
          </button>
        </figure>
      ) : (
        <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-line bg-paper text-body-sm text-ink-mute hover:border-terracotta">
          <span className="text-3xl">📸</span>
          <span className="mt-2">Tocca per scattare o caricare</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleSelect}
            className="sr-only"
          />
        </label>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md hover:bg-terracotta-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Caricamento…' : '✓ Setup completato'}
      </button>
    </section>
  );
}

async function compressImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const { width: w, height: h } = scaleSize(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Compressione fallita'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { blob, dataUrl: compressedDataUrl };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Immagine non caricabile'));
    img.src = src;
  });
}

function scaleSize(w: number, h: number, maxDim: number): { width: number; height: number } {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const ratio = w > h ? maxDim / w : maxDim / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
