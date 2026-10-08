import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { palettes, defaultPaletteId, ICON_RELEASE } from "../src/utils/theme.js";
import { iconArtwork } from "./iconArtwork.mjs";

const publicDir = new URL("../public/", import.meta.url);
const template = JSON.parse(await readFile(new URL("site.webmanifest", publicDir), "utf8"));
for (const palette of palettes) {
  const base = `/icons/themes/${palette.id}`;
  const dir = new URL(`.${base}/`, publicDir);
  await mkdir(dir, { recursive: true });
  const svg = iconArtwork(palette);
  await writeFile(new URL("favicon.svg", dir), svg);
  for (const [name, size] of [["apple-touch-icon", 180], ["icon-192", 192], ["icon-512", 512], ["maskable-512", 512]]) {
    await sharp(Buffer.from(svg)).resize(size, size).flatten({ background: palette.themeColor }).png().toFile(fileURLToPath(new URL(`${name}.png`, dir)));
  }
  const manifest = {
    ...template, id: "/", start_url: "/", scope: "/",
    theme_color: palette.themeColor, background_color: palette.swatches[2],
    icons: [
      { src: `${base}/icon-192.png?v=${ICON_RELEASE}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png?v=${ICON_RELEASE}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/maskable-512.png?v=${ICON_RELEASE}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  await writeFile(new URL("site.webmanifest", dir), `${JSON.stringify(manifest, null, 2)}\n`);
  if (palette.id === defaultPaletteId) {
    await writeFile(new URL("favicon.svg", publicDir), svg);
    await writeFile(new URL("site.webmanifest", publicDir), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const [source, destination] of [
      ["apple-touch-icon", "apple-touch-icon.png"], ["apple-touch-icon", "icons/apple-touch-icon.png"],
      ["icon-192", "icons/icon-192.png"], ["icon-192", "icons/icon-192-maskable.png"],
      ["icon-192", "icons/android-chrome-192x192.png"], ["icon-512", "icons/icon-512.png"],
      ["icon-512", "icons/android-chrome-512x512.png"], ["maskable-512", "icons/maskable-512.png"],
    ]) await copyFile(new URL(`${source}.png`, dir), new URL(destination, publicDir));
    for (const size of [16, 32]) await sharp(Buffer.from(svg)).resize(size, size).flatten({ background: palette.themeColor }).png().toFile(fileURLToPath(new URL(`icons/favicon-${size}x${size}.png`, publicDir)));
    // ICO with a PNG-encoded 32x32 entry (supported by modern Windows/browsers).
    const png = await readFile(new URL("icons/favicon-32x32.png", publicDir));
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header[6] = 32; header[7] = 32;
    header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
    await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([header, png]));
  }
}
console.log(`Generated ${palettes.length} icon themes; all PNGs have opaque full canvases.`);
