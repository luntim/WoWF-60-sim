import * as THREE from "three";
import type { Keybinds } from "../input/keybinds";
import type { MouseSettings } from "../input/mouseSettings";
import type { UiPointer } from "../input/uiPointer";
import type { Combat, CombatEvent } from "../sim/Combat";
import { forward, positioning, type Placement } from "../sim/positioning";
import { PlaceholderRogue, TrainingDummy, type CharacterView } from "./characters";
import { groundVelocity, stepBody, type Body } from "./movement";

const ARENA_RADIUS = 30;
/** Closest the rogue can stand to the dummy's center. */
const DUMMY_RADIUS = 0.9;
const TURN_SPEED = 3; // radians/sec for arrow-key turning
const DEG = Math.PI / 180;
/** Tab targets the dummy only within this range, like WoW's nearest-enemy targeting. */
const TAB_TARGET_RANGE = 40;
/** A left press that moves less than this (px) before release counts as a click. */
const CLICK_SLOP = 5;
/** Camera tilt limits: slightly below shoulder height up to nearly overhead. */
const PITCH_MIN = -0.25;
const PITCH_MAX = 1.35;
const START: Placement = { x: 0, z: -3, yaw: 0 }; // behind the dummy, facing it

const MOVE_KEYS: Record<string, "forward" | "back" | "left" | "right" | "turnLeft" | "turnRight" | "jump"> = {
  Space: "jump",
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  KeyD: "right",
  ArrowLeft: "turnLeft",
  ArrowRight: "turnRight",
};

/**
 * The 3D arena: renders the rogue and the dummy, moves the rogue with WASD (A/D strafe),
 * turns with right-drag or arrow keys, and drives the sim every frame.
 */
export class World3D {
  readonly dummyPlacement: Placement = { x: 0, z: 0, yaw: 0 };
  readonly player: Placement = { ...START };
  private body: Body = { x: START.x, z: START.z, y: 0, vy: 0, air: null };

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
  private rogue: CharacterView = new PlaceholderRogue();
  private dummy = new TrainingDummy();
  private timer = new THREE.Timer();
  private held = new Set<string>();
  private cameraDistance = 9;
  private cameraPitch = 0.42;
  private turning = false;
  private raycaster = new THREE.Raycaster();
  /** Where and when the current left press started, for telling clicks from drags. */
  private press: { x: number; y: number; time: number } | null = null;

