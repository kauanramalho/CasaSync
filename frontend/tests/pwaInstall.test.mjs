import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import test from "node:test";
import { getInstallGuide, getInstallPlatform, isStandalone, promptNativeInstall } from "../src/utils/pwaInstall.js";

test("identifies iPhone, iPad desktop mode, Android and desktop without confusing Macs", () => {
  assert.equal(getInstallPlatform({userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"}), "ios");
  assert.equal(getInstallPlatform({userAgent:"Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"}), "ios");
  assert.equal(getInstallPlatform({userAgent:"Mozilla/5.0 (Macintosh)",platform:"MacIntel",maxTouchPoints:5}), "ios");
  assert.equal(getInstallPlatform({platform:"MacIntel",maxTouchPoints:0}), "desktop");
  assert.equal(getInstallPlatform({userAgent:"Mozilla/5.0 (Linux; Android 14)"}), "android");
  assert.equal(getInstallPlatform(), "desktop");
});

test("recognizes installed iOS and manifest display modes without confusing browser tabs", () => {
  assert.equal(isStandalone({navigator:{standalone:true}}), true);
  for (const mode of ["standalone", "fullscreen"]) {
    assert.equal(isStandalone({matchMedia:(query)=>({matches:query===`(display-mode: ${mode})`})}), true);
  }
  assert.equal(isStandalone({navigator:{standalone:false},matchMedia:()=>({matches:false})}), false);
  assert.equal(isStandalone(), false);
});

test("iOS guide includes manual installation, missing action recovery, and first app login", () => {
  const guide=getInstallGuide("ios");
  assert.match(guide.steps.join(" "), /Safari.*Compartilhar.*Adicionar à Tela de Início.*Abrir como App da Web.*Manter sessão aberta/s);
  assert.match(guide.help, /Editar Ações/);
  assert.match(guide.note, /sessões separadas/);
});

test("native installer distinguishes accepted, dismissed, unavailable and errors", async () => {
  const calls=[];
  assert.equal(await promptNativeInstall({prompt:async()=>calls.push("prompt"), userChoice:Promise.resolve({outcome:"accepted"})}), "accepted");
  assert.deepEqual(calls,["prompt"]);
  assert.equal(await promptNativeInstall({prompt:async()=>{}, userChoice:Promise.resolve({outcome:"dismissed"})}), "dismissed");
  assert.equal(await promptNativeInstall(null), "unavailable");
  await assert.rejects(promptNativeInstall({prompt:async()=>{throw new Error("unavailable");}}));
});

test("manifest and Apple icon support home screen app with real PNG dimensions", () => {
  const manifest=JSON.parse(readFileSync(new URL("../public/site.webmanifest",import.meta.url),"utf8"));
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.id,"/");
  assert.equal(manifest.start_url,"/");
  assert.equal(manifest.scope,"/");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180"/);
  const png=readFileSync(new URL("../public/icons/apple-touch-icon.png",import.meta.url));
  assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16),180);
  assert.equal(png.readUInt32BE(20),180);
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(`../public${icon.src.split("?")[0]}`,import.meta.url)));
  }
});
