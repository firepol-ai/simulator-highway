export interface Settings {
  speedLimit: number;
  blockerSpeed: number;
  fasterSpeed: number;
  vehicleCount: number;
  rightLaneSpeed?: number;
}

export interface Vehicle {
  id: number;
  x: number;
  lane: 0 | 1;
  visualLane: number;
  speed: number;
  desiredSpeed: number;
  length: number;
  cooldown: number;
  fast: boolean;
  kind: "car" | "truck" | "blocker";
  braking: boolean;
  color: string;
  blockedFor: number;
  signalUntil: number;
  yieldUntil: number;
  hornUntil: number;
  signalTarget: number | null;
  signalFlashes: number;
  nextSignal: number;
  passTarget: number | null;
  crashed: boolean;
}

export interface ArcadeOptions {
  undertaking: boolean;
  signals: boolean;
  roadRage: boolean;
  spyMode: boolean;
}

export const DEFAULT_ARCADE: ArcadeOptions = {
  undertaking: false,
  signals: false,
  roadRage: false,
  spyMode: false,
};

export interface TrafficEvent {
  id: number;
  time: number;
  kind:
    | "flash"
    | "horn"
    | "undertake"
    | "return"
    | "ram"
    | "shot"
    | "crash"
    | "spawn";
  actorId: number;
  targetId: number;
}

export interface Attack {
  actorId: number;
  kind: "ram" | "gun";
  startedAt: number;
  nextShot: number;
}

export interface Crash {
  vehicleId: number;
  time: number;
  x: number;
  lane: number;
  speed: number;
  cause: Attack["kind"];
}

export interface Sample {
  time: number;
  speed: number;
  queue: number;
}

export const DEFAULT_SETTINGS: Settings = {
  speedLimit: 120,
  blockerSpeed: 110,
  fasterSpeed: 135,
  vehicleCount: 26,
};

export const ROAD_LENGTH = 1200;
const COLORS = [
  "#e8e9df",
  "#95b9b0",
  "#aec0cc",
  "#d2bfa4",
  "#5c7e78",
  "#cad0d1",
];
const kmh = (value: number) => value / 3.6;

/** Illustrative car following on a periodic two-lane road. */
export class Simulation {
  settings: Settings;
  readonly roadLength: number;
  vehicles: Vehicle[] = [];
  time = 0;
  releaseTime: number | null = null;
  clearedTime: number | null = null;
  samples: Sample[] = [];
  arcade: ArcadeOptions;
  events: TrafficEvent[] = [];
  attack: Attack | null = null;
  crash: Crash | null = null;
  wrecks: Crash[] = [];
  private nextSample = 0;
  private nextBehaviorCheck = 1;
  private randomState = 42;
  private eventId = 0;
  // Valid only inside a substep; invalidate whenever lane membership changes.
  private indexedTraffic = false;
  private laneIndex: { lanes: Vehicle[][]; longest: number } | null = null;
  private spawnYieldId: number | null = null;
  private nextSpawnAttempt = 0;

  get spawning(): boolean {
    return this.spawnYieldId !== null;
  }

  private desiredLane: 0 | 1 = 0;

  constructor(
    settings: Settings = DEFAULT_SETTINGS,
    arcade: ArcadeOptions = DEFAULT_ARCADE,
    roadLength = ROAD_LENGTH,
  ) {
    this.roadLength = roadLength;
    this.settings = { ...settings };
    this.arcade = { ...arcade };
    this.reset();
  }

  get blocker(): Vehicle {
    return this.vehicles[0];
  }

  get phase(): "blocking" | "overtaking" | "clear" | "returning" | "crashed" {
    return this.crash
      ? "crashed"
      : this.desiredLane === 0
        ? this.blocker.lane === 0
          ? "blocking"
          : "returning"
        : this.blocker.lane === 1
          ? "clear"
          : "overtaking";
  }

