# LecTura: GitHub Integration & Auto-Updater Pipeline

This document explains the configuration of our GitHub Repository, GitHub CLI usage, and the automated CI/CD pipeline built for compiling release binaries and serving updates.

---

## 1. GitHub Repository & CLI Context

* **Repository Remote**: `https://github.com/TheShahnawaaz/LecTura`
* **Local CLI Authentication**: Verified as active user `TheShahnawaaz` with `repo`, `workflow`, and `read:org` token scopes.
* **CLI Local Use cases**: 
  - Manage releases: `gh release list`, `gh release view`
  - Monitor builds: `gh run list`, `gh run watch`
  - Dispatch workflows manually if needed.

---

## 2. Serverless Auto-Updater Architecture

Tauri v1 contains a built-in auto-updater. Rather than running a dedicated web server to evaluate updater responses, we use a **serverless architecture hosted entirely on GitHub Releases**.

### How it Works:
1. **Updater Endpoint**: The application queries a static `latest.json` file hosted directly on the "latest" release download URL:
   `https://github.com/TheShahnawaaz/LecTura/releases/latest/download/latest.json`
2. **Version Comparison**: The app compares its local version (e.g. `0.1.0`) with the version defined in `latest.json`.
3. **Download & Decrypt**: If a newer version exists, the app downloads the update zip/tarball from GitHub and uses the public Minisign key to decrypt and verify the signature before running the updater package.

### Configuration in [tauri.conf.json](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src-tauri/tauri.conf.json):
```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/TheShahnawaaz/LecTura/releases/latest/download/latest.json"
  ],
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCRjEwODg0MzZDQzkyMTcKUldRWGtzdzJoQWp4cXhUb1ZuVExVY01VSklDbWxsekt6aUVnZzVZMHNEMVc1NmlkYWFYdU52WGwK",
  "dialog": true
}
```

---

## 3. Cryptographic Code Signing (Minisign)

To prevent attackers from uploading malicious binaries to your repository and forcing updates on your users, Tauri requires all updater packages to be signed with **Minisign** private/public key pairs.

### Current Key Pair Setup:
A key pair was successfully generated and saved:
1. **Public Key**: Confirmed and added to [tauri.conf.json](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src-tauri/tauri.conf.json):
   `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCRjEwODg0MzZDQzkyMTcKUldRWGtzdzJoQWp4cXhUb1ZuVExVY01VSklDbWxsekt6aUVnZzVZMHNEMVc1NmlkYWFYdU52WGwK`
2. **Private Key (GitHub Secrets)**: Encrypted key block generated. Add it to your GitHub Repository Secrets as `TAURI_PRIVATE_KEY`.
3. **Private Key Password (GitHub Secrets)**: The password used to encrypt the private key. Add it to your GitHub Repository Secrets as `TAURI_KEY_PASSWORD`.

Additionally, the keys are saved locally on this machine for local compilation:
* **Private Key Path**: `/Users/shahnawaz/.tauri/lectura.key` (or `~/.tauri/lectura.key`)
* **Public Key Path**: `/Users/shahnawaz/.tauri/lectura.key.pub` (or `~/.tauri/lectura.key.pub`)

> [!NOTE]
> The GitHub Actions workflow is configured to accept both `TAURI_PRIVATE_KEY`/`TAURI_KEY_PASSWORD` and `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` format styles for cross-compatibility.



---

## 4. GitHub Actions Release Workflow

We have configured a two-stage GitHub Action workflow at [.github/workflows/release.yml](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/.github/workflows/release.yml) to automate target compilations and updater updates.

```mermaid
flowchain
    Tag_Push("Push Tag: v0.1.1") --> Matrix_Build
    subgraph Matrix_Build["Job 1: Matrix Build & Release"]
        mac_arm["macOS Apple Silicon (aarch64)"]
        mac_intel["macOS Intel (x86_64)"]
        win_x64["Windows (x86_64)"]
    end
    mac_arm --> upload_release["Upload targets & .sig signatures to GH Release"]
    mac_intel --> upload_release
    win_x64 --> upload_release
    upload_release --> Job_Updater
    subgraph Job_Updater["Job 2: Generate latest.json"]
        fetch_release["Fetch release assets using GH CLI"]
        read_sigs["Download & read .sig signature strings"]
        write_json["Build latest.json structure"]
        upload_json["Upload latest.json to GH Release"]
    end
```

### 1. Job: `release` (Build Matrix)
* **Trigger**: Triggered automatically when you push a version tag like `v0.1.1`.
* **Targets Built**:
  - macOS (Apple Silicon `aarch64-apple-darwin` and Intel `x86_64-apple-darwin`).
  - Windows (`x86_64-pc-windows-msvc`).
* **Version Sync**: Dynamically bumps the version in `package.json`, [tauri.conf.json](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src-tauri/tauri.conf.json), and [Cargo.toml](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src-tauri/Cargo.toml) based on the git tag pushed.
* **Publishing**: Uses the official `tauri-apps/tauri-action` to draft/publish the release and upload the binaries alongside their cryptographic `.sig` files.

### 2. Job: `updater-json` (Compilation)
Runs on `ubuntu-latest` after all matrix builds finish. It executes the script [.github/scripts/generate-latest-json.js](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/.github/scripts/generate-latest-json.js) which:
1. Lists all assets inside the newly published release.
2. Identifies the signature files (`.sig`) for each target.
3. Downloads the signature content and formats it into the expected updater JSON structure.
4. Generates the central `latest.json` file.
5. Uploads `latest.json` back to the release assets, overwriting any previous version.

---

## 5. How to Deploy a New Update

Once you have set up your `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` in your repository secrets on GitHub:

1. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: implement sqlite query handlers"
   git push origin main
   ```
2. **Tag the version**:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. **Observe the Actions tab**: GitHub Actions will boot up, compile the files for Windows and macOS, sign them, upload them, and generate the final auto-updater catalog file (`latest.json`).
