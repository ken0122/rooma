import { performance } from "node:perf_hooks";
import { measureSpatialRelationships, type Bounds3, type SpatialObstacle } from "../lib/engine/spatial.ts";

const room: Bounds3 = { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 4, z: 50 } };
const selected: Bounds3 = { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } };

const obstacles: SpatialObstacle[] = Array.from({ length: 1_000 }, (_, index) => {
  const ring = Math.floor(index / 40) + 1;
  const slot = index % 40;
  const angle = (slot / 40) * Math.PI * 2;
  const x = Math.cos(angle) * ring * 1.6;
  const z = Math.sin(angle) * ring * 1.6;
  return {
    id: `object-${index}`,
    label: `Object ${index}`,
    bounds: { min: { x: x - 0.4, y: 0, z: z - 0.4 }, max: { x: x + 0.4, y: 1, z: z + 0.4 } },
  };
});

for (let index = 0; index < 20; index++) measureSpatialRelationships(selected, obstacles, room);
const samples: number[] = [];
for (let index = 0; index < 200; index++) {
  const started = performance.now();
  measureSpatialRelationships(selected, obstacles, room);
  samples.push(performance.now() - started);
}
samples.sort((a, b) => a - b);

console.log(JSON.stringify({
  objects: obstacles.length,
  iterations: samples.length,
  medianMs: Number(samples[Math.floor(samples.length * 0.5)].toFixed(3)),
  p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(3)),
  maxMs: Number(samples.at(-1)?.toFixed(3)),
}));
