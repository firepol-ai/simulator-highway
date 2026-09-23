import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  DEFAULT_ARCADE,
  ROAD_LENGTH,
  Simulation,
} from "./simulation.ts";

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
    fasterSpeed: 120,
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
        fasterSpeed: speedLimit + 30,
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

test("300 km/h targets remain independent and high-speed traffic stays separated", () => {
  for (const vehicleCount of [12, 44]) {
    for (const [fasterSpeed, blockerSpeed] of [
      [300, 75],
      [95, 300],
      [300, 300],
      [300, 40],
    ]) {
      const sim = new Simulation({
        speedLimit: 80,
        fasterSpeed,
        blockerSpeed,
        vehicleCount,
      });
      assert.equal(sim.blocker.desiredSpeed * 3.6, blockerSpeed);
      assert.ok(
        sim.vehicles
          .filter((vehicle) => vehicle.fast)
          .every(
            (vehicle) =>
              Math.abs(vehicle.desiredSpeed * 3.6 - fasterSpeed) < 1e-9,
          ),
      );
      for (let i = 0; i < 1800; i++) {
        if (i === 600) sim.release();
        sim.step(0.1);
        for (const vehicle of sim.vehicles) {
          assert.ok(
            Number.isFinite(vehicle.speed) &&
              vehicle.speed >= 0 &&
              vehicle.speed * 3.6 <= 300 + 1e-9,
          );
          assert.ok(vehicle.x >= 0 && vehicle.x < ROAD_LENGTH);
          // Allow floating-point roundoff at the model's one-metre minimum gap.
          assert.ok((sim.leader(vehicle)?.gap ?? Infinity) >= 1 - 1e-9);
        }
      }
      assert.equal(sim.phase, "clear");
    }
  }
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
    fasterSpeed: 120,
    vehicleCount: 12,
  });
  assert.equal(sim.vehicles.length, 12);
  assert.equal(sim.blocker.speed * 3.6, 90);
  advance(sim, 260);
  assert.equal(sim.samples.length, 240);
  assert.ok(sim.samples[0].time > 0);
});

test("arcade behavior is off by default", () => {
  const sim = new Simulation();
  advance(sim, 120);
  assert.deepEqual(sim.arcade, DEFAULT_ARCADE);
  assert.equal(sim.events.length, 0);
  assert.equal(sim.attack, null);
  assert.equal(sim.crash, null);
});

test("impatient drivers signal only when enabled and blocked", () => {
  const sim = new Simulation(undefined, { ...DEFAULT_ARCADE, signals: true });
  advance(sim, 30);
  assert.ok(sim.events.some((event) => event.kind === "horn"));
  sim.setArcade(DEFAULT_ARCADE);
  const count = sim.events.length;
  assert.ok(sim.vehicles.every((vehicle) => vehicle.signalUntil === 0));
  advance(sim, 30);
  assert.equal(sim.events.length, count);
  const free = new Simulation(
    { ...DEFAULT_SETTINGS, fasterSpeed: 80, blockerSpeed: 300 },
    { ...DEFAULT_ARCADE, signals: true },
  );
  advance(free, 2);
  assert.equal(free.events.length, 0);
});

test("random right-side passes return left after gaining position without overlap", () => {
  const sim = new Simulation(undefined, {
    ...DEFAULT_ARCADE,
    undertaking: true,
  });
  const started = new Set<number>();
  let completedPass = false;
  let lastEvent = 0;
  for (let i = 0; i < 2600; i++) {
    sim.step(0.1);
    for (const vehicle of sim.vehicles)
      assert.ok((sim.leader(vehicle)?.gap ?? Infinity) >= 1 - 1e-9);
    for (const event of sim.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      if (event.kind === "undertake") started.add(event.actorId);
      if (event.kind === "return") {
        assert.ok(started.has(event.actorId));
        const actor = sim.vehicles.find(
          (vehicle) => vehicle.id === event.actorId,
        )!;
        const target = sim.vehicles.find(
          (vehicle) => vehicle.id === event.targetId,
        )!;
        assert.equal(actor.lane, 0);
        if (
          target.lane === 0 &&
          (actor.x - target.x + ROAD_LENGTH) % ROAD_LENGTH < ROAD_LENGTH / 2
        )
          completedPass = true;
      }
    }
  }
  assert.ok(started.size > 0);
  assert.ok(completedPass);
});

