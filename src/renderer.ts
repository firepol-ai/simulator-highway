import { ROAD_LENGTH, Simulation } from "./simulation.ts";

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string,
) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
};

export class RoadRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private observer: ResizeObserver;
  showSpeeds = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = box.width;
    this.height = box.height;
    this.canvas.width = box.width * ratio;
    this.canvas.height = box.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  draw(sim: Simulation): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const center = h * 0.53;
    const roadTop = center - 69;
    const roadBottom = center + 69;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e3e8d9";
    ctx.fillRect(0, 0, w, h);

    // Deterministic field textures and trees keep the landscape stable.
    ctx.fillStyle = "#dce3ce";
    ctx.beginPath();
    ctx.moveTo(w * 0.55, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, roadTop - 24);
    ctx.lineTo(w * 0.7, roadTop - 24);
    ctx.fill();
    ctx.fillStyle = "#dce3d1";
    ctx.beginPath();
    ctx.moveTo(0, roadBottom + 24);
    ctx.lineTo(w * 0.24, roadBottom + 24);
    ctx.lineTo(w * 0.45, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.strokeStyle = "#cfd8c3";
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.6 + i * 28, 0);
      ctx.lineTo(w * 0.74 + i * 28, roadTop - 35);
      ctx.stroke();
    }
    for (let i = 0; i < Math.floor(w / 29); i++) {
      const x = (((i * 173 + 43) % 997) / 997) * w;
      const top = i % 2 === 0;
      const y = top
        ? 37 + ((i * 29) % Math.max(1, roadTop - 87))
        : roadBottom + 56 + ((i * 19) % Math.max(1, h - roadBottom - 83));
      const r = 7 + (i % 5);
      ctx.fillStyle = "#284e3820";
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 5, r + 3, r, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ["#a7b995", "#b8c6a4", "#94ad89"][i % 3];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c4d0b040";
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#b8beaf";
    ctx.fillRect(0, roadTop - 12, w, 162);
    ctx.fillStyle = "#616e70";
    ctx.fillRect(0, roadTop - 5, w, 148);
    ctx.fillStyle = "#566366";
    ctx.fillRect(0, roadTop, w, 138);
    ctx.fillStyle = "#e5e7d5";
    ctx.fillRect(0, roadTop + 6, w, 2);
    ctx.fillRect(0, roadBottom - 8, w, 2);
    ctx.strokeStyle = "#c4cebf";
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 25]);
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(w, center);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const y of [roadTop - 14, roadBottom + 14]) {
      ctx.fillStyle = "#a3afa0";
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = "#e8ecdd";
      ctx.fillRect(0, y, w, 1);
      for (let x = 20; x < w; x += 64) {
        ctx.fillStyle = "#89968b";
        ctx.fillRect(x, y - 2, 3, 7);
      }
    }

    ctx.font = '10px "Arial", sans-serif';
    ctx.letterSpacing = "1.4px";
    ctx.fillStyle = "#d3dbd17a";
    ctx.fillText("LEFT · OVERTAKING  →", 22, center - 14);
    ctx.fillText("RIGHT · CRUISING  →", 22, center + 51);
    ctx.letterSpacing = "0px";

    // Zoom narrow displays around the blocker so queued cars remain distinct.
    const visibleLength = Math.min(ROAD_LENGTH, w / 0.72);
    const origin =
      visibleLength < ROAD_LENGTH
        ? (sim.blocker.x - visibleLength * 0.72 + ROAD_LENGTH) % ROAD_LENGTH
        : 0;
    const scale = w / visibleLength;
    for (const vehicle of [...sim.vehicles].sort(
      (a, b) => vehicleOrder(a) - vehicleOrder(b),
    )) {
      const x = ((vehicle.x - origin + ROAD_LENGTH) % ROAD_LENGTH) * scale;
      if (x > w + 20) continue;
      const y = center - 33 + vehicle.visualLane * 66;
      const length = vehicle.kind === "truck" ? 33 : 21;
      const width = vehicle.kind === "truck" ? 15 : 12;
      const isBlocker = vehicle.kind === "blocker";
      if (isBlocker) {
        ctx.strokeStyle = sim.phase === "clear" ? "#c9e9a8" : "#edbd76";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(
          x - length / 2 - 6,
          y - width / 2 - 6,
          length + 12,
          width + 12,
          8,
        );
        ctx.stroke();
      }
      roundedRect(
        ctx,
        x - length / 2 + 2,
        y - width / 2 + 3,
        length,
        width,
        3,
        "#12252c40",
      );
      roundedRect(
        ctx,
        x - length / 2,
        y - width / 2,
        length,
        width,
        3,
        isBlocker ? "#efae60" : vehicle.color,
      );
      if (vehicle.kind === "truck") {
        roundedRect(ctx, x + 7, y - width / 2 + 1, 7, width - 2, 1, "#f3eee0");
        ctx.fillStyle = "#344d52";
        ctx.fillRect(x + 11, y - 5, 2, 10);
        ctx.fillStyle = "#ffffff35";
        ctx.fillRect(x - 13, y - 5, 18, 2);
      } else {
        roundedRect(
          ctx,
          x + 1,
          y - width / 2 + 1.5,
          4,
          width - 3,
          1,
          "#344d52",
        );
        roundedRect(ctx, x - 6, y - width / 2 + 2, 3, width - 4, 1, "#344d52");
        ctx.fillStyle = "#ffffff35";
        ctx.fillRect(x - 1, y - width / 2 + 1, 3, 1);
      }
      ctx.fillStyle = vehicle.braking ? "#ff6960" : "#b96053";
      ctx.fillRect(x - length / 2, y - width / 2 + 1, 2, 3);
      ctx.fillRect(x - length / 2, y + width / 2 - 4, 2, 3);
      ctx.fillStyle = "#fff5cc";
      ctx.fillRect(x + length / 2 - 1, y - width / 2 + 1, 1, 2);
      ctx.fillRect(x + length / 2 - 1, y + width / 2 - 3, 1, 2);
      if (this.showSpeeds && !isBlocker) {
        ctx.font = "9px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#eef0e4aa";
        ctx.fillText(String(Math.round(vehicle.speed * 3.6)), x, y - 13);
      }
      if (isBlocker) {
        const labelX = Math.max(80, Math.min(w - 80, x));
        const labelY = roadTop - 54;
        ctx.strokeStyle = "#ae8057";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(labelX, labelY + 29);
        ctx.lineTo(x, y - 16);
        ctx.stroke();
        roundedRect(ctx, labelX - 73, labelY, 146, 30, 6, "#fcf8eb");
        ctx.textAlign = "center";
        ctx.font = "600 10px Arial";
        ctx.fillStyle = "#81572b";
        ctx.fillText(
          `${sim.phase === "clear" ? "BACK IN THE RIGHT LANE" : sim.phase === "overtaking" ? "FINISHING THE PASS" : "BLOCKING DRIVER"}${sim.phase === "blocking" ? ` · ${Math.round(vehicle.speed * 3.6)}` : ""}`,
          labelX,
          labelY + 19,
        );
      }
      ctx.textAlign = "left";
    }
    // Schematic distance markers, intentionally not a physical vehicle scale.
    ctx.fillStyle = "#718068";
    ctx.font = "10px Arial";
    for (let i = 0; i <= 4; i++) {
      const x = 22 + ((w - 44) * i) / 4;
      ctx.textAlign = i === 4 ? "right" : "left";
      const distance =
        origin === 0 && visibleLength === ROAD_LENGTH
          ? (i * ROAD_LENGTH) / 4
          : (origin + (i * visibleLength) / 4) % ROAD_LENGTH;
      ctx.fillText(`${(distance / 1000).toFixed(1)} km`, x, h - 24);
    }
    ctx.textAlign = "left";
  }

  destroy(): void {
    this.observer.disconnect();
  }
}

