import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/deploy-production.yml", import.meta.url);

test("production CI/CD tests main and deploys the expected Worker", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /push:\n\s+branches:\n\s+- main/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npx wrangler deploy/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /--config dist\/server\/wrangler\.json/);
  assert.match(workflow, /--name rooma-3d-editor/);
  assert.match(workflow, /https:\/\/rooma-3d-editor\.ron-nextop\.workers\.dev\//);
  assert.doesNotMatch(workflow, /96441edebd0990b5f991745140f435c4|authorization:\s*bearer/i);
});