test("horns and lights only address traffic in the left lane", () => {
  const sim = new Simulation(undefined, {
    ...DEFAULT_ARCADE,
    signals: true,
    undertaking: true,
  });
  let lastEvent = 0;
  let horns = 0;
  for (let i = 0; i < 1800; i++) {
    sim.step(0.1);
    for (const vehicle of sim.vehicles) {
      if (vehicle.lane === 1) assert.equal(vehicle.signalUntil, 0);
    }
    for (const event of sim.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      if (event.kind !== "horn") continue;
      horns++;
      assert.equal(
        sim.vehicles.find((vehicle) => vehicle.id === event.actorId)!.lane,
        0,
      );
      assert.equal(
        sim.vehicles.find((vehicle) => vehicle.id === event.targetId)!.lane,
        0,
      );
    }
  }
  assert.ok(horns > 0);
});

test("right-side passing starts only when the right lane is comparably fast", () => {
  for (const rightSpeed of [60, 88, 100]) {
    const sim = new Simulation(
      { ...DEFAULT_SETTINGS, blockerSpeed: 90 },
      { ...DEFAULT_ARCADE, undertaking: true },
    );
    const actor = sim.vehicles[2];
    const right = sim.vehicles[1];
    sim.vehicles = [sim.blocker, right, actor];
    Object.assign(sim.blocker, { x: 540, speed: 90 / 3.6 });
    Object.assign(actor, {
      x: 500,
      speed: 90 / 3.6,
      blockedFor: 5,
      cooldown: 0,
    });
    Object.assign(right, { x: 620, speed: rightSpeed / 3.6 });
    sim.step(1.05);
    assert.equal(
      sim.events.some((event) => event.kind === "undertake"),
      rightSpeed >= 88,
    );
  }
});

test("a right-side passer does not claim success when its target moves right", () => {
  const sim = new Simulation(undefined, {
    ...DEFAULT_ARCADE,
    undertaking: true,
  });
  const actor = sim.vehicles[2];
  Object.assign(actor, {
    lane: 1,
    visualLane: 1,
    passTarget: sim.blocker.id,
    cooldown: 0,
  });
  sim.blocker.lane = 1;
  sim.step(0.05);
  assert.equal(actor.passTarget, null);
  assert.equal(
    sim.events.some((event) => event.kind === "return"),
    false,
  );
});

for (const [option, attackKind] of [
  ["roadRage", "ram"],
  ["spyMode", "gun"],
] as const) {
  test(`${option} uses the following car and crashes the blocker off-road`, () => {
    const sim = new Simulation(undefined, {
      ...DEFAULT_ARCADE,
      [option]: true,
    });
    let sawAttack = false;
    for (let i = 0; i < 600 && !sim.crash; i++) {
      sim.step(0.1);
      if (sim.attack) {
        sawAttack = true;
        assert.equal(sim.attack.kind, attackKind);
        const actor = sim.vehicles.find(
          (vehicle) => vehicle.id === sim.attack!.actorId,
        )!;
        assert.equal(actor.lane, 0);
        assert.equal(sim.leader(actor)?.vehicle.id, sim.blocker.id);
      }
    }
    assert.ok(sawAttack);
    assert.equal(sim.phase, "crashed");
    assert.equal(sim.crash?.cause, attackKind);
    assert.equal(sim.blocker.crashed, true);
    assert.equal(sim.blocker.speed, 0);
    assert.ok(sim.events.some((event) => event.kind === "crash"));
    if (attackKind === "gun")
      assert.ok(
        sim.events.filter((event) => event.kind === "shot").length >= 3,
      );
    for (const vehicle of sim.vehicles.filter((vehicle) => !vehicle.crashed))
      assert.notEqual(sim.leader(vehicle)?.vehicle.id, sim.blocker.id);
    assert.ok(
      Math.abs(
        sim.metrics.flow -
          (sim.metrics.speed * (sim.vehicles.length - 1)) /
            (ROAD_LENGTH / 1000),
      ) < 1e-9,
    );
    const crash = structuredClone(sim.crash);
    advance(sim, 60);
    assert.deepEqual(sim.crash, crash);
    sim.reset();
    assert.equal(sim.crash, null);
    assert.equal(sim.attack, null);
    assert.equal(sim.events.length, 0);
    assert.ok(
      sim.vehicles.every(
        (vehicle) =>
          !vehicle.crashed &&
          vehicle.passTarget === null &&
          vehicle.blockedFor === 0,
      ),
    );
    assert.equal(sim.arcade[option], true);
    assert.equal(sim.phase, "blocking");
  });

  test(`${option} can be cancelled by disabling it or releasing the blocker`, () => {
    for (const release of [false, true]) {
      const sim = new Simulation(undefined, {
        ...DEFAULT_ARCADE,
        [option]: true,
      });
      for (let i = 0; i < 600 && !sim.attack; i++) sim.step(0.1);
      assert.ok(sim.attack);
      if (release) sim.release();
      else sim.setArcade(DEFAULT_ARCADE);
      assert.equal(sim.attack, null);
      advance(sim, 60);
      assert.equal(sim.crash, null);
    }
  });
}

