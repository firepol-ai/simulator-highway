export interface Settings {
  speedLimit: number;
  blockerSpeed: number;
  overtakingExtra: number;
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
  kind: 'car' | 'truck' | 'blocker';
  braking: boolean;
  color: string;
}

export interface Sample {
  time: number;
  speed: number;
  queue: number;
}

export const DEFAULT_SETTINGS: Settings = {
  speedLimit: 80,
  blockerSpeed: 75,
  overtakingExtra: 15,
  vehicleCount: 26,
};

export const ROAD_LENGTH = 1200;
const COLORS = ['#e8e9df', '#95b9b0', '#aec0cc', '#d2bfa4', '#5c7e78', '#cad0d1'];
const kmh = (value: number) => value / 3.6;

/** Illustrative IDM car following on a periodic two-lane road. */
export class Simulation {
  settings: Settings;
  vehicles: Vehicle[] = [];
  time = 0;
  releaseTime: number | null = null;
  clearedTime: number | null = null;
  samples: Sample[] = [];
  private nextSample = 0;

  constructor(settings: Settings = DEFAULT_SETTINGS) {
    this.settings = { ...settings };
    this.reset();
  }

  get blocker(): Vehicle {
    return this.vehicles[0];
  }

  get phase(): 'blocking' | 'overtaking' | 'clear' {
    return this.clearedTime !== null ? 'clear' : this.releaseTime !== null ? 'overtaking' : 'blocking';
  }

  reset(): void {
    this.time = 0;
    this.releaseTime = null;
    this.clearedTime = null;
    this.samples = [];
    this.nextSample = 0;
    this.vehicles = [];
    const add = (x: number, lane: 0 | 1, kind: Vehicle['kind'], fast: boolean) => {
      const id = this.vehicles.length;
      const speed = kind === 'blocker' ? this.settings.blockerSpeed : kind === 'truck' ? this.settings.speedLimit - 12 : this.settings.speedLimit + (fast ? this.settings.overtakingExtra : -(id % 3) * 2);
      this.vehicles.push({ id, x, lane, visualLane: lane, kind, fast, speed: kmh(speed), desiredSpeed: kmh(speed), length: kind === 'truck' ? 12 : 4.6, cooldown: 3 + id % 4, braking: false, color: COLORS[id % COLORS.length] });
    };
    add(660, 0, 'blocker', false);
    add(665, 1, 'truck', false);
    const leftCount = Math.round((this.settings.vehicleCount - 2) * 0.55);
    const rightCount = this.settings.vehicleCount - 2 - leftCount;
    for (let i = 0; i < leftCount; i++) add((600 - i * (1050 / leftCount) + ROAD_LENGTH) % ROAD_LENGTH, 0, 'car', true);
    for (let i = 0; i < rightCount; i++) add((590 - i * (1050 / rightCount) + ROAD_LENGTH) % ROAD_LENGTH, 1, i === 5 ? 'truck' : 'car', i % 3 === 0);
    this.recordSample();
  }

  configure(settings: Settings): void {
    this.settings = { ...settings };
    this.reset();
  }

  release(): void {
    if (this.phase === 'blocking') this.releaseTime = this.time;
  }

  private distance(from: number, to: number): number {
    return (to - from + ROAD_LENGTH) % ROAD_LENGTH;
  }

  leader(vehicle: Vehicle, lane = vehicle.lane): { vehicle: Vehicle; gap: number } | null {
    let result: { vehicle: Vehicle; gap: number } | null = null;
    for (const other of this.vehicles) {
      if (other.id === vehicle.id || other.lane !== lane) continue;
      const gap = this.distance(vehicle.x, other.x) - (vehicle.length + other.length) / 2;
      if (!result || gap < result.gap) result = { vehicle: other, gap };
    }
    return result;
  }

  private canMerge(vehicle: Vehicle, lane: 0 | 1): boolean {
    const front = this.leader(vehicle, lane);
    if (front && front.gap < Math.max(15, vehicle.speed * 1.2 + Math.max(0, vehicle.speed - front.vehicle.speed) * 2)) return false;
    for (const rear of this.vehicles) {
      if (rear.id === vehicle.id || rear.lane !== lane) continue;
      const gap = this.distance(rear.x, vehicle.x) - (vehicle.length + rear.length) / 2;
      if (gap < Math.max(15, rear.speed * 1.2 + Math.max(0, rear.speed - vehicle.speed) * 2)) return false;
    }
    return true;
  }

