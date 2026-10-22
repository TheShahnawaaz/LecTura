const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function releaseIdentity(tag, repo) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || ""))
    throw new Error("A stable vMAJOR.MINOR.PATCH tag is required");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || ""))
    throw new Error("An explicit GitHub owner/repository is required");
  return tag.slice(1);
}

function selectUpdaterAssets(assets) {
  const names = new Map();
  for (const asset of assets) {
    if (!/^[A-Za-z0-9_.-]+$/.test(asset.name) || names.has(asset.name))
      throw new Error("Unsafe or duplicate release asset name");
    names.set(asset.name, asset);
  }
  const targets = {
    "darwin-aarch64": /aarch64\.app\.tar\.gz$/,
    "darwin-x86_64": /(?:x64|x86_64)\.app\.tar\.gz$/,
    // Preserve the existing stable feed's MSI updater format for Windows.
    "windows-x86_64": /(?:x64|x86_64).*\.msi\.zip$/,
  };
  const selected = {};
  for (const [target, pattern] of Object.entries(targets)) {
    const matches = assets.filter((asset) => pattern.test(asset.name));
    if (matches.length !== 1)
      throw new Error(`Expected exactly one updater bundle for ${target}`);
    const bundle = matches[0];
    const signature = names.get(bundle.name + ".sig");
    if (!signature || !(bundle.size > 0) || !(signature.size > 0))
      throw new Error(`Missing or empty signed updater for ${target}`);
    selected[target] = { bundle, signature };
  }
  return selected;
}

function buildManifest(tag, repo, selected, signatures, date = new Date()) {
  const version = releaseIdentity(tag, repo);
  const platforms = {};
  for (const [target, { bundle }] of Object.entries(selected)) {
    const signature = signatures[target]?.trim();
    if (
      !signature ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) ||
      !Buffer.from(signature, "base64")
        .toString("utf8")
        .startsWith("untrusted comment:")
    )
      throw new Error(`Invalid encoded signature for ${target}`);
    platforms[target] = {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${bundle.name}`,
    };
  }
  if (
    Object.keys(platforms).sort().join(",") !==
    "darwin-aarch64,darwin-x86_64,windows-x86_64"
  )
    throw new Error("All three supported updater targets are required");
  return {
    version,
    notes: `LecTura ${tag}: Adds study sharing, enabled by default, with a visible notice and pause control. Administrator approval is required before study-data uploads. Notes, screenshots and files remain local.`,
    pub_date: date.toISOString(),
    platforms,
  };
}

function main() {
  const tag = process.env.TAG_NAME;
  const repo = process.env.GITHUB_REPOSITORY;
  const version = releaseIdentity(tag, repo);
  if (JSON.parse(fs.readFileSync("package.json", "utf8")).version !== version)
    throw new Error("Release tag and checked-out application version differ");
  const verifier = process.env.LECTURA_UPDATER_VERIFIER;
  if (!verifier || !fs.existsSync(verifier))
    throw new Error("The trusted Minisign verifier is required");
  const release = JSON.parse(
    execFileSync(
      "gh",
      [
        "release",
        "view",
        tag,
        "--repo",
        repo,
        "--json",
        "isDraft,assets,tagName",
      ],
      { encoding: "utf8" },
    ),
  );
  if (!release.isDraft || release.tagName !== tag)
    throw new Error(
      "Updater preparation only writes to the matching draft release",
    );
  const selected = selectUpdaterAssets(release.assets);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lectura-updater-"));
  try {
    const publicKey = JSON.parse(
      fs.readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ).tauri.updater.pubkey;
    const publicKeyPath = path.join(temporary, "updater.pub");
    fs.writeFileSync(publicKeyPath, Buffer.from(publicKey, "base64"));
    const signatures = {};
    for (const [target, { bundle, signature }] of Object.entries(selected)) {
      for (const asset of [bundle, signature])
        execFileSync(
          "gh",
          [
            "release",
            "download",
            tag,
            "--repo",
            repo,
            "--pattern",
            asset.name,
            "--dir",
            temporary,
          ],
          { stdio: "inherit" },
        );
      const encoded = fs
        .readFileSync(path.join(temporary, signature.name), "utf8")
        .trim();
      const decodedPath = path.join(temporary, signature.name + ".decoded");
      fs.writeFileSync(decodedPath, Buffer.from(encoded, "base64"));
      execFileSync(
        verifier,
        [publicKeyPath, decodedPath, path.join(temporary, bundle.name)],
        { stdio: "inherit" },
      );
      signatures[target] = encoded;
      console.log(`Verified ${target}: ${bundle.name}`);
    }
    const manifest = buildManifest(tag, repo, selected, signatures);
    fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n");
    execFileSync(
      "gh",
      ["release", "upload", tag, "latest.json", "--repo", repo, "--clobber"],
      { stdio: "inherit" },
    );
    console.log(
      "All updater packages verified; latest.json uploaded to the draft. Publication remains a separate action.",
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { releaseIdentity, selectUpdaterAssets, buildManifest };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