test("arcade randomness replays after reset and event history stays bounded", () => {
  const sim = new Simulation(undefined, {
    undertaking: true,
    signals: true,
    roadRage: true,
    spyMode: true,
  });
  advance(sim, 60);
  const events = structuredClone(sim.events);
  const crash = structuredClone(sim.crash);
  assert.ok(crash);
  sim.reset();
  advance(sim, 60);
  assert.deepEqual(sim.events, events);
  assert.deepEqual(sim.crash, crash);
  advance(sim, 300);
  assert.ok(sim.events.length <= 40);
  assert.ok(sim.samples.length <= 240);
});

test("new blockers preserve wrecks and history across multiple crashes", () => {
  const sim = new Simulation(undefined, { ...DEFAULT_ARCADE, spyMode: true });
  assert.equal(sim.spawnBlocker(), false);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 1200 && !sim.crash; i++) sim.step(0.1);
    assert.ok(sim.crash);
    const victim = sim.blocker;
    const victimsPosition = victim.x;
    const time = sim.time;
    const history = structuredClone(sim.samples);
    const wrecks = structuredClone(sim.wrecks);
    assert.equal(wrecks.length, round + 1);
    assert.equal(sim.spawnBlocker(), true);
    assert.equal(sim.phase, "blocking");
    assert.equal(sim.time, time);
    assert.deepEqual(sim.samples, history);
    assert.deepEqual(sim.wrecks, wrecks);
    assert.equal(victim.crashed, true);
    assert.ok(sim.vehicles.includes(victim));
    assert.notEqual(sim.blocker.id, victim.id);
    assert.equal(sim.blocker.lane, 0);
    assert.equal(sim.blocker.desiredSpeed * 3.6, sim.settings.blockerSpeed);
    assert.equal(
      sim.vehicles.filter((vehicle) => !vehicle.crashed).length,
      sim.settings.vehicleCount,
    );
    assert.equal(
      new Set(sim.vehicles.map((vehicle) => vehicle.id)).size,
      sim.vehicles.length,
    );
    sim.step(0.1);
    assert.equal(victim.x, victimsPosition);
    assert.equal(victim.speed, 0);
    for (const vehicle of sim.vehicles.filter((vehicle) => !vehicle.crashed))
      assert.ok((sim.leader(vehicle)?.gap ?? Infinity) >= 1 - 1e-9);
  }
  sim.reset();
  assert.equal(sim.wrecks.length, 0);
  assert.equal(sim.vehicles.length, sim.settings.vehicleCount);
  assert.ok(sim.vehicles.every((vehicle) => !vehicle.crashed));
});

