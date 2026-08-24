export const PROJECT_SCHEMA_VERSION = 1;

export const ROOM_LIMITS = Object.freeze({
  width: Object.freeze({ min: 0.01 }),
  depth: Object.freeze({ min: 0.01 }),
  height: Object.freeze({ min: 1.8 }),
});

export function boundsForSizedObject(object) {
  const angle = object.rotationY * Math.PI / 180;
  const halfX = (Math.abs(Math.cos(angle)) * object.size.x + Math.abs(Math.sin(angle)) * object.size.z) / 2;
  const halfZ = (Math.abs(Math.sin(angle)) * object.size.x + Math.abs(Math.cos(angle)) * object.size.z) / 2;
  return {
    min: { x: object.position.x - halfX, y: object.position.y, z: object.position.z - halfZ },
    max: { x: object.position.x + halfX, y: object.position.y + object.size.y, z: object.position.z + halfZ },
  };
}

export function objectOutsideRoomBounds(room, object) {
  const bounds = boundsForSizedObject(object);
  return bounds.min.x < -room.width / 2
    || bounds.max.x > room.width / 2
    || bounds.min.z < -room.depth / 2
    || bounds.max.z > room.depth / 2
    || bounds.min.y < 0
    || bounds.max.y > room.height;
}

const boundsOverlap = (a, b) => a.min.x < b.max.x && a.max.x > b.min.x
  && a.min.y < b.max.y && a.max.y > b.min.y
  && a.min.z < b.max.z && a.max.z > b.min.z;

export function spatialIssuesForObject(room, object, candidates = []) {
  const issues = [];
  const bounds = boundsForSizedObject(object);
  if (objectOutsideRoomBounds(room, object)) {
    issues.push({ code: "OUTSIDE_ROOM", objectId: object.id, message: "对象超出房间边界" });
  }
  for (const candidate of candidates) {
    if (candidate.id === object.id) continue;
    if (boundsOverlap(bounds, boundsForSizedObject(candidate))) {
      issues.push({ code: "OBJECT_COLLISION", objectId: object.id, referenceId: candidate.id, message: `与${candidate.label}发生重叠` });
    }
  }
  return issues;
}
