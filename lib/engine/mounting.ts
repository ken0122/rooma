import type { Point3 } from "./spatial";

export type MountSurface = "floor" | "wall" | "ceiling";
export type WallFace = "x-negative" | "x-positive" | "z-negative" | "z-positive";

export const MOUNT_SURFACE_LABELS: Record<MountSurface, string> = {
  floor: "地面",
  wall: "墙面",
  ceiling: "顶面",
};

export type MountRoom = { width: number; depth: number; height: number };

const rotatedHalfExtents = (size: Point3, rotationY: number) => {
  const angle = rotationY * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  return {
    x: (size.x * cosine + size.z * sine) / 2,
    z: (size.x * sine + size.z * cosine) / 2,
  };
};

const wallCoordinate = (face: WallFace, half: { x: number; z: number }, room: MountRoom) => {
  if (face === "x-negative") return -room.width / 2 + half.x;
  if (face === "x-positive") return room.width / 2 - half.x;
  if (face === "z-negative") return -room.depth / 2 + half.z;
  return room.depth / 2 - half.z;
};

export function nearestWallFace(position: Point3, size: Point3, rotationY: number, room: MountRoom): WallFace {
  const half = rotatedHalfExtents(size, rotationY);
  const candidates: Array<[WallFace, number]> = [
    ["x-negative", Math.abs(position.x - wallCoordinate("x-negative", half, room))],
    ["x-positive", Math.abs(position.x - wallCoordinate("x-positive", half, room))],
    ["z-negative", Math.abs(position.z - wallCoordinate("z-negative", half, room))],
    ["z-positive", Math.abs(position.z - wallCoordinate("z-positive", half, room))],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0][0];
}

export function mountLockedAxes(surface: MountSurface, wallFace?: WallFace): Array<keyof Point3> {
  if (surface === "floor" || surface === "ceiling") return ["y"];
  return [wallFace?.startsWith("x-") ? "x" : "z"];
}

export function constrainPositionToMount({ surface, position, size, rotationY, room, wallFace }: {
  surface: MountSurface;
  position: Point3;
  size: Point3;
  rotationY: number;
  room: MountRoom;
  wallFace?: WallFace;
}) {
  const half = rotatedHalfExtents(size, rotationY);
  const face = surface === "wall" ? wallFace ?? nearestWallFace(position, size, rotationY, room) : undefined;
  const next = {
    x: Math.max(-room.width / 2 + half.x, Math.min(room.width / 2 - half.x, position.x)),
    y: Math.max(0, Math.min(room.height - size.y, position.y)),
    z: Math.max(-room.depth / 2 + half.z, Math.min(room.depth / 2 - half.z, position.z)),
  };

  if (surface === "floor") next.y = 0;
  if (surface === "ceiling") next.y = Math.max(0, room.height - size.y);
  if (face?.startsWith("x-")) next.x = wallCoordinate(face, half, room);
  if (face?.startsWith("z-")) next.z = wallCoordinate(face, half, room);
  return { position: next, wallFace: face };
}

export function defaultMountedPosition({ surface, size, room, elevation = 0, offset = 0 }: {
  surface: MountSurface;
  size: Point3;
  room: MountRoom;
  elevation?: number;
  offset?: number;
}) {
  const position = { x: offset, y: elevation, z: offset };
  return constrainPositionToMount({ surface, position, size, rotationY: 0, room, wallFace: surface === "wall" ? "z-negative" : undefined });
}
