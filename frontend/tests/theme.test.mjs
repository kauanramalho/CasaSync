import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyPalette, defaultPaletteId, getPalette, getStoredPaletteId, palettes, persistPalette, THEME_STORAGE_KEY } from "../src/utils/theme.js";
import { categoryToneClasses, getCategorySemanticStyle } from "../src/utils/tasks.js";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const rgb = (value) => value.trim().split(/\s+/).map(Number);
const mix = (front, back, alpha) => front.map((v, i) => v * alpha + back[i] * (1 - alpha));
const luminance = (color) => color.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]));
}
function tokens(id) {
  const block = css.split(`[data-theme="${id}"] {`)[1]?.split("}")[0];
  assert.ok(block, `Missing CSS palette ${id}`);
  return variables(block);
}
const hex = (value) => rgb(value).map((v) => v.toString(16).padStart(2, "0")).join("");

test("category/calendar styles use validated semantic tones, never arbitrary pastel text", () => {
  for (const color of Object.keys(categoryToneClasses)) {
    const style = getCategorySemanticStyle({ color });
    assert.match(style.color, /^rgb\(var\(--tone-[a-z]+\)\)$/);
    assert.match(style.backgroundColor, /var\(--tone-opacity\)/);
  }
  assert.equal(getCategorySemanticStyle({ color: "unrecognized-value" }).color, "rgb(var(--tone-slate))");
  assert.equal(getCategorySemanticStyle({ color: "blush" }).color, "rgb(var(--tone-rose))");
  assert.equal(getCategorySemanticStyle({ color: "lavender" }).color, "rgb(var(--tone-violet))");
});

test("out-of-month calendar numbers keep the full readable muted token", () => {
  const block = css.split(".calendar-day-number-outside {")[1].split("}")[0];
  assert.match(block, /color: rgb\(var\(--color-muted\)\);/);
});

test("six distinct palettes preserve the existing IDs and add GPT graphite", () => {
  assert.equal(new Set(palettes.map((p) => p.id)).size, 6);
  assert.deepEqual(palettes.filter((p) => p.dark).map((p) => p.id), ["elegant-dark", "gpt-dark"]);
  assert.equal(getPalette("removed-or-corrupt-theme").id, defaultPaletteId);
  const graphite = tokens("gpt-dark");
  assert.equal(graphite["app-bg"], "#212121");
  for (const name of ["color-surface", "color-blush", "color-peach", "color-lavender"]) {
    assert.equal(new Set(rgb(graphite[name])).size, 1, `GPT ${name} must be neutral`);
  }
});

