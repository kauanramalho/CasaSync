// Render the existing CasaSync HeartHandshake vector, never a browser screenshot.
// Full opaque canvas: iOS adds its own corner mask; the mark stays in the
// central 80% safe area required by maskable app icons.
export function iconArtwork(palette) {
  const background = palette.dark ? palette.swatches[2] : palette.themeColor;
  const surface = palette.dark ? palette.swatches[3] : "#ffffff";
  const highlight = palette.dark ? "#64748b" : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="${surface}"/><stop offset="1" stop-color="${background}"/></linearGradient>
    <linearGradient id="mark" x2="1" y2="1"><stop stop-color="${palette.swatches[0]}"/><stop offset="1" stop-color="${palette.swatches[1]}"/></linearGradient>
  </defs>
  <rect width="64" height="64" fill="${background}"/>
  <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#bg)"/>
  <rect x="6" y="6" width="52" height="52" rx="15" fill="none" stroke="${highlight}" stroke-opacity="0.55" stroke-width="1.25"/>
  <g transform="translate(12.8 12.8) scale(1.6)" fill="none" stroke="url(#mark)" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/>
    <path d="m18 15-2-2"/><path d="m15 18-2-2"/>
  </g>
</svg>`;
}
