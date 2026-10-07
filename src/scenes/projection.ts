import type Phaser from "phaser";
import type * as THREE from "three";
import type { World3D } from "../world/World3D";

/** A 3D point in HUD (Phaser game) coordinates, or null when behind the camera or well off screen. */
export function worldToGame(scene: Phaser.Scene, world: World3D, point: THREE.Vector3, margin = 40): { x: number; y: number } | null {
  const client = world.projectToClient(point);
  if (!client) return null;
  const rect = scene.game.canvas.getBoundingClientRect();
  if (rect.width === 0) return null;
  const x = ((client.x - rect.left) / rect.width) * scene.scale.width;
  const y = ((client.y - rect.top) / rect.height) * scene.scale.height;
  if (x < -margin || y < -margin || x > scene.scale.width + margin || y > scene.scale.height + margin) return null;
  return { x, y };
}