  constructor(
    private container: HTMLElement,
    private combat: Combat,
    private keybinds: Keybinds,
    private mouse: MouseSettings,
    private ui: UiPointer,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "world";
    container.prepend(this.renderer.domElement);

    this.buildScene();
    this.bindInput();
    combat.on((e) => this.onCombatEvent(e));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.timer.connect(document); // pauses the clock while the tab is hidden
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Screen position (client pixels) of a world point, or null if it's behind the camera. */
  projectToClient(point: THREE.Vector3): { x: number; y: number } | null {
    const v = point.clone().project(this.camera);
    if (v.z > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** A point on the dummy's vertical axis, `height` yards above its feet. */
  dummyPoint(height: number): THREE.Vector3 {
    return new THREE.Vector3(this.dummyPlacement.x, height, this.dummyPlacement.z);
  }

  private buildScene(): void {
    const scene = this.scene;
    scene.background = new THREE.Color(0x1a1d25);
    scene.fog = new THREE.Fog(0x1a1d25, 25, 60);

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -15;
    s.right = s.top = 15;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS + 10, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a3a32, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(ARENA_RADIUS * 2, ARENA_RADIUS, 0x4a4a40, 0x44443b);
    grid.position.y = 0.01;
    scene.add(grid);

    this.dummy.object.position.set(this.dummyPlacement.x, 0, this.dummyPlacement.z);
    this.dummy.object.rotation.y = this.dummyPlacement.yaw;
    scene.add(this.dummy.object, this.rogue.object);
  }

  private bindInput(): void {
    const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;

    window.addEventListener("keydown", (e) => {
      if (this.keybinds.capturing || typing()) return;
      if (e.code === "Tab") {
        e.preventDefault(); // otherwise the browser moves focus
        const p = positioning(this.player, this.dummyPlacement);
        if (p.distance <= TAB_TARGET_RANGE) this.combat.setTargeted(true);
        return;
      }
      if (!(e.code in MOVE_KEYS)) return;
      e.preventDefault(); // arrows/space would otherwise scroll the page or press a focused button
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      if (this.held.delete(e.code)) e.preventDefault();
    });
    window.addEventListener("blur", () => this.held.clear());

    // Right-drag turns the rogue (and the camera with it), like WoW. The cursor is hidden via
    // pointer lock, which also lets us ask for raw mouse input without OS acceleration.
    const el = this.container;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      // Clicking the game takes keyboard focus away from the side panel.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (e.button === 2) {
        this.turning = true;
        this.lockPointer();
      }
      if (e.button === 0) this.press = { x: e.clientX, y: e.clientY, time: performance.now() };
    });
    // Left-click: the dummy targets it, empty ground clears the target (as in WoW). Clicks the
    // HUD claimed (action buttons, nameplate) are left alone.
    el.addEventListener("pointerup", (e) => {
      const press = this.press;
      this.press = null;
      if (e.button !== 0 || !press) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return;
      if (this.ui.claimedSince(press.time)) return;
      this.combat.setTargeted(this.dummyUnder(e.clientX, e.clientY));
    });
    el.addEventListener("pointermove", (e) => {
      if (this.turning) return;
      el.style.cursor = this.dummyUnder(e.clientX, e.clientY) ? "pointer" : "";
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.turning) return;
      const rad = this.mouse.sensitivity * DEG;
      this.player.yaw -= e.movementX * rad;
      const dy = this.mouse.invertY ? -e.movementY : e.movementY;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * rad, PITCH_MIN, PITCH_MAX);
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button !== 2 || !this.turning) return;
      this.turning = false;
      if (document.pointerLockElement === el) document.exitPointerLock();
    });
    // The browser can drop the lock on its own (Esc, tab switch).
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== el) this.turning = false;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + Math.sign(e.deltaY) * 1.2, 3, 22);
      },
      { passive: false },
    );
  }

  private dummyUnder(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.dummy.object, true).length > 0;
  }

  private lockPointer(): void {
    const el = this.container;
    // unadjustedMovement = raw mouse deltas (no OS acceleration) where supported; fall back to a
    // plain lock, and if locking fails entirely, turning still works with a visible cursor.
    const plain = () => Promise.resolve(el.requestPointerLock()).catch(() => undefined);
    try {
      Promise.resolve(el.requestPointerLock({ unadjustedMovement: true })).catch(plain);
    } catch {
      void plain();
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const motion = this.movePlayer(dt);

    this.combat.setPositioning(positioning(this.player, this.dummyPlacement));
    this.combat.update(dt);

    this.rogue.object.position.set(this.player.x, this.body.y, this.player.z);
    this.rogue.object.rotation.y = this.player.yaw;
    this.rogue.update(dt, motion);
    this.dummy.update(dt);

    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  /** Applies held movement keys and jumping; returns the motion for the character's animation. */
  private movePlayer(dt: number): { forward: number; strafe: number; airborne: boolean } {
    const has = (action: string) => [...this.held].some((code) => MOVE_KEYS[code] === action);
    const turn = (has("turnLeft") ? 1 : 0) - (has("turnRight") ? 1 : 0);
    this.player.yaw += turn * TURN_SPEED * dt;

    const input = {
      forward: (has("forward") ? 1 : 0) - (has("back") ? 1 : 0),
      strafe: (has("right") ? 1 : 0) - (has("left") ? 1 : 0),
    };
    const body = this.body;
    stepBody(body, dt, groundVelocity(input, this.player.yaw, this.combat.speedMultiplier), has("jump"));

    // Don't walk through the dummy or off the arena.
    const ox = body.x - this.dummyPlacement.x;
    const oz = body.z - this.dummyPlacement.z;
    const fromDummy = Math.hypot(ox, oz);
    if (fromDummy < DUMMY_RADIUS) {
      body.x = this.dummyPlacement.x + (ox / fromDummy) * DUMMY_RADIUS;
      body.z = this.dummyPlacement.z + (oz / fromDummy) * DUMMY_RADIUS;
    }
    const fromCenter = Math.hypot(body.x, body.z);
    if (fromCenter > ARENA_RADIUS) {
      body.x *= ARENA_RADIUS / fromCenter;
      body.z *= ARENA_RADIUS / fromCenter;
    }
    this.player.x = body.x;
    this.player.z = body.z;
    return { ...input, airborne: body.air !== null };
  }

  private updateCamera(): void {
    const f = forward(this.player.yaw);
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const eye = 1.5 + this.body.y;
    this.camera.position.set(
      this.player.x - f.x * horizontal,
      // Keep the camera above the floor when looking up from low angles.
      Math.max(0.3, eye + 0.1 + Math.sin(this.cameraPitch) * this.cameraDistance),
      this.player.z - f.z * horizontal,
    );
    this.camera.lookAt(this.player.x, eye, this.player.z);
  }

  private onCombatEvent(e: CombatEvent): void {
    switch (e.type) {
      case "use":
        if (e.ability.range !== undefined && e.ability.id !== "premeditation") {
          this.rogue.attack(e.ability.id === "mutilate" ? "both" : "mh");
        }
        break;
      case "damage":
        if (e.sourceId === "melee" && e.hand) this.rogue.attack(e.hand);
        if (e.amount > 0 && !e.periodic && e.school !== "nature") {
          const from = new THREE.Vector3(this.player.x - this.dummyPlacement.x, 0, this.player.z - this.dummyPlacement.z);
          if (from.lengthSq() > 0) this.dummy.hit(from.normalize(), e.outcome === "crit");
        }
        break;
      case "stealth":
        this.rogue.setStealthed(e.active);
        break;
      case "reset":
        this.rogue.setStealthed(false);
        break;
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
