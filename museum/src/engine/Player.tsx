import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import type { Collider, KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { Group, Raycaster, Vector2, Vector3, type Object3D } from "three";
import type { Entity } from "koota";
import { EYE_HEIGHT, type FloorPlan } from "../../../shared/museum/generate";
import { viewpoint } from "../../../shared/museum/floorplan";
import { BENCH_DEPTH, SEAT_HEIGHT, type Prop } from "../../../shared/museum/props";
import { IsLocal, Look, Position, world } from "./ecs";
import { LOOK_SENSITIVITY, readIntent, takeLook } from "./input";
import { ui } from "../ui/store";
import { ambience } from "../audio/ambience";
import type { NetAdapter } from "../net/NetAdapter";

const WALK = 1.4;
const RUN = 3.2;
const ACCEL = 10;
const GRAVITY = 9.81;
const RADIUS = 0.3;
const HALF_HEIGHT = 0.55;
/** Body center above the feet. */
const CENTER = HALF_HEIGHT + RADIUS;
const LOOK_RANGE = 5;
const SEAT_RANGE = 2.6;
/** Eye height above the seat when sitting. */
const SEATED_EYE = 0.74;

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

type Bench = Extract<Prop, { kind: "bench" }>;
type Props = { plan: FloorPlan; benches: Bench[]; net: NetAdapter; start: { x: number; y: number; z: number; yaw: number } };

/**
 * Where someone sits on a bench, coming from `from`: facing the bench's view if it has one,
 * otherwise back the way they came. They get up again on the side they came from.
 */
function seatPose(b: Bench, from: Vector3) {
  const dir = new Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
  const normal = new Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
  const rel = from.clone().sub(new Vector3(b.x, b.y, b.z));
  const cameFrom = Math.sign(rel.dot(normal)) || 1;
  const along = Math.max(-b.length / 2 + 0.35, Math.min(b.length / 2 - 0.35, rel.dot(dir)));
  const seat = new Vector3(b.x, b.y, b.z).addScaledVector(dir, along);
  const face = normal.clone().multiplyScalar(b.facing ?? cameFrom);
  return {
    eye: seat.clone().addScaledVector(face, 0.06).setY(b.y + SEAT_HEIGHT + SEATED_EYE),
    stand: seat.clone().addScaledVector(normal, cameFrom * (BENCH_DEPTH / 2 + RADIUS + 0.12)),
    yaw: Math.atan2(-face.x, -face.z),
  };
}

/** The local guest: a capsule moved by Rapier's character controller, with the camera at eye height. */
export function Player({ plan, benches, net, start }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<Collider>(null);
  const eye = useRef<Group>(null);
  const { world: physics } = useRapier();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const entityRef = useRef<Entity | null>(null);
  useEffect(() => {
    const entity = world.spawn(IsLocal, Position({ x: start.x, y: start.y, z: start.z }), Look({ yaw: start.yaw }));
    entityRef.current = entity;
    void net.connect(entity);
    return () => {
      net.disconnect();
      entity.destroy();
      entityRef.current = null;
    };
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps -- `start` only matters on the first spawn

  const controllerRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = physics.createCharacterController(0.02);
    c.setSlideEnabled(true);
    c.enableSnapToGround(0.35);
    c.enableAutostep(0.25, 0.2, true);
    c.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      physics.removeCharacterController(c);
    };
  }, [physics]);

  const velocity = useRef({ x: 0, y: 0, z: 0 });
  // Dev only: lets headless tests stand anywhere and look anywhere.
  const teleport = useRef<{ x: number; y: number; z: number; yaw: number; pitch: number } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hook = (window as unknown as { __museum?: Record<string, unknown> }).__museum;
    if (hook) hook.teleport = (x: number, y: number, z: number, yaw: number, pitch = 0) => void (teleport.current = { x, y, z, yaw, pitch });
  }, []);
  /** `turned` once the view has swung round to the seat's direction; then the mouse is free. */
  const sitting = useRef<{ bench: number; pose: ReturnType<typeof seatPose>; turned: boolean } | null>(null);
  const sitBlend = useRef(0);

  // Fixed 60 Hz simulation step: the same shape a networked game needs (plan §6).
  useBeforePhysicsStep((w) => {
    const b = body.current, col = collider.current, entity = entityRef.current, controller = controllerRef.current;
    if (!b || !col || !entity || !controller) return;
    const dt = w.timestep;
    const look = entity.get(Look)!;
    const t = b.translation();
    const { focused, seated, walking } = ui.get();

    if (teleport.current) {
      const p = teleport.current;
      teleport.current = null;
      b.setNextKinematicTranslation({ x: p.x, y: p.y + CENTER, z: p.z });
      entity.set(Look, { yaw: p.yaw, pitch: p.pitch });
    } else if (focused) {
      // Glide to the viewing spot in front of the work, ignoring walls (it's in the same room).
      const slot = plan.slots.find((s) => s.exhibitId === focused);
      if (slot) {
        const v = viewpoint(slot);
        const k = 1 - Math.exp(-dt * 4);
        b.setNextKinematicTranslation({ x: t.x + (v.x - t.x) * k, y: t.y + (v.y + CENTER - t.y) * k, z: t.z + (v.z - t.z) * k });
        const pitch = Math.atan2(slot.y - (v.y + EYE_HEIGHT), v.distance);
        entity.set(Look, { yaw: angleLerp(look.yaw, v.yaw, k), pitch: look.pitch + (pitch - look.pitch) * k });
      }
      velocity.current = { x: 0, y: 0, z: 0 };
    } else if (seated !== null) {
      const intent = readIntent();
      if (walking && (intent.move.x || intent.move.y)) ui.set({ seated: null });
      if (!sitting.current || sitting.current.bench !== seated) {
        const pose = seatPose(benches[seated], new Vector3(t.x, t.y - CENTER, t.z));
        sitting.current = { bench: seated, pose, turned: false };
        // Stand just in front of the bench, so getting up never starts inside it.
        b.setNextKinematicTranslation({ x: pose.stand.x, y: t.y, z: pose.stand.z });
      }
      if (!sitting.current.turned) {
        const k = 1 - Math.exp(-dt * 4);
        const yaw = angleLerp(look.yaw, sitting.current.pose.yaw, k);
        entity.set(Look, { yaw, pitch: look.pitch * (1 - k) });
        const off = Math.abs(Math.atan2(Math.sin(yaw - sitting.current.pose.yaw), Math.cos(yaw - sitting.current.pose.yaw)));
        sitting.current.turned = off < 0.02 && Math.abs(look.pitch) < 0.03;
      }
      velocity.current = { x: 0, y: 0, z: 0 };
    } else {
      sitting.current = null;
      const intent = walking ? readIntent() : { move: { x: 0, y: 0 }, run: false };
      const speed = intent.run ? RUN : WALK;
      const sin = Math.sin(look.yaw), cos = Math.cos(look.yaw);
      // Forward is (−sin, −cos); right is (cos, −sin).
      const tx = (-sin * intent.move.y + cos * intent.move.x) * speed;
      const tz = (-cos * intent.move.y - sin * intent.move.x) * speed;
      const v = velocity.current;
      const k = 1 - Math.exp(-dt * ACCEL);
      v.x += (tx - v.x) * k;
      v.z += (tz - v.z) * k;
      v.y = controller.computedGrounded() ? -0.5 : v.y - GRAVITY * dt;
      controller.computeColliderMovement(col, { x: v.x * dt, y: v.y * dt, z: v.z * dt });
      const m = controller.computedMovement();
      b.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    }
    const n = b.nextTranslation();
    entity.set(Position, { x: n.x, y: n.y - CENTER, z: n.z });
    net.tick();
  });

  const raycaster = useMemo(() => new Raycaster(), []);
  const center = useMemo(() => new Vector2(0, 0), []);
  const eyePos = useMemo(() => new Vector3(), []);
  const pickable = useRef<Object3D[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      // Only what's drawn: far rooms are hidden, and testing every wall in the museum each frame is slow.
      const found: Object3D[] = [];
      scene.traverseVisible((o) => (o.userData.exhibitId || o.userData.occluder || o.userData.seat !== undefined) && found.push(o));
      pickable.current = found;
    }, 500);
    return () => clearInterval(id);
  }, [scene]);

  useFrame((_, delta) => {
    const entity = entityRef.current;
    if (!entity) return;
    const { walking, focused, seated } = ui.get();
    // Mouse look applies every rendered frame, not just on physics steps, so it never lags.
    if (walking && !focused) {
      const { dx, dy } = takeLook();
      const look = entity.get(Look)!;
      entity.set(Look, {
        yaw: look.yaw - dx * LOOK_SENSITIVITY,
        pitch: Math.max(-1.4, Math.min(1.4, look.pitch - dy * LOOK_SENSITIVITY)),
      });
    } else takeLook();

    // The eye group is interpolated between physics steps by @react-three/rapier; sitting blends
    // the camera down onto the seat.
    eye.current!.getWorldPosition(eyePos);
    sitBlend.current = Math.max(0, Math.min(1, sitBlend.current + (seated !== null && sitting.current ? delta : -delta) * 1.8));
    if (sitting.current && sitBlend.current > 0) eyePos.lerp(sitting.current.pose.eye, smooth(sitBlend.current));
    const look = entity.get(Look)!;
    camera.position.copy(eyePos);
    camera.rotation.set(look.pitch, look.yaw, 0, "YXZ");
    ambience.listen(eyePos.x, eyePos.y, eyePos.z, look.yaw);

    if (!focused && seated === null) {
      raycaster.setFromCamera(center, camera);
      raycaster.far = LOOK_RANGE;
      const hit = raycaster.intersectObjects(pickable.current, false)[0];
      const art = hit?.object.userData.exhibitId as string | undefined;
      const seat = hit && hit.distance < SEAT_RANGE ? (hit.object.userData.seat as number | undefined) : undefined;
      ui.set({ hovered: art ?? null, hoveredSeat: seat ?? null });
    } else ui.set({ hovered: null, hoveredSeat: null });
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y + CENTER, start.z]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[HALF_HEIGHT, RADIUS]} />
      <group ref={eye} position={[0, EYE_HEIGHT - CENTER, 0]} />
    </RigidBody>
  );
}
