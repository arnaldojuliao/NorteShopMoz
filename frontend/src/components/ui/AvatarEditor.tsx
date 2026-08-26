"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Camera, ImagePlus, RotateCcw, Trash2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const MAX_FILE_MB = 8;

/**
 * Editor de foto de perfil: escolher imagem, arrastar para posicionar,
 * aproximar/afastar e guardar recortada (círculo → quadrado 512px, data URL).
 *
 * Deve ser montado apenas quando aberto (ex.: `{open && <AvatarEditor …/>}`),
 * para que cada abertura comece com o estado reposto.
 */
export function AvatarEditor({
  onClose,
  current,
  onSave,
  onRemove,
}: {
  onClose: () => void;
  current?: string | null;
  onSave: (dataUrl: string) => void;
  onRemove?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(current ?? null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; pos: { x: number; y: number } } | null>(null);

  /** Carrega uma data URL para o elemento <img> (assíncrono → setState em callback). */
  const loadDataUrl = useCallback((dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = dataUrl;
  }, []);

  // Foto atual (se houver) fica pronta a ajustar logo ao abrir.
  useEffect(() => {
    if (current) loadDataUrl(current);
  }, [current, loadDataUrl]);

  // Tamanho real (px) da área de recorte — usado no cálculo do recorte.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setSize(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Escolha um ficheiro de imagem (JPG, PNG, WebP…).");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Imagem demasiado grande (máx. ${MAX_FILE_MB} MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setSrc(dataUrl);
      setZoom(1);
      setPos({ x: 0, y: 0 });
      setError(null);
      loadDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  /** Limita a posição para a imagem cobrir sempre o círculo. */
  const clampedPos = (p: { x: number; y: number }, z: number) => {
    if (!imgDims || !size) return p;
    const scale = Math.max(size / imgDims.w, size / imgDims.h) * z;
    const w = imgDims.w * scale;
    const h = imgDims.h * scale;
    const maxX = Math.max(0, (w - size) / 2);
    const maxY = Math.max(0, (h - size) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!src) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, pos };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPos(clampedPos({ x: drag.pos.x + dx, y: drag.pos.y + dy }, zoom));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const changeZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setZoom(z);
    setPos((p) => clampedPos(p, z));
  };

  const reset = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  // Zoom com roda do rato (listener nativo, não-passivo para permitir preventDefault).
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !src) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      changeZoom(zoom - e.deltaY * 0.002);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, zoom, imgDims, size]);

  const save = () => {
    const img = imgRef.current;
    if (!img || !imgDims || !size) return;
    const scale = Math.max(size / imgDims.w, size / imgDims.h) * zoom;
    const dispW = imgDims.w * scale;
    const dispH = imgDims.h * scale;
    const left = size / 2 + pos.x - dispW / 2;
    const top = size / 2 + pos.y - dispH / 2;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      img,
      left / scale,
      top / scale,
      size / scale,
      size / scale,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    onSave(canvas.toDataURL("image/webp", 0.9));
    onClose();
  };

  const canReset = zoom > MIN_ZOOM || pos.x !== 0 || pos.y !== 0;

  // Posição/dimensões exibidas (já limitadas para cobrir o círculo).
  const shown = (() => {
    if (!imgDims || !size) return null;
    const p = clampedPos(pos, zoom);
    const scale = Math.max(size / imgDims.w, size / imgDims.h) * zoom;
    const w = imgDims.w * scale;
    const h = imgDims.h * scale;
    return { w, h, left: size / 2 + p.x - w / 2, top: size / 2 + p.y - h / 2 };
  })();

  return (
    <Modal open onClose={onClose} title="Foto de perfil">
      <div className="space-y-5">
        {/* Área de recorte (círculo) */}
        <div className="relative mx-auto size-60 sm:size-72">
          <div
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute inset-0 cursor-move touch-none overflow-hidden rounded-full bg-slate-100 shadow-inner select-none"
          >
            {src && shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL local
              <img
                src={src}
                alt="Pré-visualização da foto"
                draggable={false}
                className="absolute max-w-none select-none"
                style={{
                  width: shown.w,
                  height: shown.h,
                  left: shown.left,
                  top: shown.top,
                }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                <Camera className="size-10" strokeWidth={1.5} aria-hidden />
                <p className="px-8 text-center text-xs font-medium">
                  Escolha uma foto para começar
                </p>
              </div>
            )}
            <div
              className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-white"
              aria-hidden
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">
            {error}
          </p>
        )}

        {/* Ajustes */}
        {src && (
          <div className="space-y-2.5">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <ZoomIn className="size-4 text-primary-600" aria-hidden />
              <span className="w-24 shrink-0">Aproximar</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => changeZoom(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary-600"
                aria-label="Aproximar/afastar a foto"
              />
            </label>
            <p className="text-center text-xs text-slate-400">
              Arraste a foto para a posicionar · use a roda do rato para aproximar
            </p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
            e.currentTarget.value = "";
          }}
        />

        {/* Ações */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" /> {src ? "Trocar foto" : "Escolher foto"}
            </Button>
            {canReset && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-4" /> Repor
              </Button>
            )}
            {current && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
              >
                <Trash2 className="size-4" /> Remover
              </Button>
            )}
          </div>
          <Button type="button" size="sm" disabled={!src} onClick={save}>
            Guardar foto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