  reset(): void {
    this.time = 0;
    this.releaseTime = null;
    this.clearedTime = null;
    this.samples = [];
    this.nextSample = 0;
    this.nextBehaviorCheck = 1;
    this.randomState = 42;
    this.eventId = 0;
    this.desiredLane = 0;
    this.events = [];
    this.attack = null;
    this.crash = null;
    this.wrecks = [];
    this.spawnYieldId = null;
    this.nextSpawnAttempt = 0;
    this.vehicles = [];
    const add = (
      x: number,
      lane: 0 | 1,
      kind: Vehicle["kind"],
      fast: boolean,
    ) => {
      const id = this.vehicles.length;
      const speed =
        kind === "blocker"
          ? this.settings.blockerSpeed
          : kind === "truck"
            ? (this.settings.rightLaneSpeed ?? this.settings.speedLimit - 12)
            : fast
              ? this.settings.fasterSpeed
              : this.settings.speedLimit;
      this.vehicles.push({
        id,
        x,
        lane,
        visualLane: lane,
        kind,
        fast,
        speed: kmh(speed),
        desiredSpeed: kmh(speed),
        length: kind === "truck" ? 12 : 4.6,
        cooldown: 3 + (id % 4),
        braking: false,
        color: COLORS[id % COLORS.length],
        blockedFor: 0,
        signalUntil: 0,
        yieldUntil: 0,
        hornUntil: 0,
        signalTarget: null,
        signalFlashes: 0,
        nextSignal: 0,
        passTarget: null,
        crashed: false,
      });
    };
    const blockerX = this.roadLength * 0.55;
    add(blockerX, 0, "blocker", false);
    add(blockerX + 5, 1, "truck", false);
    const leftCount = Math.round((this.settings.vehicleCount - 2) * 0.55);
    const rightCount = this.settings.vehicleCount - 2 - leftCount;
    for (let i = 0; i < leftCount; i++)
      add(
        (blockerX -
          60 -
          i * ((this.roadLength - 150) / leftCount) +
          this.roadLength) %
          this.roadLength,
        0,
        "car",
        i % 3 === 0,
      );
    for (let i = 0; i < rightCount; i++)
      add(
        (blockerX -
          70 -
          i * ((this.roadLength - 150) / rightCount) +
          this.roadLength) %
          this.roadLength,
        1,
        i === 5 || (this.roadLength > ROAD_LENGTH && i % 11 === 5)
          ? "truck"
          : "car",
        i % 3 === 0,
      );
    this.recordSample();
  }

  configure(settings: Settings): void {
    this.settings = { ...settings };
    this.reset();
  }

  release(): void {
    if (this.phase === "blocking" || this.phase === "returning") {
      this.desiredLane = 1;
      this.releaseTime = this.time;
      this.attack = null;
    }
  }

  occupy(): void {
    if (this.phase === "clear" || this.phase === "overtaking") {
      this.desiredLane = 0;
      this.clearedTime = null;
      this.blocker.cooldown = 0;
    }
  }

