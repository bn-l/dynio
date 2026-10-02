# Dynio tasks. Run `just` to see them all.

manifest := "src-tauri/Cargo.toml"
config_dir := env("XDG_CONFIG_HOME", env("HOME") / ".config") / "dynio"

alias run := dev

# List recipes
default:
    @just --list

# Install npm dependencies
[group('app')]
install:
    npm install

# Run the app in dev mode; `dark`/`light` force the theme on a temp copy of your config
[group('app')]
dev theme="":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ theme }}" in
        "") exec npm run tauri dev ;;
        dark) mode=on ;;
        light) mode=off ;;
        *) echo "theme must be dark or light" >&2; exit 1 ;;
    esac
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    mkdir "$tmp/dynio"
    cp "{{ config_dir }}/cmd-config.yaml" "$tmp/dynio/"
    sed '/^darkMode:/d' "{{ config_dir }}/general-settings.yaml" > "$tmp/dynio/general-settings.yaml"
    printf '\ndarkMode: "%s"\n' "$mode" >> "$tmp/dynio/general-settings.yaml"
    XDG_CONFIG_HOME="$tmp" npm run tauri dev

# Run only the frontend dev server (http://localhost:14222)
[group('app')]
dev-web:
    npm run dev

# Build the release app bundle
[group('app')]
build:
    npm run tauri build

# Sign the installed app with your own certificate so macOS keeps its permissions across updates (run after each brew install/upgrade)
[group('app')]
[macos]
sign-installed identity="Local Dev Signing":
    #!/usr/bin/env bash
    set -euo pipefail
    app=/Applications/dynio.app
    was_running=false
    if pkill -f "$app/Contents/MacOS/dynio"; then
        was_running=true
        while pgrep -f "$app/Contents/MacOS/dynio" >/dev/null; do sleep 0.2; done
    fi
    codesign --force --sign "{{ identity }}" "$app"
    codesign --verify --strict "$app"
    codesign -d -r- "$app" 2>&1 | tail -1
    if $was_running; then open "$app"; fi

# Build only the frontend into dist/
[group('app')]
build-web:
    npm run build

# Type-check the frontend (also regenerates vite.config.js from vite.config.ts)
[group('check')]
check:
    npm run check

# Lint the frontend, or only the given paths
[group('check')]
lint *paths=".":
    npx eslint {{ paths }}

# Lint the Rust code with clippy
[group('check')]
clippy:
    cargo clippy --manifest-path {{ manifest }} --all-targets

# Format the Rust code
[group('check')]
fmt-rust:
    cargo fmt --manifest-path {{ manifest }}

# Run frontend tests once (args go to vitest, e.g. a file filter)
[group('test')]
test *args:
    npx vitest run {{ args }}

# Run frontend tests in watch mode
[group('test')]
test-watch *args:
    npx vitest {{ args }}

# Run Rust tests (args go to cargo test)
[group('test')]
test-rust *args:
    cargo test --manifest-path {{ manifest }} {{ args }}

# Run frontend and Rust tests
[group('test')]
test-all:
    npm run test:all

# Frontend and Rust coverage reports (into coverage/)
[group('test')]
cov:
    npm run cov

# Regenerate the JSON and Zod schemas from the TypeScript config types
[group('misc')]
gen-schema:
    npm run gen-schema-files

# Regenerate the app icons from a source image
[group('misc')]
icons source:
    npm run tauri icon {{ source }}

# Make the README's animated demos in assets-repo/ (all, or the ones named)
[group('misc')]
demos *args:
    uv run scripts/demos/make-demos.py {{ args }}

# Open the Dynio config folder
[group('misc')]
[macos]
config:
    open "{{ config_dir }}"

# Open the Dynio config folder
[group('misc')]
[linux]
config:
    xdg-open "{{ config_dir }}"

# Follow the Dynio log
[group('misc')]
logs:
    tail -f "{{ config_dir }}/dynio_rCURRENT.log"

# Delete build output (dist/, coverage/ and the Rust target dir)
[confirm("Delete dist/, coverage/ and the Rust target dir?")]
[group('misc')]
clean:
    rm -rf dist coverage
    cargo clean --manifest-path {{ manifest }}
