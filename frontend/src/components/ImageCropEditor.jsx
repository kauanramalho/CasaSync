import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import Button from "./Button";
import useDialogFocus from "../hooks/useDialogFocus";
import { cropGeometry, panCrop } from "../utils/imageCrop";

export function cropPreviewStyle(dimensions, crop, ratio = 1) {
  const geometry = cropGeometry(dimensions.width, dimensions.height, 100, 100 / ratio, crop);
  return { width: `${geometry.drawWidth}%`, height: `${geometry.drawHeight * ratio}%`, left: `${geometry.dx}%`, top: `${geometry.dy * ratio}%`, maxWidth: "none" };
}

export default function ImageCropEditor({ url, dimensions, crop, onChange, onCancel, onConfirm, ratio = 1 }) {
  const dialogRef = useRef(null);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const close = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, true, close);
  const zoom = (value) => onChange((current) => ({ ...current, zoom: Math.max(1, Math.min(3, value)) }));
  function move(event) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const newDistance = Math.hypot(next.x - other.x, next.y - other.y);
      if (oldDistance > 0) onChange((current) => ({ ...current, zoom: Math.max(1, Math.min(3, current.zoom * newDistance / oldDistance)) }));
    } else {
      const rect = frameRef.current.getBoundingClientRect();
      onChange((current) => panCrop(current, next.x - previous.x, next.y - previous.y, cropGeometry(dimensions.width, dimensions.height, rect.width, rect.height, current)));
    }
    pointers.current.set(event.pointerId, next);
  }
  return createPortal(<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="crop-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[28px] bg-surface p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between"><h2 id="crop-title" className="section-title">Recortar foto</h2><button type="button" onClick={onCancel} aria-label="Cancelar recorte" className="grid h-11 w-11 place-items-center rounded-xl text-muted"><X /></button></div>
      <p className="mb-4 text-sm text-muted">Arraste para posicionar. Use dois dedos para ampliar ou os botões + e −. No teclado, use as setas.</p>
      <div ref={frameRef} tabIndex={0} role="group" aria-label="Área de recorte da foto" style={{ aspectRatio: ratio, touchAction: "none" }} className="relative w-full cursor-grab overflow-hidden rounded-2xl bg-slate-900 outline-none focus:ring-4 focus:ring-blush/30 active:cursor-grabbing"
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }} onPointerMove={move} onPointerUp={(event) => pointers.current.delete(event.pointerId)} onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
        onKeyDown={(event) => { const moves = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }; if (!moves[event.key]) return; event.preventDefault(); const [dx, dy] = moves[event.key]; onChange((current) => ({ ...current, x: Math.max(-40, Math.min(40, current.x + dx)), y: Math.max(-40, Math.min(40, current.y + dy)) })); }}>
        <img src={url} alt="Prévia do recorte" draggable={false} className="pointer-events-none absolute select-none" style={cropPreviewStyle(dimensions, crop, ratio)} />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, index) => <span key={index} className="border border-white/25" />)}</div>
      </div>
      <div className="my-4 flex items-center justify-center gap-3"><Button type="button" variant="secondary" onClick={() => zoom(crop.zoom - 0.2)} disabled={crop.zoom <= 1} aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></Button><span className="text-sm text-muted">{crop.zoom.toFixed(1)}×</span><Button type="button" variant="secondary" onClick={() => zoom(crop.zoom + 0.2)} disabled={crop.zoom >= 3} aria-label="Ampliar foto"><Plus className="h-4 w-4" /></Button><button type="button" onClick={() => onChange({ zoom: 1, x: 0, y: 0 })} aria-label="Centralizar foto" className="grid h-11 w-11 place-items-center rounded-xl text-muted"><RotateCcw className="h-4 w-4" /></button></div>
      <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="button" onClick={onConfirm}>Usar recorte</Button></div>
    </div>
  </div>, document.body);
}
