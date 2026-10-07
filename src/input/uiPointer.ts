/**
 * Lets HUD elements claim a mouse press so the 3D world doesn't also treat it as a click on
 * the ground (which clears the target). HUD handlers call `claim()` on pointerdown; the world
 * asks `claimedSince(t)` when the click completes.
 */
export class UiPointer {
  private claimedAt = -Infinity;

  claim(): void {
    this.claimedAt = performance.now();
  }

  /** Whether a HUD element claimed a press at or after `time` (a performance.now() timestamp). */
  claimedSince(time: number): boolean {
    return this.claimedAt >= time - 20;
  }
}