test("spawning waits rather than inserting a blocker into a full lane", () => {
  const sim = new Simulation(
    { ...DEFAULT_SETTINGS, vehicleCount: 44 },
    { ...DEFAULT_ARCADE, spyMode: true },
  );
  for (let i = 0; i < 1200 && !sim.crash; i++) sim.step(0.1);
  assert.ok(sim.crash);
  const traffic = sim.vehicles.filter((vehicle) => !vehicle.crashed);
  traffic.forEach((vehicle, index) =>
    Object.assign(vehicle, {
      lane: 0,
      speed: 300 / 3.6,
      x: (index * ROAD_LENGTH) / traffic.length,
    }),
  );
  const vehicles = structuredClone(sim.vehicles);
  assert.equal(sim.spawnBlocker(), false);
  assert.deepEqual(sim.vehicles, vehicles);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.wrecks.length, 1);
  assert.equal(sim.spawning, true);
  sim.reset();
  assert.equal(sim.spawning, false);
});

test("the same blocker can repeatedly clear and reoccupy without resetting traffic", () => {
  for (const vehicleCount of [12, 26, 44]) {
    const sim = new Simulation({ ...DEFAULT_SETTINGS, vehicleCount });
    const blocker = sim.blocker;
    for (let round = 0; round < 3; round++) {
      sim.release();
      for (let i = 0; i < 1800 && sim.phase !== "clear"; i++) sim.step(0.1);
      assert.equal(sim.phase, "clear");
      advance(sim, 20);
      const time = sim.time;
      const samples = sim.samples.length;
      sim.occupy();
      assert.equal(sim.phase, "returning");
      assert.equal(sim.blocker.lane, 1);
      for (let i = 0; i < 1800 && sim.phase !== "blocking"; i++) {
        sim.step(0.1);
        for (const vehicle of sim.vehicles)
          assert.ok((sim.leader(vehicle)?.gap ?? Infinity) >= 1 - 1e-9);
      }
      assert.equal(sim.phase, "blocking");
      sim.step(0.1);
      assert.equal(sim.blocker, blocker);
      assert.equal(sim.blocker.lane, 0);
      assert.equal(sim.blocker.desiredSpeed * 3.6, sim.settings.blockerSpeed);
      assert.equal(sim.vehicles.length, vehicleCount);
      assert.ok(sim.time > time);
      assert.ok(sim.samples.length >= Math.min(samples, 240));
    }
  }
});

test("lane requests can be reversed while a merge is pending", () => {
  const sim = new Simulation();
  sim.release();
  assert.equal(sim.phase, "overtaking");
  sim.occupy();
  assert.equal(sim.phase, "blocking");
  assert.equal(sim.time, 0);
  sim.release();
  for (let i = 0; i < 600 && sim.phase !== "clear"; i++) sim.step(0.1);
  assert.equal(sim.phase, "clear");
  sim.occupy();
  assert.equal(sim.phase, "returning");
  sim.release();
  assert.equal(sim.phase, "clear");
  assert.equal(sim.blocker.lane, 1);
});

test("six kilometre traffic stays separated and the blocker can clear and return", () => {
  const sim = new Simulation(
    { ...DEFAULT_SETTINGS, vehicleCount: 220 },
    DEFAULT_ARCADE,
    6000,
  );
  assert.equal(sim.vehicles.length, 220);
  assert.ok(sim.vehicles.some((v) => v.x > 5000));
  advance(sim, 30);
  sim.release();
  advance(sim, 120);
  assert.equal(sim.phase, "clear");
  sim.occupy();
  advance(sim, 90);
  assert.equal(sim.phase, "blocking");
  for (const lane of [0, 1]) {
    const cars = sim.vehicles
      .filter((v) => v.lane === lane)
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i],
        ahead = cars[(i + 1) % cars.length];
      assert.ok(car.x >= 0 && car.x < 6000 && Number.isFinite(car.speed));
      assert.ok(
        (ahead.x - car.x + 6000) % 6000 >= (ahead.length + car.length) / 2,
      );
    }
  }
  assert.equal(sim.metrics.flow, (sim.metrics.speed * sim.vehicles.length) / 6);
});

