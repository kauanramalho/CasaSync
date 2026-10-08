import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { applyPalette, getPaletteAssets, palettes } from "../src/utils/theme.js";

for (const palette of palettes) {
  test(`${palette.id}: real opaque icon, centered mark and stable PWA identity`, async () => {
    const dir = new URL(`../public/icons/themes/${palette.id}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("site.webmanifest", dir), "utf8"));
    assert.equal(manifest.id, "/"); assert.equal(manifest.start_url, "/"); assert.equal(manifest.scope, "/");
    assert.equal(manifest.theme_color, palette.themeColor);
    for (const [filename, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512]]) {
      const path = new URL(filename, dir);
      const metadata = await sharp(await readFile(path)).metadata();
      assert.equal(metadata.width, size); assert.equal(metadata.height, size);
      assert.equal(metadata.hasAlpha, false, `${filename} must be opaque for iOS`);
      const { data, info } = await sharp(await readFile(path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const background = (palette.dark ? palette.swatches[2] : palette.themeColor).slice(1).match(/../g).map((v) => parseInt(v, 16));
      let mark = 0;
      for (let y = Math.floor(size * .2); y < size * .8; y++) for (let x = Math.floor(size * .2); x < size * .8; x++) {
        const offset = (y * size + x) * info.channels;
        if (background.some((channel, c) => Math.abs(data[offset + c] - channel) > 80)) mark++;
      }
      assert.ok(mark > size * size * .05, `${filename}: missing/cropped/blank center (${mark} pixels)`);
    }
    for (const icon of manifest.icons) {
      const file = new URL(`../public${icon.src.split("?")[0]}`, import.meta.url);
      const metadata = await sharp(await readFile(file)).metadata();
      assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
    }
  });
}
test("Apple discovery fallback is a real opaque PNG, not a blank screenshot", async () => {
  const root = await readFile(new URL("../public/apple-touch-icon.png", import.meta.url));
  assert.deepEqual(root, await readFile(new URL("../public/icons/themes/professional-blue/apple-touch-icon.png", import.meta.url)));
  assert.deepEqual(root, await readFile(new URL("../public/icons/apple-touch-icon.png", import.meta.url)));
});
test("theme selection switches install metadata and tab icons, with safe unknown ID fallback", () => {
  const links = new Map(["apple-touch-icon", "manifest", "icon", "alternate icon"].map((rel) => [rel, { type: rel === "icon" ? "image/svg+xml" : "", attrs: {}, getAttribute(name) { return this[name]; }, setAttribute(name, value) { this.attrs[name] = value; } }]));
  globalThis.document = { documentElement: { dataset: {}, style: {} }, querySelector: (selector) => links.get(selector.match(/rel="([^"]+)"/)?.[1]), querySelectorAll: () => [links.get("icon"), links.get("alternate icon")] };
  try {
    for (const palette of palettes) {
      applyPalette(palette.id);
      const paths = getPaletteAssets(palette.id);
      assert.equal(links.get("apple-touch-icon").attrs.href, paths.apple);
      assert.equal(links.get("manifest").attrs.href, paths.manifest);
      assert.equal(links.get("icon").attrs.href, paths.favicon);
      assert.equal(links.get("alternate icon").attrs.href, paths.icon);
    }
    assert.match(getPaletteAssets("../../bad").icon, /professional-blue/);
  } finally { delete globalThis.document; }
});
