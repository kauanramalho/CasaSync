import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyInvite, shareFamilyInvite } from "../src/utils/familyInvite.js";

const invite = buildFamilyInvite({ name: "Família QA", invite_code: "ABC123" }, "QA", "https://example.com");
test("invite includes inviter, family, code and explicit app URL", () => {
  assert.match(invite.text, /QA convida/);
  assert.match(invite.text, /Família QA/);
  assert.match(invite.text, /ABC123/);
  assert.equal(invite.url, "https://example.com/familia");
});
test("native share includes public app image when supported", async () => {
  const image = {};
  let payload;
  assert.equal(await shareFamilyInvite(invite, image, { canShare: () => true, share: async (value) => { payload = value; } }), "shared");
  assert.deepEqual(payload.files, [image]);
});
test("unsupported files fall back to native text share", async () => {
  let payload;
  await shareFamilyInvite(invite, {}, { canShare: () => false, share: async (value) => { payload = value; } });
  assert.deepEqual(payload, invite);
});
test("no native sharing copies complete invite", async () => {
  let copied;
  assert.equal(await shareFamilyInvite(invite, null, { clipboard: { writeText: async (value) => { copied = value; } } }), "copied");
  assert.match(copied, /ABC123/);
  assert.match(copied, /https:\/\/example.com\/familia/);
});
test("unavailable clipboard fails explicitly", async () => {
  await assert.rejects(shareFamilyInvite(invite, null, {}), /indisponível/);
});
test("share cancellation is not converted into a second share", async () => {
  await assert.rejects(shareFamilyInvite(invite, null, { share: async () => { throw Object.assign(new Error(), { name: "AbortError" }); } }), { name: "AbortError" });
});
