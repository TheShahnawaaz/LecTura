const { execSync } = require('child_process');
const fs = require('fs');

const tagName = process.env.TAG_NAME;
const repo = process.env.GITHUB_REPOSITORY; // format: owner/repo
if (!tagName) {
  console.error("TAG_NAME environment variable is required");
  process.exit(1);
}
if (!repo) {
  console.error("GITHUB_REPOSITORY environment variable is required");
  process.exit(1);
}

const version = tagName.replace(/^v/, '');

// Run gh command to get all assets of the release
console.log(`Fetching release assets for tag ${tagName}...`);
const output = execSync(`gh release view ${tagName} --json assets`, { encoding: 'utf8' });
const { assets } = JSON.parse(output);

console.log("Found assets in release:", assets.map(a => a.name));

const platforms = {};

// We want to process each signature file
for (const asset of assets) {
  if (asset.name.endsWith('.sig')) {
    const sigFileName = asset.name;
    const targetFileName = sigFileName.slice(0, -4); // Remove .sig
    
    // Find the corresponding binary asset
    const targetAsset = assets.find(a => a.name === targetFileName);
    if (!targetAsset) {
      console.warn(`Corresponding asset for signature ${sigFileName} not found, skipping.`);
      continue;
    }
    
    // Download the .sig file to read its contents
    console.log(`Downloading signature: ${sigFileName}`);
    execSync(`gh release download ${tagName} -p "${sigFileName}" --clobber`);
    
    const signature = fs.readFileSync(sigFileName, 'utf8').trim();
    
    // Determine platform from filename
    // Standard Tauri v1 updater targets:
    // macOS Apple Silicon: LecTura_0.1.0_aarch64.app.tar.gz.sig
    // macOS Intel: LecTura_0.1.0_x64.app.tar.gz.sig
    // Windows x86_64: LecTura_0.1.0_x64_en-US.msi.zip.sig
    let platformKey = null;
    if (sigFileName.includes('aarch64.app.tar.gz')) {
      platformKey = 'darwin-aarch64';
    } else if (sigFileName.includes('x64.app.tar.gz')) {
      platformKey = 'darwin-x86_64';
    } else if (sigFileName.includes('msi.zip') && (sigFileName.includes('x64') || sigFileName.includes('x86_64'))) {
      platformKey = 'windows-x86_64';
    } else if (sigFileName.includes('nsis.zip') && (sigFileName.includes('x64') || sigFileName.includes('x86_64'))) {
      platformKey = 'windows-x86_64';
    }
    
    if (platformKey) {
      platforms[platformKey] = {
        signature: signature,
        url: `https://github.com/${repo}/releases/download/${tagName}/${targetFileName}`
      };
      console.log(`Added platform ${platformKey} with URL: ${platforms[platformKey].url}`);
    } else {
      console.warn(`Could not determine platform for signature file: ${sigFileName}`);
    }
    
    // Clean up local signature file
    try {
      fs.unlinkSync(sigFileName);
    } catch (err) {}
  }
}

// Build the latest.json structure
const latestJson = {
  version: version,
  notes: `LecTura Release ${tagName}`,
  pub_date: new Date().toISOString(),
  platforms: platforms
};

console.log("Generated latest.json:", JSON.stringify(latestJson, null, 2));

fs.writeFileSync('latest.json', JSON.stringify(latestJson, null, 2));

// Upload to GitHub release
console.log("Uploading latest.json to release...");
execSync(`gh release upload ${tagName} latest.json --clobber`);
console.log("Upload completed successfully!");
