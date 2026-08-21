export type Axis3 = "x" | "y" | "z";
export type Direction3 = "negative" | "positive";

export type Point3 = Record<Axis3, number>;

export type Bounds3 = {
  min: Point3;
  max: Point3;
};

export type SpatialObstacle = {
  id: string;
  label: string;
  bounds: Bounds3;
};

export type Clearance = {
  key: `${Axis3}-${Direction3}`;
  axis: Axis3;
  direction: Direction3;
  distance: number;
  referenceId: string;
  referenceLabel: string;
  referenceCoordinate: number;
};

export type SpatialMetrics = {
  dimensions: Point3;
  center: Point3;
  clearances: Clearance[];
};

export const AXES: Axis3[] = ["x", "y", "z"];

const otherAxes = (axis: Axis3) => AXES.filter(candidate => candidate !== axis);

const overlaps = (a: Bounds3, b: Bounds3, axis: Axis3) =>
  otherAxes(axis).every(other => a.min[other] < b.max[other] && a.max[other] > b.min[other]);

export function measureSpatialRelationships(
  selected: Bounds3,
  obstacles: SpatialObstacle[],
  room: Bounds3,
): SpatialMetrics {
  const dimensions = Object.fromEntries(
    AXES.map(axis => [axis, Math.max(0, selected.max[axis] - selected.min[axis])]),
  ) as Point3;
  const center = Object.fromEntries(
    AXES.map(axis => [axis, (selected.min[axis] + selected.max[axis]) / 2]),
  ) as Point3;

  const clearances: Clearance[] = [];

  for (const axis of AXES) {
    const roomLabels = axis === "x"
      ? ["左侧墙体", "右侧墙体"]
      : axis === "y"
        ? ["地面", "顶面"]
        : ["后侧墙体", "前侧墙体"];

    const nearest = {
      negative: {
        distance: Math.max(0, selected.min[axis] - room.min[axis]),
        referenceId: `room-${axis}-negative`,
        referenceLabel: roomLabels[0],
        referenceCoordinate: room.min[axis],
      },
      positive: {
        distance: Math.max(0, room.max[axis] - selected.max[axis]),
        referenceId: `room-${axis}-positive`,
        referenceLabel: roomLabels[1],
        referenceCoordinate: room.max[axis],
      },
    };

    for (const obstacle of obstacles) {
      if (!overlaps(selected, obstacle.bounds, axis)) continue;

      if (obstacle.bounds.max[axis] <= selected.min[axis]) {
        const distance = selected.min[axis] - obstacle.bounds.max[axis];
        if (distance < nearest.negative.distance) {
          nearest.negative = {
            distance,
            referenceId: obstacle.id,
            referenceLabel: obstacle.label,
            referenceCoordinate: obstacle.bounds.max[axis],
          };
        }
      }

      if (obstacle.bounds.min[axis] >= selected.max[axis]) {
        const distance = obstacle.bounds.min[axis] - selected.max[axis];
        if (distance < nearest.positive.distance) {
          nearest.positive = {
            distance,
            referenceId: obstacle.id,
            referenceLabel: obstacle.label,
            referenceCoordinate: obstacle.bounds.min[axis],
          };
        }
      }
    }

    for (const direction of ["negative", "positive"] as const) {
      clearances.push({
        key: `${axis}-${direction}`,
        axis,
        direction,
        ...nearest[direction],
      });
    }
  }

  return { dimensions, center, clearances };
}

export function movementForClearance(clearance: Clearance, targetDistance: number) {
  const target = Math.max(0, targetDistance);
  return clearance.direction === "negative"
    ? target - clearance.distance
    : clearance.distance - target;
}

export function scaleForDimension(currentSize: number, targetSize: number) {
  if (!Number.isFinite(currentSize) || currentSize <= 0) return 1;
  return Math.max(0.01, targetSize) / currentSize;
}