  spawnBlocker(): boolean {
    if (!this.crash) return false;
    const traffic = this.vehicles
      .filter((vehicle) => !vehicle.crashed && vehicle.lane === 0)
      .sort((a, b) => a.x - b.x);
    const next = {
      ...this.blocker,
      id: Math.max(...this.vehicles.map((vehicle) => vehicle.id)) + 1,
      lane: 0 as const,
      visualLane: 0,
      crashed: false,
      blockedFor: 0,
      signalUntil: 0,
      yieldUntil: 0,
      hornUntil: 0,
      signalTarget: null,
      signalFlashes: 0,
      nextSignal: 0,
      passTarget: null,
      cooldown: 3,
      braking: false,
      desiredSpeed: kmh(this.settings.blockerSpeed),
    };
    let placed = false;
    if (traffic.length === 0) {
      next.x = this.roadLength * 0.55;
      next.speed = next.desiredSpeed;
      placed = true;
    }
    const gaps = traffic
      .map((rear, index) => ({
        rear,
        front: traffic[(index + 1) % traffic.length],
        length:
          traffic.length === 1
            ? this.roadLength
            : this.distance(rear.x, traffic[(index + 1) % traffic.length].x),
      }))
      .sort((a, b) => b.length - a.length);
    for (const { rear, front, length } of gaps) {
      // Enter at the surrounding traffic's speed, then approach the target.
      next.speed = Math.min(next.desiredSpeed, rear.speed, front.speed);
      const rearSpace =
        (rear.length + next.length) / 2 +
        Math.max(
          15,
          rear.speed * 1.2 + Math.max(0, rear.speed - next.speed) * 2,
        );
      const frontSpace =
        (front.length + next.length) / 2 +
        Math.max(
          15,
          next.speed * 1.2 + Math.max(0, next.speed - front.speed) * 2,
        );
      if (length < rearSpace + frontSpace + 2) continue;
      next.x =
        (rear.x + rearSpace + (length - rearSpace - frontSpace) / 2) %
        this.roadLength;
      if (this.canMerge(next, 0)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Keep the request alive and open a real gap instead of inserting into traffic.
      this.spawnYieldId ??= gaps[0].rear.id;
      this.nextSpawnAttempt = this.time + 0.5;
      return false;
    }
    this.spawnYieldId = null;
    this.vehicles.unshift(next);
    this.desiredLane = 0;
    this.crash = null;
    this.releaseTime = null;
    this.clearedTime = null;
    this.attack = null;
    this.emit("spawn", next.id, next.id);
    return true;
  }

  setArcade(options: ArcadeOptions): void {
    this.arcade = { ...options };
    if (
      (this.attack?.kind === "ram" && !options.roadRage) ||
      (this.attack?.kind === "gun" && !options.spyMode)
    )
      this.attack = null;
    if (!options.signals)
      for (const vehicle of this.vehicles) {
        vehicle.signalUntil = vehicle.hornUntil = vehicle.yieldUntil = 0;
        vehicle.signalTarget = null;
        vehicle.signalFlashes = 0;
        vehicle.nextSignal = 0;
      }
  }

  private random(): number {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  private emit(
    kind: TrafficEvent["kind"],
    actorId: number,
    targetId = this.blocker.id,
  ): void {
    this.events.push({
      id: ++this.eventId,
      time: this.time,
      kind,
      actorId,
      targetId,
    });
    if (this.events.length > 40) this.events.shift();
  }

  private crashBlocker(): void {
    if (!this.attack || this.crash) return;
    this.crash = {
      vehicleId: this.blocker.id,
      time: this.time,
      x: this.blocker.x,
      lane: this.blocker.visualLane,
      speed: this.blocker.speed,
      cause: this.attack.kind,
    };
    this.wrecks.push(this.crash);
    this.blocker.crashed = true;
    this.blocker.speed = 0;
    this.emit("crash", this.attack.actorId);
    this.attack = null;
  }

  private hasRoomToPassRight(
    vehicle: Vehicle,
    left: NonNullable<ReturnType<Simulation["leader"]>>,
    right: ReturnType<Simulation["leader"]>,
  ): boolean {
    const relativeTarget = vehicle.desiredSpeed - left.vehicle.speed;
    if (relativeTarget <= kmh(2)) return false;
    if (!right) return true;
    // Estimate the space needed to accelerate past the entire target, including
    // clearance to return left. A slower truck far ahead need not veto the pass.
    const gain = left.gap + vehicle.length + left.vehicle.length + 8;
    const acceleration = 1.4;
    const relativeNow = vehicle.speed - left.vehicle.speed;
    const acceleratingFor =
      Math.max(0, vehicle.desiredSpeed - vehicle.speed) / acceleration;
    const gainWhileAccelerating =
      relativeNow * acceleratingFor + 0.5 * acceleration * acceleratingFor ** 2;
    const seconds =
      gain <= gainWhileAccelerating
        ? (-relativeNow +
            Math.sqrt(relativeNow ** 2 + 2 * acceleration * gain)) /
          acceleration
        : acceleratingFor + (gain - gainWhileAccelerating) / relativeTarget;
    const remaining =
      right.gap + (right.vehicle.speed - left.vehicle.speed) * seconds - gain;
    const closing = Math.max(0, vehicle.desiredSpeed - right.vehicle.speed);
    const reserve = Math.max(8, 4 + closing * 0.25 + closing ** 2 / 8);
    return remaining >= reserve;
  }

  private advanceArcade(dt: number): boolean {
    if (this.attack) {
      const actor = this.vehicles.find(
        (vehicle) => vehicle.id === this.attack!.actorId,
      )!;
      if (
        this.phase !== "blocking" ||
        this.leader(actor)?.vehicle.id !== this.blocker.id
      )
        this.attack = null;
    }
    const check = this.time >= this.nextBehaviorCheck;
    if (check) this.nextBehaviorCheck += 1;
    for (const vehicle of this.vehicles) {
      if (vehicle.kind !== "car" || vehicle.crashed) continue;
      const front = this.leader(vehicle);
      // A faster car already on the right may pass a slower left-lane leader
      // instead of braking behind that car's virtual no-passing constraint.
      if (
        check &&
        this.arcade.undertaking &&
        vehicle.fast &&
        vehicle.lane === 1 &&
        vehicle.passTarget === null &&
        vehicle.cooldown <= 0
      ) {
        const left = this.leader(vehicle, 0);
        if (
          left &&
          left.gap > 0 &&
          left.gap < 120 &&
          left.vehicle.speed < vehicle.desiredSpeed - kmh(5) &&
          this.hasRoomToPassRight(vehicle, left, front)
        ) {
          vehicle.passTarget = left.vehicle.id;
          vehicle.cooldown = 2;
          this.emit("undertake", vehicle.id, left.vehicle.id);
        }
      }
      const blocked =
        front &&
        front.gap < 100 &&
        vehicle.desiredSpeed - vehicle.speed > kmh(5);
      vehicle.blockedFor = blocked
        ? vehicle.blockedFor + dt
        : Math.max(0, vehicle.blockedFor - dt * 2);
      if (!check || !blocked) continue;
      if (
        !this.attack &&
        this.phase === "blocking" &&
        vehicle.lane === 0 &&
        front.vehicle.kind === "blocker" &&
        vehicle.blockedFor > 9 &&
        (this.arcade.roadRage || this.arcade.spyMode) &&
        this.random() < 0.5
      ) {
        const kind =
          this.arcade.spyMode && (!this.arcade.roadRage || this.random() < 0.5)
            ? "gun"
            : "ram";
        this.attack = {
          actorId: vehicle.id,
          kind,
          startedAt: this.time,
          nextShot: this.time,
        };
        if (kind === "ram") this.emit("ram", vehicle.id);
      }
      if (
        this.arcade.undertaking &&
        vehicle.fast &&
        vehicle.id !== this.spawnYieldId &&
        !this.attack &&
        vehicle.lane === 0 &&
        vehicle.cooldown <= 0 &&
        vehicle.passTarget === null &&
        vehicle.blockedFor > 1.5 &&
        this.random() < 0.8 &&
        this.canMerge(vehicle, 1, true)
      ) {
        const right = this.leader(vehicle, 1);
        if (this.hasRoomToPassRight(vehicle, front, right)) {
          vehicle.passTarget = front.vehicle.id;
          vehicle.lane = 1;
          vehicle.cooldown = 2;
          this.emit("undertake", vehicle.id, front.vehicle.id);
        }
      }
    }
    if (this.attack?.kind === "gun") {
      if (this.time >= this.attack.nextShot) {
        this.emit("shot", this.attack.actorId);
        this.attack.nextShot = this.time + 0.22;
      }
      if (this.time - this.attack.startedAt >= 2.4) this.crashBlocker();
    }
    return check;
  }

  private signalLeftLaneDrivers(): void {
    if (!this.arcade.signals) return;
    for (const vehicle of this.vehicles) {
      const front = this.leader(vehicle);
      const eligible =
        vehicle.kind === "car" &&
        vehicle.fast &&
        !vehicle.crashed &&
        vehicle.lane === 0 &&
        vehicle.visualLane <= 0.1 &&
        vehicle.blockedFor > 3 &&
        front &&
        front.gap <= 10 &&
        vehicle.desiredSpeed - vehicle.speed > kmh(5);
      if (!eligible) {
        vehicle.signalTarget = null;
        vehicle.signalFlashes = 0;
        continue;
      }
      if (vehicle.signalTarget !== front.vehicle.id) {
        vehicle.signalTarget = front.vehicle.id;
        vehicle.signalFlashes = 0;
        vehicle.nextSignal = this.time;
      }
      if (this.time < vehicle.nextSignal) continue;
      const horn = vehicle.signalFlashes >= 3;
      vehicle.signalUntil = this.time + 1.2;
      vehicle.hornUntil = horn ? this.time + 1.2 : 0;
      vehicle.nextSignal = this.time + (horn ? 5 + this.random() * 3 : 2);
      if (!horn) vehicle.signalFlashes++;
      this.emit(horn ? "horn" : "flash", vehicle.id, front.vehicle.id);
      // Decide once at the first flash; less responsive drivers wait for a horn.
      if (
        front.vehicle.kind === "car" &&
        !front.vehicle.fast &&
        (horn || vehicle.signalFlashes === 1) &&
        this.random() < (horn ? 0.8 : 0.5)
      )
        front.vehicle.yieldUntil = this.time + 8;
    }
  }

  private distance(from: number, to: number): number {
    return (to - from + this.roadLength) % this.roadLength;
  }

  leader(
    vehicle: Vehicle,
    lane = vehicle.lane,
  ): { vehicle: Vehicle; gap: number } | null {
    let result: { vehicle: Vehicle; gap: number } | null = null;
    if (this.indexedTraffic) {
      this.laneIndex ??= {
        lanes: [0, 1].map((side) =>
          this.vehicles
            .filter((v) => !v.crashed && v.lane === side)
            .sort((a, b) => a.x - b.x),
        ),
        longest: Math.max(...this.vehicles.map((v) => v.length)),
      };
      const cars = this.laneIndex.lanes[lane];
      let low = 0,
        high = cars.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (cars[middle].x < vehicle.x) low = middle + 1;
        else high = middle;
      }
      for (let i = 0; i < cars.length; i++) {
        const other = cars[(low + i) % cars.length];
        if (other.id === vehicle.id) continue;
        const distance = this.distance(vehicle.x, other.x);
        // Longer trucks can have a nearer rear bumper than the nearest car.
        if (
          result &&
          distance - (vehicle.length + this.laneIndex.longest) / 2 > result.gap
        )
          break;
        const gap = distance - (vehicle.length + other.length) / 2;
        if (!result || gap < result.gap) result = { vehicle: other, gap };
      }
      return result;
    }
    for (const other of this.vehicles) {
      if (other.crashed || other.id === vehicle.id || other.lane !== lane)
        continue;
      const gap =
        this.distance(vehicle.x, other.x) - (vehicle.length + other.length) / 2;
      if (!result || gap < result.gap) result = { vehicle: other, gap };
    }
    return result;
  }

  private canMerge(
    vehicle: Vehicle,
    lane: 0 | 1,
    impatient = vehicle.passTarget !== null,
  ): boolean {
    const headway = impatient ? 0.3 : 1.2;
    const minimumGap = impatient ? 8 : 15;
    const front = this.leader(vehicle, lane);
    if (
      front &&
      front.gap <
        Math.max(
          minimumGap,
          vehicle.speed * headway +
            Math.max(0, vehicle.speed - front.vehicle.speed) * 2,
        )
    )
      return false;
    for (const rear of this.vehicles) {
      if (rear.crashed || rear.id === vehicle.id || rear.lane !== lane)
        continue;
      const gap =
        this.distance(rear.x, vehicle.x) - (vehicle.length + rear.length) / 2;
      if (
        gap <
        Math.max(
          minimumGap,
          rear.speed * headway + Math.max(0, rear.speed - vehicle.speed) * 2,
        )
      )
        return false;
    }
    return true;
  }

  private desired(vehicle: Vehicle): number {
    const { speedLimit, blockerSpeed, fasterSpeed } = this.settings;
    if (vehicle.kind === "blocker")
      return kmh(
        this.phase === "blocking"
          ? blockerSpeed
          : this.phase === "overtaking" || this.phase === "returning"
            ? Math.max(speedLimit, blockerSpeed, fasterSpeed)
            : speedLimit,
      );
    if (vehicle.kind === "truck")
      return kmh(this.settings.rightLaneSpeed ?? speedLimit - 12);
    return kmh(vehicle.fast ? fasterSpeed : speedLimit);
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Substeps preserve following and merge behavior at every playback speed.
    for (let remaining = Math.min(dt, 10); remaining > 1e-8; ) {
      const h = Math.min(remaining, 0.05);
      this.advance(h);
      remaining -= h;
    }
  }

  private advance(dt: number): void {
    this.time += dt;
    const checkSignals = this.advanceArcade(dt);
    this.indexedTraffic = true;
    this.laneIndex = null;
    for (const vehicle of this.vehicles) {
      if (vehicle.crashed) continue;
      vehicle.cooldown -= dt;
      vehicle.desiredSpeed = this.desired(vehicle);
      if (
        this.attack &&
        (vehicle.id === this.attack.actorId || vehicle.kind === "blocker")
      )
        continue;
      const yieldingToFaster =
        this.arcade.signals &&
        vehicle.kind === "car" &&
        !vehicle.fast &&
        vehicle.yieldUntil > this.time;
      if (
        vehicle.id === this.spawnYieldId ||
        (vehicle.cooldown > 0 && !yieldingToFaster)
      )
        continue;
      if (vehicle.kind === "blocker" && this.phase === "blocking") continue;
      if (vehicle.kind === "blocker" && this.phase === "returning") {
        if (this.canMerge(vehicle, 0)) {
          vehicle.lane = 0;
          this.laneIndex = null;
          vehicle.cooldown = 5;
        }
        continue;
      }
      if (vehicle.passTarget !== null) {
        const target = this.vehicles.find(
          (other) => other.id === vehicle.passTarget,
        );
        // If the target leaves the left lane, stop the attempt without claiming
        // a successful pass. Otherwise return only after fully clearing it.
        if (!target || target.crashed || target.lane !== 0) {
          vehicle.passTarget = null;
          continue;
        }
        const ahead = this.distance(target.x, vehicle.x);
        const passed =
          ahead > (vehicle.length + target.length) / 2 + 8 &&
          ahead < this.roadLength / 2;
        if (passed && this.canMerge(vehicle, 0)) {
          vehicle.lane = 0;
          this.laneIndex = null;
          vehicle.cooldown = 5;
          this.emit("return", vehicle.id, vehicle.passTarget);
          vehicle.passTarget = null;
        }
        continue;
      }
      const front = this.leader(vehicle);
      if (
        vehicle.lane === 1 &&
        vehicle.kind !== "blocker" &&
        vehicle.kind !== "truck" &&
        front &&
        front.gap < vehicle.speed * 4 &&
        front.vehicle.speed < vehicle.desiredSpeed - 1.5 &&
        this.canMerge(vehicle, 0)
      ) {
        vehicle.lane = 0;
        this.laneIndex = null;
        vehicle.cooldown = 5;
      } else if (
        vehicle.lane === 0 &&
        this.canMerge(vehicle, 1) &&
        !(
          this.arcade.undertaking &&
          vehicle.fast &&
          front &&
          front.gap < 100 &&
          front.vehicle.speed < vehicle.desiredSpeed - kmh(5)
        )
      ) {
        const right = this.leader(vehicle, 1);
        // Ordinary drivers need not hold up an approaching faster car merely
        // because another right-lane pass will be needed farther down the road.
        const fasterBehind =
          !vehicle.fast &&
          vehicle.kind === "car" &&
          this.vehicles.some(
            (other) =>
              !other.crashed &&
              other.fast &&
              other.kind === "car" &&
              other.lane === 0 &&
              other.desiredSpeed > vehicle.desiredSpeed + kmh(5) &&
              this.distance(other.x, vehicle.x) < 100,
          );
        const wantsRight =
          vehicle.kind === "blocker" ||
          (fasterBehind && (!right || right.gap > vehicle.speed * 3)) ||
          yieldingToFaster ||
          !right ||
          right.gap > vehicle.speed * 5 ||
          right.vehicle.speed >= vehicle.desiredSpeed - 1;
        if (wantsRight) {
          vehicle.lane = 1;
          this.laneIndex = null;
          vehicle.cooldown = 5;
          if (vehicle.kind === "blocker") this.clearedTime = this.time;
        }
      }
    }

    for (const vehicle of this.vehicles) {
      const signalling =
        vehicle.signalUntil > this.time || vehicle.hornUntil > this.time;
      const signalLeader = signalling ? this.leader(vehicle) : null;
      if (
        vehicle.lane !== 0 ||
        vehicle.crashed ||
        (signalling &&
          (!signalLeader ||
            signalLeader.gap > 10 ||
            signalLeader.vehicle.id !== vehicle.signalTarget))
      ) {
        vehicle.signalUntil = vehicle.hornUntil = 0;
        vehicle.signalTarget = null;
        vehicle.signalFlashes = 0;
      }
    }
    if (checkSignals) this.signalLeftLaneDrivers();

    const updates = this.vehicles
      .filter((vehicle) => !vehicle.crashed)
      .map((vehicle) => {
        let front = this.leader(vehicle);
        const ramming =
          this.attack?.kind === "ram" &&
          this.attack.actorId === vehicle.id &&
          front?.vehicle.kind === "blocker";
        if (ramming) front = null;
        // Treat nearby left-lane traffic as a virtual leader: no passing on the right.
        if (vehicle.lane === 1) {
          const left = this.leader(vehicle, 0);
          if (
            left &&
            vehicle.passTarget === null &&
            left.gap > 0 &&
            left.gap < 100 &&
            left.vehicle.speed < vehicle.speed - 0.01 &&
            (!front || left.gap < front.gap)
          )
            front = left;
        }
        // Once alongside an available right-lane slot, match its leader rather
        // than repeatedly accelerating past every gap while trying to clear.
        if (vehicle.kind === "blocker" && this.phase === "overtaking") {
          const right = this.leader(vehicle, 1);
          if (
            right &&
            right.gap > 0 &&
            right.gap < vehicle.speed * 4 &&
            (!front || right.gap < front.gap)
          )
            front = right;
        }
        // A requested lane change prompts the following driver in that lane to yield.
        const yieldingLane =
          this.phase === "overtaking"
            ? 1
            : this.phase === "returning"
              ? 0
              : null;
        if (vehicle.lane === yieldingLane && vehicle.id !== this.blocker.id) {
          const gap =
            this.distance(vehicle.x, this.blocker.x) -
            (vehicle.length + this.blocker.length) / 2;
          if (gap < 100 && (!front || gap <= front.gap))
            front = { vehicle: this.blocker, gap };
        }
        const desired = Math.max(
          kmh(10),
          ramming ? this.blocker.speed + kmh(35) : vehicle.desiredSpeed,
        );
        let acceleration = 1.8 * (1 - (vehicle.speed / desired) ** 4);
        if (front) {
          const closing = vehicle.speed - front.vehicle.speed;
          const yielding =
            vehicle.lane === yieldingLane && front.vehicle.kind === "blocker";
          const impatient =
            vehicle.kind === "car" &&
            vehicle.fast &&
            (this.arcade.undertaking ||
              this.arcade.signals ||
              vehicle.passTarget !== null);
          const followingDistance = yielding
            ? 3 + vehicle.speed * 2.2
            : vehicle.kind === "blocker" && this.phase === "overtaking"
              ? 3 + vehicle.speed * 1.4
              : impatient
                ? 2 + Math.min(2, vehicle.speed * 0.025)
                : 4 + Math.min(2, vehicle.speed * 0.03);
          const safeGap = Math.max(
            impatient && !yielding ? 2 : 3,
            followingDistance +
              Math.max(0, closing) * 0.25 +
              Math.max(0, closing) ** 2 / (2 * 4),
          );

          // Independent free-speed and following constraints: distant traffic
          // must not reduce a driver's cruising target before it is caught.
          acceleration = Math.min(
            acceleration,
            1.8 -
              (1.8 + 2 * closing) * (safeGap / Math.max(0.5, front.gap)) ** 2,
          );
        }
        if (vehicle.id === this.spawnYieldId)
          acceleration = Math.min(acceleration, -2.5);
        acceleration = Math.max(-8, Math.min(1.8, acceleration));
        let speed = Math.max(0, vehicle.speed + acceleration * dt);
        const actualFront = ramming ? null : this.leader(vehicle);
        return { vehicle, speed, acceleration, actualFront };
      });
    // Collision limits must include the leader's movement during this same
    // substep. Treating its current position as stationary jams dense traffic.
    const planned = new Map(
      updates.map((update) => [update.vehicle.id, update]),
    );
    const followers = new Map<number, typeof updates>();
    for (const update of updates) {
      if (!update.actualFront) continue;
      const id = update.actualFront.vehicle.id;
      const behind = followers.get(id) ?? [];
      behind.push(update);
      followers.set(id, behind);
    }
    const pending = [...updates];
    for (let i = 0; i < pending.length; i++) {
      const update = pending[i];
      if (!update.actualFront) continue;
      const leader = planned.get(update.actualFront.vehicle.id)!;
      const allowed = Math.max(
        0,
        leader.speed + (update.actualFront.gap - 1.0000001) / dt,
      );
      if (update.speed > allowed + 1e-10) {
        update.speed = allowed;
        pending.push(...(followers.get(update.vehicle.id) ?? []));
      }
    }
    this.indexedTraffic = false;
    this.laneIndex = null;
    for (const { vehicle, speed, acceleration } of updates) {
      vehicle.speed = speed;
      vehicle.braking = acceleration < -0.65;
      vehicle.x = (vehicle.x + speed * dt) % this.roadLength;
      vehicle.visualLane +=
        (vehicle.lane - vehicle.visualLane) * Math.min(1, dt * 2.2);
    }
    if (this.attack?.kind === "ram") {
      const actor = this.vehicles.find(
        (vehicle) => vehicle.id === this.attack!.actorId,
      )!;
      const gap =
        this.distance(actor.x, this.blocker.x) -
        (actor.length + this.blocker.length) / 2;
      if (gap <= 1.5) {
        actor.speed = Math.min(actor.speed, this.blocker.speed);
        this.crashBlocker();
      }
    }
    if (this.spawning && this.time >= this.nextSpawnAttempt)
      this.spawnBlocker();
    if (this.time >= this.nextSample) this.recordSample();
  }

  get metrics(): { speed: number; queue: number; flow: number } {
    const active = this.vehicles.filter((vehicle) => !vehicle.crashed);
    const speed =
      active.reduce((sum, vehicle) => sum + vehicle.speed * 3.6, 0) /
      Math.max(1, active.length);
    const queue = active.filter(
      (vehicle) =>
        vehicle.kind === "car" && vehicle.desiredSpeed - vehicle.speed > kmh(8),
    ).length;
    return {
      speed,
      queue,
      flow: (speed * active.length) / (this.roadLength / 1000),
    };
  }

  private recordSample(): void {
    this.samples.push({
      time: this.time,
      speed: this.metrics.speed,
      queue: this.metrics.queue,
    });
    if (this.samples.length > 240) this.samples.shift();
    this.nextSample = Math.floor(this.time) + 1;
  }
}
