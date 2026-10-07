export interface MeterRow {
  name: string;
  damage: number;
  hits: number;
}

/** Tracks damage done to the dummy. Times are in sim seconds. */
export class Meter {
  total = 0;
  readonly rows = new Map<string, MeterRow>();
  private startTime: number | null = null;

  record(time: number, sourceId: string, name: string, amount: number): void {
    this.startTime ??= time;
    this.total += amount;
    const row = this.rows.get(sourceId) ?? { name, damage: 0, hits: 0 };
    row.damage += amount;
    row.hits++;
    this.rows.set(sourceId, row);
  }

  elapsed(now: number): number {
    return this.startTime === null ? 0 : now - this.startTime;
  }

  /** Floors elapsed at 1s so the first hit doesn't show an absurd DPS. */
  dps(now: number): number {
    return this.startTime === null ? 0 : this.total / Math.max(this.elapsed(now), 1);
  }
}
