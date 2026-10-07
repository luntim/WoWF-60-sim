import * as THREE from "three";

export type AttackKind = "mh" | "oh" | "both";

export interface CharacterMotion {
  forward: number;
  strafe: number;
  airborne: boolean;
}

/**
 * What the world needs from the player's model. The placeholder below implements it with
 * primitives; a Mixamo model can implement it with an AnimationMixer and clips instead.
 */
export interface CharacterView {
  readonly object: THREE.Object3D;
  /** Movement relative to facing, each -1..1 (forward/back, right/left), and whether mid-jump. */
  update(dt: number, motion: CharacterMotion): void;
  attack(kind: AttackKind): void;
  setStealthed(on: boolean): void;
}

/** Short procedural animation: `apply(p)` runs with p going 0 -> 1 over `duration`. */
interface Anim {
  t: number;
  duration: number;
  apply(p: number): void;
}

class Animator {
  private anims: Anim[] = [];

  play(duration: number, apply: (p: number) => void): void {
    this.anims.push({ t: 0, duration, apply });
  }

  update(dt: number): void {
    for (const a of this.anims) {
      a.t = Math.min(a.duration, a.t + dt);
      a.apply(a.t / a.duration);
    }
    this.anims = this.anims.filter((a) => a.t < a.duration);
  }
}

/** 0 -> 1 -> 0 over p in 0..1, fast out and slower back. */
const thrust = (p: number) => (p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65);

function standardMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, transparent: true });
}

function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
}

/** Hooded figure with two daggers, front facing +z. About 1.8 yd tall. */
export class PlaceholderRogue implements CharacterView {
  readonly object = new THREE.Group();
  private body = new THREE.Group();
  private daggers: Record<"mh" | "oh", THREE.Object3D>;
  private materials: THREE.MeshStandardMaterial[] = [];
  private animator = new Animator();
  private walkPhase = 0;
  private lean = 0;

  constructor() {
    const cloth = this.material(0x2d2a3a);
    const skin = this.material(0xf1c9a5);
    const steel = this.material(0xc9d1de);
    steel.metalness = 0.7;
    steel.roughness = 0.3;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 6, 12), cloth);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.y = 1.62;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
    hood.position.set(0, 1.66, -0.03);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.1), cloth);
    mask.position.set(0, 1.56, 0.15);
    this.body.add(torso, head, hood, mask);

    // Facing +z, the right hand is on -x.
    const dagger = (side: number) => {
      const group = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.45, 4), steel);
      blade.rotation.x = Math.PI / 2;
      blade.position.z = 0.28;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), this.material(0x4a3020));
      grip.rotation.x = Math.PI / 2;
      group.add(blade, grip);
      group.position.set(side * 0.42, 1.0, 0.18);
      this.body.add(group);
      return group;
    };
    this.daggers = { mh: dagger(-1), oh: dagger(1) };

    this.object.add(this.body);
    castShadows(this.object);
  }

  update(dt: number, motion: CharacterMotion): void {
    const moving = !motion.airborne && Math.hypot(motion.forward, motion.strafe) > 0.01;
    this.walkPhase = moving ? this.walkPhase + dt * 11 : 0;
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    // Lean into the movement a little; tuck forward while airborne.
    const targetLean = motion.airborne ? 0.25 : motion.forward * 0.12;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 10);
    this.body.rotation.x = this.lean;
    this.body.rotation.z = -motion.strafe * 0.08;
    this.animator.update(dt);
  }

  attack(kind: AttackKind): void {
    const hands = kind === "both" ? (["mh", "oh"] as const) : [kind];
    for (const hand of hands) {
      const dagger = this.daggers[hand];
      const baseZ = 0.18;
      this.animator.play(0.22, (p) => {
        const k = thrust(p);
        dagger.position.z = baseZ + k * 0.45;
        dagger.rotation.x = -k * 0.4;
      });
    }
    this.animator.play(0.22, (p) => (this.body.position.z = thrust(p) * 0.12));
  }

  setStealthed(on: boolean): void {
    for (const m of this.materials) m.opacity = on ? 0.3 : 1;
  }

  private material(color: number): THREE.MeshStandardMaterial {
    const m = standardMaterial(color);
    this.materials.push(m);
    return m;
  }
}

/** Straw training dummy on a post. Its face (and the target ring) points +z. */
export class TrainingDummy {
  readonly object = new THREE.Group();
  /** Pivots at the base so hits rock it like it's planted in the ground. */
  private pivot = new THREE.Group();
  private straw = standardMaterial(0xc8a165);
  private tilt = { angle: 0, velocity: 0, axis: new THREE.Vector3(1, 0, 0) };
  private flash = 0;

  constructor() {
    const wood = standardMaterial(0x6b4a2f);
    const red = standardMaterial(0xb3412f);
    const dark = standardMaterial(0x2a1a10);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 8), wood);
    post.position.y = 0.5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 6, 14), this.straw);
    body.position.y = 1.25;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), wood);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), this.straw);
    head.position.y = 2.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 24), red);
    ring.position.set(0, 1.25, 0.38);
    const eye = (x: number) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
      e.position.set(x, 2.04, 0.24);
      return e;
    };
    this.pivot.add(post, body, arms, head, ring, eye(-0.08), eye(0.08));

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 16), wood);
    base.position.y = 0.06;
    base.receiveShadow = true;
    this.object.add(this.pivot, base);
    castShadows(this.object);
  }

  /** Rock away from the attacker. `from` is the attacker's direction in world space. */
  hit(from: THREE.Vector3, crit: boolean): void {
    // Tilt around the horizontal axis perpendicular to the hit direction.
    this.tilt.axis.set(from.z, 0, -from.x).normalize();
    this.tilt.velocity -= crit ? 2.6 : 1.3;
    this.flash = 0.07;
  }

  update(dt: number): void {
    // Damped spring back to upright.
    const t = this.tilt;
    t.velocity += (-t.angle * 140 - t.velocity * 9) * dt;
    t.angle += t.velocity * dt;
    this.pivot.setRotationFromAxisAngle(t.axis, t.angle);

    this.flash = Math.max(0, this.flash - dt);
    this.straw.emissive.setHex(this.flash > 0 ? 0x806040 : 0x000000);
  }
}
