import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  releaseIdentity,
  selectUpdaterAssets,
  buildManifest,
} = require("../.github/scripts/generate-latest-json.cjs");
const names = [
  "LecTura_aarch64.app.tar.gz",
  "LecTura_x64.app.tar.gz",
  "LecTura_0.3.4_x64_en-US.msi.zip",
  "LecTura_0.3.4_x64-setup.nsis.zip",
];
const assets = names.flatMap((name) => [
  { name, size: 100 },
  { name: name + ".sig", size: 100 },
]);
const synthetic = Buffer.from(
  "untrusted comment: synthetic fixture, not a valid cryptographic signature\n",
).toString("base64");
test("release manifest requires every supported signed updater and preserves Windows MSI", () => {
  const selected = selectUpdaterAssets(assets);
  const signatures = Object.fromEntries(
    Object.keys(selected).map((target) => [target, synthetic]),
  );
  const manifest = buildManifest(
    "v0.3.4",
    "TheShahnawaaz/LecTura",
    selected,
    signatures,
    new Date("2026-10-23T00:00:00Z"),
  );
  assert.equal(manifest.version, "0.3.4");
  assert.equal(Object.keys(manifest.platforms).length, 3);
  assert.match(manifest.platforms["windows-x86_64"].url, /\.msi\.zip$/);
  assert.match(manifest.notes, /enabled by default/);
  assert.match(manifest.notes, /Administrator approval/);
});
test("release manifest fails closed on incomplete, ambiguous or unsafe release data", () => {
  assert.throws(() =>
    selectUpdaterAssets(
      assets.filter((a) => !a.name.endsWith("x64.app.tar.gz.sig")),
    ),
  );
  assert.throws(() =>
    selectUpdaterAssets([...assets, { name: "../unsafe", size: 1 }]),
  );
  assert.throws(() => selectUpdaterAssets([...assets, assets[0]]));
  for (const tag of ["v0.3.4;echo", "v0.3.4-beta.1", "", "v01.2.3"])
    assert.throws(() => releaseIdentity(tag, "TheShahnawaaz/LecTura"));
  const selected = selectUpdaterAssets(assets);
  assert.throws(() =>
    buildManifest("v0.3.4", "TheShahnawaaz/LecTura", selected, {}),
  );
  assert.throws(() => buildManifest("v0.3.4", "TheShahnawaaz/LecTura", {}, {}));
});
