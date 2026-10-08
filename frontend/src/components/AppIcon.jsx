import { HeartHandshake } from "lucide-react";
import { useState } from "react";
import { getPaletteAssets } from "../utils/theme";

export default function AppIcon({ paletteId, className = "h-12 w-12" }) {
  const src = getPaletteAssets(paletteId).icon;
  const [failedSource, setFailedSource] = useState("");
  if (failedSource === src) return <HeartHandshake aria-hidden="true" className={`${className} text-blush`} />;
  return <img src={src} alt="" aria-hidden="true" width="192" height="192" className={`${className} shrink-0 rounded-[28%] object-contain`} onError={() => setFailedSource(src)} />;
}
