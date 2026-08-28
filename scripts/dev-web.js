const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const webDir = path.join(__dirname, "..", "apps", "web");
const webPkg = path.join(webDir, "package.json");

if (!existsSync(webPkg)) {
  console.log("[dev:web] apps/web not scaffolded yet (no package.json) — skipping.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "dev", "--workspace=@url-checker/web"], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 0);