test("right-lane slow-driver speed and 300 km/h general limit are independent", () => {
  const sim = new Simulation({
    ...DEFAULT_SETTINGS,
    speedLimit: 300,
    rightLaneSpeed: 70,
    fasterSpeed: 300,
  });
  const trucks = sim.vehicles.filter((v) => v.kind === "truck");
  assert.ok(trucks.length > 0);
  assert.ok(trucks.every((v) => Math.abs(v.speed * 3.6 - 70) < 0.001));
  advance(sim, 60);
  assert.ok(trucks.every((v) => v.speed * 3.6 <= 70.001));
  assert.equal(sim.settings.speedLimit, 300);
  sim.configure({ ...sim.settings, rightLaneSpeed: 300 });
  assert.ok(
    sim.vehicles
      .filter((v) => v.kind === "truck")
      .every((v) => Math.abs(v.speed * 3.6 - 300) < 0.001),
  );
});

test("800-vehicle winding traffic opens a gap for a queued spawn and preserves its wreck", () => {
  const sim = new Simulation(
    { ...DEFAULT_SETTINGS, vehicleCount: 800 },
    { ...DEFAULT_ARCADE, spyMode: true },
    6000,
  );
  for (let i = 0; i < 600 && !sim.crash; i++) sim.step(0.1);
  assert.ok(sim.crash);
  const victim = sim.blocker;
  const wrecks = structuredClone(sim.wrecks);
  const requestedAt = sim.time;
  assert.equal(sim.spawnBlocker(), false);
  assert.equal(sim.spawning, true);
  for (let i = 0; i < 600 && sim.spawning; i++) sim.step(0.1);
  assert.equal(sim.spawning, false);
  assert.equal(sim.phase, "blocking");
  assert.ok(sim.time > requestedAt);
  assert.equal(sim.vehicles.filter((v) => !v.crashed).length, 800);
  assert.deepEqual(sim.wrecks, wrecks);
  assert.ok(sim.vehicles.includes(victim));
  assert.ok(victim.crashed);
  for (const car of sim.vehicles.filter((v) => !v.crashed)) {
    assert.ok(Number.isFinite(car.speed));
    assert.ok((sim.leader(car)?.gap ?? Infinity) >= 1 - 1e-8);
  }
  sim.reset();
  assert.equal(sim.spawning, false);
  assert.equal(sim.vehicles.length, 800);
});

test("indexed traffic matches the full neighbour scan through lane changes and arcade events", () => {
  class ReferenceSimulation extends Simulation {
    override leader(
      vehicle: Simulation["vehicles"][number],
      lane = vehicle.lane,
    ) {
      let result: ReturnType<Simulation["leader"]> = null;
      for (const other of this.vehicles) {
        if (other.crashed || other.id === vehicle.id || other.lane !== lane)
          continue;
        const gap =
          ((other.x - vehicle.x + this.roadLength) % this.roadLength) -
          (vehicle.length + other.length) / 2;
        if (!result || gap < result.gap) result = { vehicle: other, gap };
      }
      return result;
    }
  }
  const settings = { ...DEFAULT_SETTINGS, vehicleCount: 80 };
  const arcade = {
    undertaking: true,
    signals: true,
    roadRage: false,
    spyMode: true,
  };
  const indexed = new Simulation(settings, arcade, 6000);
  const reference = new ReferenceSimulation(settings, arcade, 6000);
  for (let i = 0; i < 600; i++) {
    indexed.step(0.1);
    reference.step(0.1);
    if (i === 300) {
      indexed.spawnBlocker();
      reference.spawnBlocker();
    }
    if (i === 400) {
      indexed.release();
      reference.release();
    }
  }
  assert.deepEqual(indexed.vehicles, reference.vehicles);
  assert.deepEqual(indexed.events, reference.events);
  assert.deepEqual(indexed.samples, reference.samples);
});

