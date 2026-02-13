# Release Guide for Dynio

Steps to create a new release and update the Homebrew cask.

## 1. Commit pending changes

Ensure all feature/fix commits are done before bumping version.

## 2. Bump version in `src-tauri/tauri.conf.json`

Update the `version` field (e.g., `1.1.1` -> `1.2.0`).

## 3. Commit version bump

```bash
git add src-tauri/tauri.conf.json && git commit -m "hk: bump version to 1.2.0"
```

## 4. Push main, merge to release

Pushing to `release` triggers CI (`.github/workflows/publish.yml`) which builds
all platforms and creates a **draft** GitHub release tagged `dynio-v<VERSION>`.

```bash
git push origin main
git checkout release && git merge main --no-edit && git push origin release
git checkout main
```

## 5. Publish the draft release

Go to [Releases](https://github.com/bn-l/dynio/releases) and publish the draft.

**Note:** CI may create duplicate draft releases (one per platform). If this happens,
merge the assets into a single release: download assets from the spare, delete it,
upload them to the main release via the `uploads.github.com` API, then publish.

## 6. Get SHA256 of macOS DMGs

```bash
# After publishing, download and hash both DMGs:
curl -sL https://github.com/bn-l/dynio/releases/download/dynio-v1.2.0/dynio_1.2.0_aarch64.dmg | shasum -a 256
curl -sL https://github.com/bn-l/dynio/releases/download/dynio-v1.2.0/dynio_1.2.0_x64.dmg | shasum -a 256
```

If the release is still a draft, use `gh api` instead:
```bash
# Get asset IDs
gh api repos/bn-l/dynio/releases --jq '.[] | select(.tag_name=="dynio-v1.2.0") | .assets[] | select(.name | endswith(".dmg")) | "\(.id) \(.name)"'

# Download and hash via asset ID
gh api repos/bn-l/dynio/releases/assets/<ASSET_ID> -H "Accept: application/octet-stream" | shasum -a 256
```

## 7. Update Homebrew cask

Edit `../homebrew-tap/Casks/dynio.rb`:
- Update `version`
- Update both `sha256` values (arm and intel) from step 6

## 8. Push tap update

```bash
cd ../homebrew-tap
git add Casks/dynio.rb && git commit -m "dynio 1.2.0" && git push origin main
```

## 9. Verify installation

```bash
brew update
brew upgrade --cask dynio
```
