export interface Settings {
  speedLimit: number;
  blockerSpeed: number;
  fasterSpeed: number;
  vehicleCount: number;
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
  kind: "horn" | "undertake" | "return" | "ram" | "shot" | "crash" | "spawn";
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

/** Illustrative IDM car following on a periodic two-lane road. */
export class Simulation {
  settings: Settings;
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

  constructor(
    settings: Settings = DEFAULT_SETTINGS,
    arcade: ArcadeOptions = DEFAULT_ARCADE,
  ) {
    this.settings = { ...settings };
    this.arcade = { ...arcade };
    this.reset();
  }

  get blocker(): Vehicle {
    return this.vehicles[0];
  }

  get phase(): "blocking" | "overtaking" | "clear" | "crashed" {
    return this.crash
      ? "crashed"
      : this.clearedTime !== null
        ? "clear"
        : this.releaseTime !== null
          ? "overtaking"
          : "blocking";
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
    this.events = [];
    this.attack = null;
    this.crash = null;
    this.wrecks = [];
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
            ? this.settings.speedLimit - 12
            : fast
              ? this.settings.fasterSpeed
              : this.settings.speedLimit - (id % 3) * 2;
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
        nextSignal: 0,
        passTarget: null,
        crashed: false,
      });
    };
    add(660, 0, "blocker", false);
    add(665, 1, "truck", false);
    const leftCount = Math.round((this.settings.vehicleCount - 2) * 0.55);
    const rightCount = this.settings.vehicleCount - 2 - leftCount;
    for (let i = 0; i < leftCount; i++)
      add(
        (600 - i * (1050 / leftCount) + ROAD_LENGTH) % ROAD_LENGTH,
        0,
        "car",
        true,
      );
    for (let i = 0; i < rightCount; i++)
      add(
        (590 - i * (1050 / rightCount) + ROAD_LENGTH) % ROAD_LENGTH,
        1,
        i === 5 ? "truck" : "car",
        i % 3 === 0,
      );
    this.recordSample();
  }

  configure(settings: Settings): void {
    this.settings = { ...settings };
    this.reset();
  }

  release(): void {
    if (this.phase === "blocking") {
      this.releaseTime = this.time;
      this.attack = null;
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
      nextSignal: 0,
      passTarget: null,
      cooldown: 3,
      braking: false,
      desiredSpeed: kmh(this.settings.blockerSpeed),
    };
    let placed = false;
    if (traffic.length === 0) {
      next.x = 660;
      next.speed = next.desiredSpeed;
      placed = true;
    }
    const gaps = traffic
      .map((rear, index) => ({
        rear,
        front: traffic[(index + 1) % traffic.length],
        length:
          traffic.length === 1
            ? ROAD_LENGTH
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
        ROAD_LENGTH;
      if (this.canMerge(next, 0)) {
        placed = true;
        break;
      }
    }
    if (!placed) return false;
    this.vehicles.unshift(next);
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
      for (const vehicle of this.vehicles) vehicle.signalUntil = 0;
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
        !this.attack &&
        vehicle.lane === 0 &&
        vehicle.cooldown <= 0 &&
        vehicle.passTarget === null &&
        vehicle.blockedFor > 4 &&
        this.random() < 0.35 &&
        this.canMerge(vehicle, 1)
      ) {
        const right = this.leader(vehicle, 1);
        // An impatient driver switches only when nearby right-lane traffic is
        // at least about as fast as the slower car ahead (within 5 km/h).
        const rightSpeed =
          right && right.gap < Math.max(120, vehicle.speed * 5)
            ? right.vehicle.speed
            : vehicle.desiredSpeed;
        if (
          front.vehicle.speed <= rightSpeed + kmh(5) &&
          (!right || right.gap > front.gap + 15)
        ) {
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
      if (
        vehicle.kind !== "car" ||
        vehicle.crashed ||
        vehicle.lane !== 0 ||
        vehicle.visualLane > 0.1 ||
        vehicle.blockedFor <= 3 ||
        this.time < vehicle.nextSignal
      )
        continue;
      const front = this.leader(vehicle);
      if (
        !front ||
        front.gap >= 100 ||
        vehicle.desiredSpeed - vehicle.speed <= kmh(5) ||
        this.random() >= 0.45
      )
        continue;
      vehicle.signalUntil = this.time + 1.4;
      vehicle.nextSignal = this.time + 5 + this.random() * 5;
      this.emit("horn", vehicle.id, front.vehicle.id);
    }
  }

  private distance(from: number, to: number): number {
    return (to - from + ROAD_LENGTH) % ROAD_LENGTH;
  }

  leader(
    vehicle: Vehicle,
    lane = vehicle.lane,
  ): { vehicle: Vehicle; gap: number } | null {
    let result: { vehicle: Vehicle; gap: number } | null = null;
    for (const other of this.vehicles) {
      if (other.crashed || other.id === vehicle.id || other.lane !== lane)
        continue;
      const gap =
        this.distance(vehicle.x, other.x) - (vehicle.length + other.length) / 2;
      if (!result || gap < result.gap) result = { vehicle: other, gap };
    }
    return result;
  }

  private canMerge(vehicle: Vehicle, lane: 0 | 1): boolean {
    const headway = vehicle.passTarget !== null ? 0.3 : 1.2;
    const minimumGap = vehicle.passTarget !== null ? 8 : 15;
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
          : this.phase === "overtaking"
            ? Math.max(speedLimit, blockerSpeed, fasterSpeed)
            : speedLimit,
      );
    if (vehicle.kind === "truck") return kmh(speedLimit - 12);
    return kmh(vehicle.fast ? fasterSpeed : speedLimit - (vehicle.id % 3) * 2);
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
    for (const vehicle of this.vehicles) {
      if (vehicle.crashed) continue;
      vehicle.cooldown -= dt;
      vehicle.desiredSpeed = this.desired(vehicle);
      if (
        this.attack &&
        (vehicle.id === this.attack.actorId || vehicle.kind === "blocker")
      )
        continue;
      if (vehicle.cooldown > 0) continue;
      if (vehicle.kind === "blocker" && this.phase === "blocking") continue;
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
          ahead < ROAD_LENGTH / 2;
        if (passed && this.canMerge(vehicle, 0)) {
          vehicle.lane = 0;
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
        vehicle.cooldown = 5;
      } else if (vehicle.lane === 0 && this.canMerge(vehicle, 1)) {
        const right = this.leader(vehicle, 1);
        const wantsRight =
          vehicle.kind === "blocker" ||
          !right ||
          right.gap > vehicle.speed * 5 ||
          right.vehicle.speed >= vehicle.desiredSpeed - 1;
        if (wantsRight) {
          vehicle.lane = 1;
          vehicle.cooldown = 5;
          if (vehicle.kind === "blocker") this.clearedTime = this.time;
        }
      }
    }

    for (const vehicle of this.vehicles) {
      if (vehicle.lane !== 0 || vehicle.crashed) vehicle.signalUntil = 0;
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
            left.gap < 100 &&
            left.vehicle.speed < vehicle.speed + 1 &&
            (!front || left.gap < front.gap)
          )
            front = left;
          // A signaled return right prompts the following driver to open a gap.
          if (this.phase === "overtaking") {
            const gap =
              this.distance(vehicle.x, this.blocker.x) -
              (vehicle.length + this.blocker.length) / 2;
            if (gap < 100 && (!front || gap <= front.gap))
              front = { vehicle: this.blocker, gap };
          }
        }
        const desired = Math.max(
          kmh(10),
          ramming ? this.blocker.speed + kmh(35) : vehicle.desiredSpeed,
        );
        let acceleration = 1.8 * (1 - (vehicle.speed / desired) ** 4);
        if (front) {
          const closing = vehicle.speed - front.vehicle.speed;
          const yielding =
            vehicle.lane === 1 &&
            front.vehicle.kind === "blocker" &&
            this.phase === "overtaking";
          const safeGap =
            3 +
            Math.max(
              0,
              vehicle.speed *
                (yielding ? 2.2 : vehicle.passTarget !== null ? 0.55 : 1.15) +
                (vehicle.speed * closing) / (2 * Math.sqrt(1.8 * 2.5)),
            );
          acceleration -= 1.8 * (safeGap / Math.max(0.5, front.gap)) ** 2;
        }
        acceleration = Math.max(-8, Math.min(1.8, acceleration));
        let speed = Math.max(0, vehicle.speed + acceleration * dt);
        const actualFront = this.leader(vehicle);
        if (actualFront && !ramming)
          speed = Math.min(speed, Math.max(0, (actualFront.gap - 1) / dt));
        return { vehicle, speed, acceleration };
      });
    for (const { vehicle, speed, acceleration } of updates) {
      vehicle.speed = speed;
      vehicle.braking = acceleration < -0.65;
      vehicle.x = (vehicle.x + speed * dt) % ROAD_LENGTH;
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
      flow: (speed * active.length) / (ROAD_LENGTH / 1000),
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
