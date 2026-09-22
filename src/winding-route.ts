export interface RoadPose { x: number; y: number; angle: number; }
type Segment = { kind: "line"; x: number; y: number; angle: number; length: number }
  | { kind: "arc"; x: number; y: number; radius: number; start: number; sweep: number; length: number };

/** A continuous, closed serpentine with alternating turns and an outer return. */
export class WindingRoute {
  readonly segments: Segment[] = [];
  readonly length: number;
  readonly roadWidth: number;
  readonly rows: number;

  constructor(width: number, height: number) {
    this.roadWidth = width < 600 ? 24 : 32;
    const top = 58;
    const bottom = Math.max(top + 210, height - 115);
    this.rows = Math.max(4, Math.min(8, Math.floor((bottom - top) / (width < 600 ? 82 : 105)) + 1));
    if (this.rows % 2 !== 0) this.rows--;
    const gap = (bottom - top) / (this.rows - 1);
    const radius = gap / 2;
    const outerX = this.roadWidth / 2 + 10;
    const left = outerX + radius + this.roadWidth + 10;
    const right = Math.max(left + 45, width - radius - this.roadWidth / 2 - 12);
    for (let row = 0; row < this.rows; row++) {
      const east = row % 2 === 0;
      const y = top + row * gap;
      this.line(east ? left : right, y, east ? 0 : Math.PI, right - left);
      if (row < this.rows - 1) this.arc(east ? right : left, y + radius, radius, -Math.PI / 2, east ? Math.PI : -Math.PI);
    }
    const outerRadius = left - outerX;
    this.arc(left, bottom - outerRadius, outerRadius, Math.PI / 2, Math.PI / 2);
    this.line(outerX, bottom - outerRadius, -Math.PI / 2, bottom - top - outerRadius * 2);
    this.arc(left, top + outerRadius, outerRadius, Math.PI, Math.PI / 2);
    this.length = this.segments.reduce((sum, segment) => sum + segment.length, 0);
  }

  private line(x: number, y: number, angle: number, length: number): void {
    this.segments.push({ kind: "line", x, y, angle, length });
  }
  private arc(x: number, y: number, radius: number, start: number, sweep: number): void {
    this.segments.push({ kind: "arc", x, y, radius, start, sweep, length: Math.abs(sweep) * radius });
  }

  pose(distance: number, offset = 0): RoadPose {
    let remaining = ((distance % this.length) + this.length) % this.length;
    for (const segment of this.segments) {
      if (remaining > segment.length) { remaining -= segment.length; continue; }
      let x: number, y: number, angle: number;
      if (segment.kind === "line") {
        angle = segment.angle;
        x = segment.x + Math.cos(angle) * remaining;
        y = segment.y + Math.sin(angle) * remaining;
      } else {
        const radial = segment.start + segment.sweep * remaining / segment.length;
        x = segment.x + Math.cos(radial) * segment.radius;
        y = segment.y + Math.sin(radial) * segment.radius;
        angle = radial + Math.sign(segment.sweep) * Math.PI / 2;
      }
      return { x: x - Math.sin(angle) * offset, y: y + Math.cos(angle) * offset, angle };
    }
    return this.pose(0, offset);
  }
}