const vehicleOrder = (vehicle: { kind: string; id: number }) =>
  vehicle.kind === "blocker" ? 10000 : vehicle.id;

export function drawChart(canvas: HTMLCanvasElement, sim: Simulation): void {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(width * ratio) ||
    canvas.height !== Math.round(height * ratio)
  ) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const left = 32,
    right = width - 12,
    top = 12,
    bottom = height - 24;
  const maxSpeed =
    Math.ceil(
      (Math.max(
        sim.settings.speedLimit,
        sim.settings.fasterSpeed,
        sim.settings.blockerSpeed,
      ) +
        10) /
        20,
    ) * 20;
  ctx.font = "10px Arial";
  for (let i = 0; i <= 3; i++) {
    const y = top + ((bottom - top) * i) / 3;
    ctx.strokeStyle = "#e9ece4";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#8a9287";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(maxSpeed * (1 - i / 3))), left - 9, y + 3);
  }
  const start = Math.max(0, sim.time - 120);
  const end = Math.max(120, sim.time);
  const xFor = (time: number) =>
    left + ((time - start) / (end - start)) * (right - left);
  const yFor = (speed: number) => bottom - (speed / maxSpeed) * (bottom - top);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "#adb9a3";
  ctx.beginPath();
  ctx.moveTo(left, yFor(sim.settings.speedLimit));
  ctx.lineTo(right, yFor(sim.settings.speedLimit));
  ctx.stroke();
  ctx.setLineDash([]);
  const samples = sim.samples.filter((sample) => sample.time >= start);
  if (samples.length > 1) {
    ctx.beginPath();
    ctx.moveTo(xFor(samples[0].time), bottom);
    for (const sample of samples)
      ctx.lineTo(xFor(sample.time), yFor(sample.speed));
    ctx.lineTo(xFor(samples.at(-1)!.time), bottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "#55795628");
    gradient.addColorStop(1, "#55795602");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    samples.forEach((sample, i) =>
      i === 0
        ? ctx.moveTo(xFor(sample.time), yFor(sample.speed))
        : ctx.lineTo(xFor(sample.time), yFor(sample.speed)),
    );
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#4c7254";
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  if (sim.releaseTime !== null && sim.releaseTime >= start) {
    const x = xFor(sim.releaseTime);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#c39755";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#986d32";
    ctx.textAlign = x > width - 90 ? "right" : "left";
    ctx.fillText("Release", x + (x > width - 90 ? -5 : 5), top + 9);
  }
  ctx.fillStyle = "#8a9287";
  for (let i = 0; i <= 4; i++) {
    ctx.textAlign = i === 4 ? "right" : "left";
    ctx.fillText(
      `${Math.round(start + ((end - start) * i) / 4)}s`,
      left + ((right - left) * i) / 4,
      height - 6,
    );
  }
}
