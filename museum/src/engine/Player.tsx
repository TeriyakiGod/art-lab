import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import type { Collider, KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { Group, Raycaster, Vector2, Vector3, type Object3D } from "three";
import type { Entity } from "koota";
import { EYE_HEIGHT, type FloorPlan } from "../../../shared/museum/generate";
import { viewpoint } from "../../../shared/museum/floorplan";
import { IsLocal, Look, Position, world } from "./ecs";
import { LOOK_SENSITIVITY, readIntent, takeLook } from "./input";
import { ui } from "../ui/store";
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

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

type Props = { plan: FloorPlan; net: NetAdapter; start: { x: number; z: number; yaw: number } };

/** The local guest: a capsule moved by Rapier's character controller, with the camera at eye height. */
export function Player({ plan, net, start }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<Collider>(null);
  const eye = useRef<Group>(null);
  const { world: physics } = useRapier();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const entityRef = useRef<Entity | null>(null);
  useEffect(() => {
    const entity = world.spawn(IsLocal, Position({ x: start.x, y: 0, z: start.z }), Look({ yaw: start.yaw }));
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
    c.enableSnapToGround(0.3);
    c.enableAutostep(0.25, 0.2, true);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      physics.removeCharacterController(c);
    };
  }, [physics]);

  const velocity = useRef({ x: 0, y: 0, z: 0 });

  // Fixed 60 Hz simulation step: the same shape a networked game needs (plan §6).
  useBeforePhysicsStep((w) => {
    const b = body.current, col = collider.current, entity = entityRef.current, controller = controllerRef.current;
    if (!b || !col || !entity || !controller) return;
    const dt = w.timestep;
    const look = entity.get(Look)!;
    const t = b.translation();
    const focusId = ui.get().focused;

    if (focusId) {
      // Glide to the viewing spot in front of the work, ignoring walls (it's in the same room).
      const slot = plan.slots.find((s) => s.exhibitId === focusId);
      if (slot) {
        const v = viewpoint(slot);
        const k = 1 - Math.exp(-dt * 4);
        b.setNextKinematicTranslation({ x: t.x + (v.x - t.x) * k, y: CENTER, z: t.z + (v.z - t.z) * k });
        const pitch = Math.atan2(slot.y - EYE_HEIGHT, v.distance);
        entity.set(Look, { yaw: angleLerp(look.yaw, v.yaw, k), pitch: look.pitch + (pitch - look.pitch) * k });
      }
      velocity.current = { x: 0, y: 0, z: 0 };
    } else {
      const intent = ui.get().walking ? readIntent() : { move: { x: 0, y: 0 }, run: false };
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

  const raycaster = useMemo(() => {
    const r = new Raycaster();
    r.far = LOOK_RANGE;
    return r;
  }, []);
  const center = useMemo(() => new Vector2(0, 0), []);
  const eyePos = useMemo(() => new Vector3(), []);
  const artMeshes = useRef<Object3D[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const found: Object3D[] = [];
      scene.traverse((o) => (o.userData.exhibitId || o.userData.occluder) && found.push(o));
      artMeshes.current = found;
    }, 1000);
    return () => clearInterval(id);
  }, [scene]);

  useFrame(() => {
    const entity = entityRef.current;
    if (!entity) return;
    // Mouse look applies every rendered frame, not just on physics steps, so it never lags.
    if (ui.get().walking && !ui.get().focused) {
      const { dx, dy } = takeLook();
      const look = entity.get(Look)!;
      entity.set(Look, {
        yaw: look.yaw - dx * LOOK_SENSITIVITY,
        pitch: Math.max(-1.4, Math.min(1.4, look.pitch - dy * LOOK_SENSITIVITY)),
      });
    } else takeLook();

    // The eye group is interpolated between physics steps by @react-three/rapier.
    eye.current!.getWorldPosition(eyePos);
    const look = entity.get(Look)!;
    camera.position.copy(eyePos);
    camera.rotation.set(look.pitch, look.yaw, 0, "YXZ");

    if (!ui.get().focused) {
      raycaster.setFromCamera(center, camera);
      const hit = raycaster.intersectObjects(artMeshes.current, false)[0];
      ui.set({ hovered: (hit?.object.userData.exhibitId as string | undefined) ?? null });
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, CENTER, start.z]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[HALF_HEIGHT, RADIUS]} />
      <group ref={eye} position={[0, EYE_HEIGHT - CENTER, 0]} />
    </RigidBody>
  );
}
