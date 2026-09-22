import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, ROAD_LENGTH, Simulation } from "./simulation.ts";

function advance(sim: Simulation, seconds: number): void {
  for (let i = 0; i < seconds * 10; i++) sim.step(0.1);
}

test("the blocker stays left until explicitly released", () => {
  const sim = new Simulation();
  advance(sim, 120);
  assert.equal(sim.phase, "blocking");
  assert.equal(sim.blocker.lane, 0);
  assert.ok(sim.blocker.speed * 3.6 <= DEFAULT_SETTINGS.blockerSpeed);
  assert.ok(sim.metrics.queue > 0);
});

test("releasing the blocker improves traffic against an identical blocked scenario", () => {
  const released = new Simulation();
  const blocked = new Simulation();
  advance(released, 60);
  advance(blocked, 60);
  released.release();
  advance(released, 60);
  advance(blocked, 60);
  assert.equal(released.phase, "clear");
  assert.equal(released.blocker.lane, 1);
  assert.ok(released.metrics.speed > blocked.metrics.speed + 3);
  assert.ok(released.metrics.queue < blocked.metrics.queue);
  assert.equal(blocked.phase, "blocking");
});

test("an immediate release waits until the adjacent truck can be passed safely", () => {
  const sim = new Simulation();
  sim.release();
  sim.step(0.1);
  assert.equal(sim.phase, "overtaking");
  assert.equal(sim.blocker.lane, 0);
  advance(sim, 60);
  assert.equal(sim.phase, "clear");
  assert.ok(sim.clearedTime! > 1);
});

test("dense traffic opens a safe gap for the signaling blocker", () => {
  const sim = new Simulation({
    speedLimit: 120,
    blockerSpeed: 120,
    overtakingExtra: 0,
    vehicleCount: 44,
  });
  advance(sim, 30);
  sim.release();
  advance(sim, 180);
  assert.equal(sim.phase, "clear");
});

test("cars stay finite, on the road, and separated at setting extremes", () => {
  for (const speedLimit of [60, 120]) {
    for (const vehicleCount of [12, 44]) {
      const sim = new Simulation({
        speedLimit,
        vehicleCount,
        blockerSpeed: 40,
        overtakingExtra: 30,
      });
      for (let i = 0; i < 1800; i++) {
        if (i === 600) sim.release();
        sim.step(0.1);
        for (const vehicle of sim.vehicles) {
          assert.ok(Number.isFinite(vehicle.speed) && vehicle.speed >= 0);
          assert.ok(vehicle.x >= 0 && vehicle.x < ROAD_LENGTH);
          assert.ok(
            (sim.leader(vehicle)?.gap ?? Infinity) >= 1,
            `overlap at ${sim.time}, vehicle ${vehicle.id}`,
          );
        }
      }
      assert.equal(sim.phase, "clear");
    }
  }
});

test("reset restores the scenario, metrics history, and intervention", () => {
  const sim = new Simulation();
  const initial = structuredClone(sim.vehicles);
  sim.release();
  advance(sim, 20);
  sim.reset();
  assert.deepEqual(sim.vehicles, initial);
  assert.equal(sim.time, 0);
  assert.equal(sim.phase, "blocking");
  assert.equal(sim.releaseTime, null);
  assert.equal(sim.clearedTime, null);
  assert.equal(sim.samples.length, 1);
});

test("playback substeps preserve the simulation at faster playback speeds", () => {
  const slow = new Simulation();
  const fast = new Simulation();
  for (let i = 0; i < 600; i++) slow.step(0.05);
  for (let i = 0; i < 60; i++) fast.step(0.5);
  for (let i = 0; i < slow.vehicles.length; i++) {
    assert.ok(Math.abs(slow.vehicles[i].x - fast.vehicles[i].x) < 0.001);
    assert.equal(slow.vehicles[i].lane, fast.vehicles[i].lane);
  }
});

test("settings reset vehicle count and speeds; chart history is bounded", () => {
  const sim = new Simulation();
  sim.configure({
    speedLimit: 100,
    blockerSpeed: 90,
    overtakingExtra: 20,
    vehicleCount: 12,
  });
  assert.equal(sim.vehicles.length, 12);
  assert.equal(sim.blocker.speed * 3.6, 90);
  advance(sim, 260);
  assert.equal(sim.samples.length, 240);
  assert.ok(sim.samples[0].time > 0);
});
