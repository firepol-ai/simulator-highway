import { Simulation } from "./simulation.ts";
import { WindingRoute } from "./winding-route.ts";

export class WindingRenderer {
  private ctx: CanvasRenderingContext2D;
  private background = document.createElement("canvas");
  private route: WindingRoute | null = null;
  private width = 0;
  private height = 0;
  showSpeeds = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (
      this.width === width &&
      this.height === height &&
      this.canvas.width === Math.round(width * ratio)
    )
      return;
    this.width = width;
    this.height = height;
    this.canvas.width = this.background.width = Math.round(width * ratio);
    this.canvas.height = this.background.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const ctx = this.background.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.route = new WindingRoute(width, height);
    const route = this.route;
    ctx.fillStyle = "#e3e8d9";
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < (width * height) / 2200; i++) {
      const x = (((i * 173 + 41) % 997) / 997) * width;
      const y = (((i * 113 + 67) % 991) / 991) * height;
      ctx.fillStyle = ["#cad5bd", "#b8c9ab", "#aabe9c"][i % 3];
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 6), 0, Math.PI * 2);
      ctx.fill();
    }
    const path = (offset: number) => {
      const p = new Path2D();
      for (let d = 0; d <= route.length; d += 4) {
        const point = route.pose(d, offset);
        if (d === 0) p.moveTo(point.x, point.y);
        else p.lineTo(point.x, point.y);
      }
      p.closePath();
      return p;
    };
    const center = path(0);
    ctx.lineJoin = "round";
    ctx.lineWidth = route.roadWidth + 8;
    ctx.strokeStyle = "#b4bfae";
    ctx.stroke(center);
    ctx.lineWidth = route.roadWidth;
    ctx.strokeStyle = "#566366";
    ctx.stroke(center);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e9ecdb";
    ctx.stroke(path(-route.roadWidth / 2 + 2));
    ctx.stroke(path(route.roadWidth / 2 - 2));
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = "#d2dac6";
    ctx.stroke(center);
    ctx.setLineDash([]);
    for (let d = 85; d < route.length; d += 280) {
      for (const side of [-1, 1]) {
        const p = route.pose(d, (side * route.roadWidth) / 4);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = "#d0dacc55";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.moveTo(2, -3);
        ctx.lineTo(6, 0);
        ctx.lineTo(2, 3);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  draw(sim: Simulation): void {
    this.resize();
    const ctx = this.ctx,
      route = this.route!;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.background, 0, 0, this.width, this.height);
    const unit = route.length / sim.roadLength;
    const carWidth = route.roadWidth * 0.24;
    for (const vehicle of sim.vehicles) {
      const wreck = vehicle.crashed
        ? sim.wrecks.find((w) => w.vehicleId === vehicle.id)
        : null;
      const age = wreck ? sim.time - wreck.time : 0;
      const progress = wreck ? Math.min(1, age / 2.4) : 0;
      const shift = 1 - (1 - progress) ** 2;
      const laneOffset = ((vehicle.visualLane - 0.5) * route.roadWidth) / 2;
      const pose = route.pose(
        vehicle.x * unit + shift * 22,
        wreck ? laneOffset - shift * (route.roadWidth / 2 + 15) : laneOffset,
      );
      const width = vehicle.kind === "truck" ? carWidth * 1.12 : carWidth;
      const length = width * (vehicle.kind === "truck" ? 3.2 : 2.05);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle - shift * 0.7);
      if (vehicle.kind === "blocker" && !wreck) {
        ctx.strokeStyle = "#edb05f";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(
          -length / 2 - 3,
          -width / 2 - 3,
          length + 6,
          width + 6,
          4,
        );
        ctx.stroke();
      }
      ctx.fillStyle = "#1a303640";
      ctx.beginPath();
      ctx.roundRect(-length / 2 + 1, -width / 2 + 2, length, width, 2);
      ctx.fill();
      ctx.fillStyle = wreck
        ? "#885a40"
        : vehicle.kind === "blocker"
          ? "#efae60"
          : vehicle.color;
      ctx.beginPath();
      ctx.roundRect(-length / 2, -width / 2, length, width, 2);
      ctx.fill();
      ctx.fillStyle = "#344d52";
      ctx.fillRect(length * 0.1, -width / 2 + 1, length * 0.16, width - 2);
      ctx.fillStyle = vehicle.braking ? "#ff6960" : "#a8584f";
      ctx.fillRect(-length / 2, -width / 2 + 1, 2, 2);
      ctx.fillRect(-length / 2, width / 2 - 3, 2, 2);
      if (!wreck && vehicle.lane === 0 && vehicle.signalUntil > sim.time) {
        ctx.fillStyle = `rgba(255,240,164,${0.22 + (Math.sin(sim.time * 9) + 1) * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(length / 2, -3);
        ctx.lineTo(length / 2 + 20, -10);
        ctx.lineTo(length / 2 + 20, 10);
        ctx.lineTo(length / 2, 3);
        ctx.fill();
      }
      if (!wreck && vehicle.lane === 0 && vehicle.hornUntil > sim.time) {
        ctx.strokeStyle = "#ffe39c";
        ctx.lineWidth = 1.5;
        for (const radius of [14, 19]) {
          ctx.beginPath();
          ctx.arc(0, 0, radius, -0.65, 0.65);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (wreck && age < 14) {
        for (let i = 0; i < 3; i++) {
          const drift = (age + i * 0.7) % 2.5;
          ctx.fillStyle = `rgba(73,80,70,${Math.max(0, (1 - drift / 2.5) * 0.23 * Math.min(1, 14 - age))})`;
          ctx.beginPath();
          ctx.arc(
            pose.x - drift * 4,
            pose.y - drift * 8,
            3 + drift * 3,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      if (this.showSpeeds && !wreck) {
        ctx.font = "8px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#354a3b";
        const label = route.pose(
          vehicle.x * unit,
          laneOffset + (vehicle.lane === 0 ? -1 : 1) * (width + 6),
        );
        ctx.fillText(
          String(Math.round(vehicle.speed * 3.6)),
          label.x,
          label.y + 3,
        );
      }
    }
    if (sim.attack?.kind === "gun") {
      const actor = sim.vehicles.find((v) => v.id === sim.attack!.actorId)!;
      const from = actor.x * unit;
      const distance =
        ((sim.blocker.x - actor.x + sim.roadLength) % sim.roadLength) * unit;
      for (let i = 0; i < 3; i++) {
        const progress = ((sim.time - sim.attack.startedAt) * 4 + i / 3) % 1;
        const p = route.pose(from + distance * progress, -route.roadWidth / 4);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = "#ffd06d";
        ctx.fillRect(-3, -1, 6, 2);
        ctx.restore();
      }
    }
    const marker = route.pose(sim.blocker.x * unit, -route.roadWidth / 4);
    ctx.font = "600 10px Arial";
    ctx.textAlign = "center";
    const text = {
      blocking: "BLOCKING DRIVER",
      overtaking: "CLEARING LEFT LANE",
      clear: "LEFT LANE CLEARED",
      returning: "RETURNING LEFT",
      crashed: "CRASHED BLOCKER",
    }[sim.phase];
    const labelX = Math.max(75, Math.min(this.width - 75, marker.x));
    const labelY = Math.max(28, marker.y - 32);
    ctx.fillStyle = "#fcf5e4";
    ctx.beginPath();
    ctx.roundRect(labelX - 66, labelY - 12, 132, 22, 5);
    ctx.fill();
    ctx.fillStyle = "#966b38";
    ctx.fillText(text, labelX, labelY + 2);
    ctx.textAlign = "left";
  }
}
