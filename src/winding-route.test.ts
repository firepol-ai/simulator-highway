import assert from "node:assert/strict";
import test from "node:test";
import { WindingRoute } from "./winding-route.ts";

for (const [width, height] of [
  [1440, 900],
  [390, 744],
  [320, 468],
  [844, 290],
]) {
  test(`winding circuit fits ${width}×${height} with continuous turns and closure`, () => {
    const route = new WindingRoute(width, height);
    assert.ok(route.rows >= 4 && route.rows % 2 === 0);
    let distance = 0;
    for (const segment of route.segments) {
      assert.ok(segment.length > 0);
      distance += segment.length;
      const before = route.pose(distance - 0.001);
      const after = route.pose(distance + 0.001);
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.003);
      assert.ok(Math.cos(after.angle - before.angle) > 0.999);
    }
    for (let d = 0; d < route.length; d += 2) {
      for (const offset of [-route.roadWidth / 2, route.roadWidth / 2]) {
        const p = route.pose(d, offset);
        assert.ok(
          p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height,
          JSON.stringify(p),
        );
      }
      const center = route.pose(d);
      const left = route.pose(d, -route.roadWidth / 4);
      // Cross product is negative for the driver's left in canvas coordinates.
      assert.ok(
        Math.cos(center.angle) * (left.y - center.y) -
          Math.sin(center.angle) * (left.x - center.x) <
          0,
      );
    }
    assert.deepEqual(route.pose(route.length), route.pose(0));
  });
}