for (const roadLength of [1200, 6000]) {
  test(`${roadLength}m: drivers hold their targets until catching the blocker queue`, () => {
    const sim = new Simulation(DEFAULT_SETTINGS, DEFAULT_ARCADE, roadLength);
    const fast = sim.vehicles[2], regular = sim.vehicles[3];
    assert.equal(fast.fast, true);
    assert.equal(regular.fast, false);
    assert.ok(Math.abs(regular.desiredSpeed * 3.6 - sim.settings.speedLimit) < 1e-8);
    sim.vehicles = [sim.blocker, fast, regular];
    Object.assign(sim.blocker, { x: 600, cooldown: 1000 });
    Object.assign(fast, { x: 100, cooldown: 1000 });
    Object.assign(regular, { x: 300, cooldown: 1000 });
    advance(sim, 10);
    assert.ok(fast.speed * 3.6 > 134.9);
    assert.ok(regular.speed * 3.6 > 119.9);
    advance(sim, 150);
    assert.ok(fast.speed * 3.6 < 112);
    assert.ok(regular.speed * 3.6 < 112);
    assert.ok(sim.leader(fast)!.gap < 70);
    assert.ok(sim.leader(regular)!.gap < 70);
  });

  for (const initialLane of [0, 1] as const) {
    test(`${roadLength}m: faster drivers accelerate on the right and complete a real pass from lane ${initialLane}`, () => {
      const sim = new Simulation({ ...DEFAULT_SETTINGS, fasterSpeed: 180, blockerSpeed: 75 }, { ...DEFAULT_ARCADE, undertaking: true }, roadLength);
      const actor = sim.vehicles[2];
      sim.vehicles = [sim.blocker, actor];
      Object.assign(sim.blocker, { x: 500 });
      Object.assign(actor, { x: 450, speed: 75 / 3.6, lane: initialLane, visualLane: initialLane, blockedFor: 5, cooldown: 0 });
      let rightSpeed = 0;
      for (let i = 0; i < 1200 && !sim.events.some(e => e.kind === "return"); i++) {
        sim.step(0.05);
        if (actor.lane === 1) rightSpeed = Math.max(rightSpeed, actor.speed * 3.6);
        assert.ok((sim.leader(actor)?.gap ?? Infinity) >= 1 - 1e-8);
      }
      assert.ok(sim.events.some(e => e.kind === "undertake" && e.actorId === actor.id));
      assert.ok(sim.events.some(e => e.kind === "return" && e.actorId === actor.id));
      assert.ok(rightSpeed > 90, `right-lane speed ${rightSpeed}`);
      assert.equal(actor.lane, 0);
      const ahead = (actor.x - sim.blocker.x + roadLength) % roadLength;
      assert.ok(ahead > (actor.length + sim.blocker.length) / 2 + 8 && ahead < roadLength / 2);
    });
  }

  test(`${roadLength}m: ordinary drivers neither undertake nor signal`, () => {
    const sim = new Simulation({ ...DEFAULT_SETTINGS, blockerSpeed: 75 }, { ...DEFAULT_ARCADE, undertaking: true, signals: true }, roadLength);
    const ordinary = sim.vehicles[3];
    sim.vehicles = [sim.blocker, ordinary];
    Object.assign(sim.blocker, { x: 500 });
    Object.assign(ordinary, { x: 450, speed: 75 / 3.6, blockedFor: 10, cooldown: 1000 });
    advance(sim, 30);
    assert.equal(sim.events.filter(e => e.kind === "horn" || e.kind === "undertake").length, 0);
    assert.equal(ordinary.signalUntil, 0);
  });

  test(`${roadLength}m: a signalled ordinary driver yields safely but the blocker does not`, () => {
    const sim = new Simulation(DEFAULT_SETTINGS, { ...DEFAULT_ARCADE, signals: true }, roadLength);
    const actor = sim.vehicles[2], ordinary = sim.vehicles[3], truck = sim.vehicles[1];
    sim.vehicles = [sim.blocker, actor, ordinary, truck];
    Object.assign(sim.blocker, { x: 900 });
    Object.assign(actor, { x: 140, speed: 120 / 3.6, blockedFor: 10, cooldown: 1000 });
    Object.assign(ordinary, { x: 200, cooldown: 1000 });
    Object.assign(truck, { x: 300 });
    for (let i = 0; i < 400 && ordinary.lane === 0; i++) sim.step(0.05);
    assert.ok(sim.events.some(e => e.kind === "horn" && e.actorId === actor.id && e.targetId === ordinary.id));
    assert.equal(ordinary.lane, 1);
    assert.ok((sim.leader(ordinary)?.gap ?? Infinity) >= 15);
    assert.equal(sim.blocker.lane, 0);
    assert.equal(sim.blocker.yieldUntil, 0);
  });
}
