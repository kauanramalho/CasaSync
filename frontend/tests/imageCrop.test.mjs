import assert from "node:assert/strict";
import test from "node:test";
import { cropGeometry, panCrop } from "../src/utils/imageCrop.js";

for (const [width, height] of [[1200, 600], [600, 1200], [800, 800]]) {
  test(`crop stays inside image ${width}x${height} at all edges`, () => {
    for (const zoom of [1, 2, 3]) for (const x of [-40, 0, 40]) for (const y of [-40, 0, 40]) {
      const result = cropGeometry(width, height, 512, 512, { zoom, x, y });
      assert.ok(result.dx <= 0 && result.dy <= 0);
      assert.ok(result.dx + result.drawWidth >= 512);
      assert.ok(result.dy + result.drawHeight >= 512);
      const preview = cropGeometry(width, height, 100, 100, { zoom, x, y });
      assert.ok(Math.abs(preview.dx / 100 - result.dx / 512) < 1e-10);
    }
  });
}
test("panning clamps at boundaries and ignores axes without overflow", () => {
  assert.deepEqual(panCrop({ zoom: 1, x: 0, y: 0 }, 500, 500, { shiftX: 50, shiftY: 0 }), { zoom: 1, x: 40, y: 0 });
});