  private desired(vehicle: Vehicle): number {
    const { speedLimit, blockerSpeed, overtakingExtra } = this.settings;
    if (vehicle.kind === 'blocker') return kmh(this.phase === 'blocking' ? blockerSpeed : this.phase === 'overtaking' ? speedLimit + overtakingExtra : speedLimit);
    if (vehicle.kind === 'truck') return kmh(speedLimit - 12);
    return kmh(speedLimit + (vehicle.fast ? overtakingExtra : -(vehicle.id % 3) * 2));
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Substeps preserve following and merge behavior at every playback speed.
    for (let remaining = Math.min(dt, 10); remaining > 1e-8;) {
      const h = Math.min(remaining, 0.05);
      this.advance(h);
      remaining -= h;
    }
  }

  private advance(dt: number): void {
    this.time += dt;
    for (const vehicle of this.vehicles) {
      vehicle.cooldown -= dt;
      vehicle.desiredSpeed = this.desired(vehicle);
      if (vehicle.cooldown > 0) continue;
      if (vehicle.kind === 'blocker' && this.phase === 'blocking') continue;
      const front = this.leader(vehicle);
      if (vehicle.lane === 1 && vehicle.kind !== 'blocker' && vehicle.kind !== 'truck' && front && front.gap < vehicle.speed * 4 && front.vehicle.speed < vehicle.desiredSpeed - 1.5 && this.canMerge(vehicle, 0)) {
        vehicle.lane = 0;
        vehicle.cooldown = 5;
      } else if (vehicle.lane === 0 && this.canMerge(vehicle, 1)) {
        const right = this.leader(vehicle, 1);
        const wantsRight = vehicle.kind === 'blocker' || !right || right.gap > vehicle.speed * 5 || right.vehicle.speed >= vehicle.desiredSpeed - 1;
        if (wantsRight) {
          vehicle.lane = 1;
          vehicle.cooldown = 5;
          if (vehicle.kind === 'blocker') this.clearedTime = this.time;
        }
      }
    }

    const updates = this.vehicles.map(vehicle => {
      let front = this.leader(vehicle);
      // Treat nearby left-lane traffic as a virtual leader: no passing on the right.
      if (vehicle.lane === 1) {
        const left = this.leader(vehicle, 0);
        if (left && left.gap < 100 && left.vehicle.speed < vehicle.speed + 1 && (!front || left.gap < front.gap)) front = left;
      }
      const desired = Math.max(kmh(10), vehicle.desiredSpeed);
      let acceleration = 1.8 * (1 - (vehicle.speed / desired) ** 4);
      if (front) {
        const closing = vehicle.speed - front.vehicle.speed;
        const safeGap = 3 + Math.max(0, vehicle.speed * 1.15 + vehicle.speed * closing / (2 * Math.sqrt(1.8 * 2.5)));
        acceleration -= 1.8 * (safeGap / Math.max(0.5, front.gap)) ** 2;
      }
      acceleration = Math.max(-8, Math.min(1.8, acceleration));
      let speed = Math.max(0, vehicle.speed + acceleration * dt);
      const actualFront = this.leader(vehicle);
      if (actualFront) speed = Math.min(speed, Math.max(0, (actualFront.gap - 1) / dt));
      return { vehicle, speed, acceleration };
    });
    for (const { vehicle, speed, acceleration } of updates) {
      vehicle.speed = speed;
      vehicle.braking = acceleration < -0.65;
      vehicle.x = (vehicle.x + speed * dt) % ROAD_LENGTH;
      vehicle.visualLane += (vehicle.lane - vehicle.visualLane) * Math.min(1, dt * 2.2);
    }
    if (this.time >= this.nextSample) this.recordSample();
  }

  get metrics(): { speed: number; queue: number; flow: number } {
    const speed = this.vehicles.reduce((sum, vehicle) => sum + vehicle.speed * 3.6, 0) / this.vehicles.length;
    const queue = this.vehicles.filter(vehicle => vehicle.kind === 'car' && vehicle.desiredSpeed - vehicle.speed > kmh(8)).length;
    return { speed, queue, flow: speed * this.vehicles.length / (ROAD_LENGTH / 1000) };
  }

  private recordSample(): void {
    this.samples.push({ time: this.time, speed: this.metrics.speed, queue: this.metrics.queue });
    if (this.samples.length > 240) this.samples.shift();
    this.nextSample = Math.floor(this.time) + 1;
  }
}