for (const palette of palettes) {
  test(`${palette.id}: text tokens stay readable on every primary surface`, () => {
    const t = tokens(palette.id);
    for (const fg of ["ink", "muted", "blush", "peach", "lavender"]) {
      for (const bg of ["surface", "surface-alt", "surface-soft"]) {
        const ratio = contrast(rgb(t[`color-${fg}`]), rgb(t[`color-${bg}`]));
        assert.ok(ratio >= 4.5, `${fg}/${bg}: ${ratio.toFixed(2)}`);
      }
    }
    for (const bg of ["surface", "surface-alt", "surface-soft"]) {
      const accent = rgb(t["color-blush"]);
      const ratio = contrast(accent, mix(accent, rgb(t[`color-${bg}`]), 0.15));
      assert.ok(ratio >= 4.5, `Accent on 15% tint/${bg}: ${ratio.toFixed(2)}`);
    }
    assert.equal(palette.swatches[0], `#${hex(t["color-blush"])}`);
    assert.equal(palette.swatches[1], `#${hex(t["color-peach"])}`);
    for (const bg of ["surface", "surface-alt"]) {
      assert.ok(contrast(rgb(t["color-control-border"]), rgb(t[`color-${bg}`])) >= 3, `Input border/${bg}`);
      assert.ok(contrast(rgb(t["color-focus"]), rgb(t[`color-${bg}`])) >= 3, `Focus indicator/${bg}`);
    }
  });
  test(`${palette.id}: the entire primary gradient supports its button text`, () => {
    const t = tokens(palette.id);
    for (let step = 0; step <= 20; step++) {
      const ratio = contrast(rgb(t["color-on-primary"]), mix(rgb(t["color-primary-from"]), rgb(t["color-primary-to"]), step / 20));
      assert.ok(ratio >= 4.5, `Gradient step ${step}: ${ratio.toFixed(2)}`);
      const hoverBackground = mix(rgb(t["color-primary-from"]), rgb(t["color-primary-to"]), step / 20).map((v) => Math.min(255, v * 1.05));
      const hoverText = rgb(t["color-on-primary"]).map((v) => Math.min(255, v * 1.05));
      assert.ok(contrast(hoverText, hoverBackground) >= 4.5, `Hovered gradient step ${step}`);
    }
  });
  test(`${palette.id}: semantic category/status tones contrast against their tinted backgrounds`, () => {
    const t = tokens(palette.id);
    const modeBlock = palette.dark ? css.split('[data-theme-mode="dark"] {')[1].split("}")[0] : css.split("/* Theme-independent meaning:")[1].split(":root {")[1].split("}")[0];
    const v = variables(modeBlock);
    for (const [key, value] of Object.entries(v).filter(([key]) => key.startsWith("tone-") && key !== "tone-opacity")) {
      const fg = rgb(value);
      for (const bg of ["surface", "surface-alt", "surface-soft"]) {
        const ratio = contrast(fg, mix(fg, rgb(t[`color-${bg}`]), Number(v["tone-opacity"])));
        assert.ok(ratio >= 4.5, `${key}/${bg}: ${ratio.toFixed(2)}`);
        const mutedRatio = contrast(rgb(t["color-muted"]), mix(fg, rgb(t[`color-${bg}`]), Number(v["tone-opacity"])));
        assert.ok(mutedRatio >= 4.5, `Muted on ${key}/${bg}: ${mutedRatio.toFixed(2)}`);
      }
    }
  });
}

test("palette application updates mode, native controls and browser/PWA chrome without changing storage", () => {
  let meta;
  globalThis.document = { documentElement: { dataset: {}, style: {} }, querySelector: (selector) => selector.startsWith("meta") ? ({ setAttribute: (_, value) => { meta = value; } }) : null, querySelectorAll: () => [] };
  try {
    assert.equal(applyPalette("gpt-dark"), "gpt-dark");
    assert.equal(document.documentElement.dataset.themeMode, "dark");
    assert.equal(document.documentElement.style.colorScheme, "dark");
    assert.equal(meta, "#212121");
    applyPalette("nature-green");
    assert.equal(document.documentElement.dataset.themeMode, "light");
    assert.equal(meta, "#f3fbf5");
  } finally { delete globalThis.document; }
});

test("stored themes survive reload; unavailable storage and SSR have safe fallbacks", () => {
  let stored = "gpt-dark";
  globalThis.window = { localStorage: { getItem: () => stored, setItem: (key, value) => { assert.equal(key, THEME_STORAGE_KEY); stored = value; } } };
  try {
    assert.equal(getStoredPaletteId(), "gpt-dark");
    assert.equal(persistPalette("modern-purple"), true);
    assert.equal(getStoredPaletteId(), "modern-purple");
    window.localStorage = { getItem: () => { throw Error("Storage restricted"); }, setItem: () => { throw Error("Storage restricted"); } };
    assert.equal(getStoredPaletteId(), defaultPaletteId);
    assert.equal(persistPalette("gpt-dark"), false);
  } finally { delete globalThis.window; }
  assert.equal(getStoredPaletteId(), defaultPaletteId);
  assert.equal(applyPalette("gpt-dark"), "gpt-dark");
});
