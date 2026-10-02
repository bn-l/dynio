# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.61.0"]
# ///
"""
Makes the animated demos in the README (assets-repo/demo-<name>.webp).

Each demo loads the real frontend from Vite in Playwright's WebKit (the engine the macOS app
uses). The Rust backend is replaced by a small stand-in inside the page. The script types into
the input, sends back each command's output the way the backend does, takes a screenshot after
every change, and joins the screenshots into an animated WebP with img2webp.

Where each demo's output comes from:
- qalc: real qalc.
- find: fixtures/find-paths.txt, narrowed the way the README's find script does it (apps always,
  other files only if their name contains the query, then fzf).
- groq: fixtures/groq-answer.md, sent in small chunks like a streaming answer.
- to_mp4: fixtures/to-mp4-output.txt, recorded from to-mp4.sh by `--record-to-mp4`.
- scripts: list-scripts.sh, run for real on a temporary ~/scripts holding the files named in
  fixtures/scripts-folder.txt.

Usage: `just demos` makes them all, `just demos find groq` makes some, and
`just demos --record-to-mp4` re-records the ffmpeg output first. Needs img2webp
(`brew install webp`), fzf, qalc and ffmpeg on PATH, and Playwright's WebKit
(`uvx playwright@1.61.0 install webkit`).
"""

import argparse
import json
import os
import random
import signal
import subprocess
import tempfile
import time
import urllib.request
from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import NamedTuple

from playwright.sync_api import Browser, Page, sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FIXTURES = HERE / "fixtures"
OUT = ROOT / "assets-repo"
URL = "http://localhost:14222/"

# The real window's proportions (main.rs): the bar is 0.16 × the width, and with the tray open
# the window is 4.05 × the bar. 806 px wide at 2× matches the size of the old demos.
WIDTH = 806
BAR_HEIGHT = int(WIDTH * 0.16)
HEIGHT = int(BAR_HEIGHT * 4.05)

# A made-up user, so no real paths show up
FAKE_HOME = "/Users/ben"
RECORDING = f"{FAKE_HOME}/Desktop/Screen Recording 2026-10-02 at 10.41.23.mov"

# Replaces the Tauri backend. run_program calls are kept in window.__demo.runs for this script to
# answer, and window.__demo.emit sends an event the way the backend's emit() does. hide_main
# hides the page (no demo ends that way, as it shows as an empty frame).
STAND_IN = """
(() => {
    const config = __CONFIG__;
    const listeners = new Map();
    const callbacks = new Map();
    let nextId = 1;

    window.__demo = {
        runs: [],
        emit(event, payload) {
            for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id, payload });
        },
    };

    async function invoke(command, args) {
        switch (command) {
            case "plugin:event|listen":
                listeners.set(args.event, [...(listeners.get(args.event) ?? []), args.handler]);
                return args.handler;
            case "get_config_files":
                return config;
            case "run_program":
                window.__demo.runs.push(args);
                return null;
            case "hide_main":
                document.documentElement.style.visibility = "hidden";
                return null;
            default:
                return null;
        }
    }

    window.__TAURI_INTERNALS__ = {
        invoke,
        transformCallback(callback, once = false) {
            const id = nextId++;
            callbacks.set(id, (data) => {
                if (once) callbacks.delete(id);
                return callback?.(data);
            });
            return id;
        },
        unregisterCallback: (id) => callbacks.delete(id),
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        convertFileSrc: (path) => path,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => callbacks.delete(id) };
})();
"""

# Waits until the page has painted its latest changes. With `settle`, it also waits for running
# transitions (like the list highlight moving) to finish, so a frame that's shown for a while
# isn't caught halfway through one. Endless animations are left alone.
PAINT = """
async (settle) => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (!settle) return;
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => {})));
}
"""

# A Finder-style drag image: the app's own video icon (FileIcon.svelte), the file name in a blue
# label, and the mouse pointer, which gets a green "+" while it's over somewhere it can drop.
ADD_DRAG_IMAGE = """
(name) => {
    const image = document.createElement("div");
    image.innerHTML = `
        <style>
            #demoDragImage { position: fixed; left: 0; top: 0; z-index: 9999; pointer-events: none; font: 11px -apple-system, sans-serif; }
            #demoDragImage .file { position: absolute; left: -60px; top: -34px; width: 120px; display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0.85; }
            #demoDragImage .icon { width: 52px; height: 52px; border-radius: 11px; background: #fff; color: #7a6a60; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); display: grid; place-items: center; }
            #demoDragImage .icon svg { width: 36px; height: 36px; }
            #demoDragImage .name { background: #2f6fdf; color: #fff; border-radius: 4px; padding: 1px 5px; text-align: center; line-height: 1.3; }
            #demoDragImage .pointer { position: absolute; left: -1px; top: -1px; width: 15px; height: 22px; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35)); }
            #demoDragImage .plus { position: absolute; left: 10px; top: 14px; width: 14px; height: 14px; border-radius: 50%; background: #2fb344; color: #fff; display: none; place-items: center; font: 600 12px/1 -apple-system, sans-serif; }
            #demoDragImage.over .plus { display: grid; }
        </style>
        <div class="file">
            <div class="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                    <path d="M10.25 9.25v5.5L14.75 12Z" />
                </svg>
            </div>
            <div class="name"></div>
        </div>
        <svg class="pointer" viewBox="0 0 15 22"><path d="M1 1v17l4.2-4.1 3 6.6 2.9-1.3-2.9-6.4H14Z" fill="#000" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" /></svg>
        <div class="plus">+</div>`;
    image.id = "demoDragImage";
    image.querySelector(".name").textContent = name;
    document.body.append(image);
    window.__demo.moveDragImage = (x, y, over) => {
        image.style.transform = `translate(${x}px, ${y}px)`;
        image.classList.toggle("over", over);
    };
    window.__demo.removeDragImage = () => image.remove();
}
"""


class Demo:
    """One demo being recorded: the page to drive and the frames captured so far."""

    def __init__(self, page: Page, name: str):
        self.page = page
        self.frames: list[tuple[bytes, int]] = []
        # Seeded, so the "human" typing speed is the same on every run
        self.rng = random.Random(name)

    def snap(self, hold_ms: int):
        """Screenshots the page and shows it for hold_ms. If nothing changed since the last
        frame, that frame is just shown for longer. Short frames are parts of something moving
        (streaming, dragging, scrolling), so they don't wait for transitions to settle."""
        self.page.evaluate(PAINT, hold_ms > 50)
        shot = self.page.screenshot(omit_background=True, caret="initial")
        if self.frames and self.frames[-1][0] == shot:
            self.frames[-1] = (shot, self.frames[-1][1] + hold_ms)
        else:
            self.frames.append((shot, hold_ms))

    def emit(self, event: str, payload: object):
        self.page.evaluate("([event, payload]) => window.__demo.emit(event, payload)", [event, payload])

    def answer_run(self, answer: "Answer"):
        """Answers the latest run_program call, if there was one. The input waits 30 ms after a
        key before running the command, so this waits a little longer than that first."""
        self.page.wait_for_timeout(45)
        runs = self.page.evaluate("window.__demo.runs.splice(0)")
        if runs:
            answer(self, runs[-1])

    def type(self, text: str, answer: "Answer", ms_per_key: tuple[int, int] = (70, 150)):
        for char in text:
            self.page.keyboard.type(char)
            self.answer_run(answer)
            self.snap(self.rng.randint(*ms_per_key))

    def press(self, key: str, hold_ms: int, answer: "Answer | None" = None):
        self.page.keyboard.press(key)
        if answer:
            self.answer_run(answer)
        self.snap(hold_ms)

    def drag_file(self, path: str):
        """Drags a file up from below the bar and drops it on the bar, like dragging it in from
        Finder. The drag image is drawn by this script. The highlight and the path in the input
        are the app reacting to the same drag events Tauri sends."""
        self.page.evaluate(ADD_DRAG_IMAGE, Path(path).name)
        left, top, right, bottom = self.page.evaluate(
            "(() => { const r = document.querySelector('#mainWrapper').getBoundingClientRect();"
            " return [r.left, r.top, r.right, r.bottom]; })()"
        )
        (start_x, start_y), (end_x, end_y) = (WIDTH * 0.66, HEIGHT * 0.86), (WIDTH * 0.45, BAR_HEIGHT * 0.55)
        steps, was_over = 26, False
        for step in range(steps + 1):
            eased = 1 - (1 - step / steps) ** 3
            x, y = start_x + (end_x - start_x) * eased, start_y + (end_y - start_y) * eased
            over = left <= x < right and top <= y < bottom
            self.page.evaluate("([x, y, over]) => window.__demo.moveDragImage(x, y, over)", [x, y, over])
            # Tauri reports positions in physical pixels
            position = {"x": x * 2, "y": y * 2}
            if over and not was_over:
                self.emit("tauri://drag-enter", {"paths": [path], "position": position})
            elif over:
                self.emit("tauri://drag-over", {"position": position})
            was_over = over
            self.snap(33)
        self.snap(450)
        self.page.evaluate("window.__demo.removeDragImage()")
        self.emit("tauri://drag-drop", {"paths": [path], "position": {"x": end_x * 2, "y": end_y * 2}})


Answer = Callable[[Demo, dict], None]


def send_lines(demo: Demo, lines: list[str]):
    """Answers a run straight away, the way the backend reports a quick command: an empty batch
    of output when it starts, then all the lines so far, then the exit code."""
    demo.emit("stdout", [])
    if lines:
        demo.emit("stdout", lines)
    demo.emit("exit", 0)


def fzf(query: str, lines: list[str], *options: str) -> list[str]:
    result = subprocess.run(
        ["fzf", "--filter", query, *options], input="\n".join(lines), capture_output=True, text=True
    )
    return result.stdout.splitlines()


def qalc(demo: Demo, run: dict):
    result = subprocess.run([run["program"], *run["arguments"], run["input"]], capture_output=True, text=True)
    send_lines(demo, result.stdout.splitlines())


def find(demo: Demo, run: dict):
    query = run["input"]
    # The README's script stops for queries of 2 characters or fewer
    if len(query) <= 2:
        send_lines(demo, [])
        return
    paths = (FIXTURES / "find-paths.txt").read_text().splitlines()
    found = [path for path in paths if path.endswith(".app") or query.lower() in Path(path).name.lower()]
    send_lines(demo, fzf(query, found))


def groq(demo: Demo, _run: dict):
    text = (FIXTURES / "groq-answer.md").read_text()
    demo.emit("stdout", [])
    demo.snap(600)
    # Streaming output arrives in chunks, and the backend sends every chunk so far each time
    chunks: list[str] = []
    while (sent := sum(map(len, chunks))) < len(text):
        chunks.append(text[sent : sent + demo.rng.randint(4, 12)])
        demo.emit("stdout", chunks)
        demo.snap(demo.rng.randint(30, 50))
    demo.emit("exit", 0)


def to_mp4(demo: Demo, _run: dict):
    """Replays to-mp4.sh's recorded output with its real timing."""
    demo.emit("stdout", [])
    lines: list[str] = []
    shown_since = 0
    for row in (FIXTURES / "to-mp4-output.txt").read_text().splitlines():
        arrived, line = row.split("\t", 1)
        # Lines that arrived together are shown together
        if int(arrived) > shown_since:
            demo.snap(int(arrived) - shown_since)
            shown_since = int(arrived)
        lines.append(line)
        demo.emit("stdout", lines)
    demo.emit("exit", 0)


def scripts(demo: Demo, run: dict):
    """Runs list-scripts.sh on a temporary home whose ~/scripts holds the fixture's files."""
    with tempfile.TemporaryDirectory() as home:
        folder = Path(home, "scripts")
        folder.mkdir()
        for name in (FIXTURES / "scripts-folder.txt").read_text().split():
            (folder / name).touch(mode=0o755)
        result = subprocess.run(
            [HERE / "list-scripts.sh", run["input"]], capture_output=True, text=True, env={**os.environ, "HOME": home}
        )
    send_lines(demo, result.stdout.replace(home, FAKE_HOME).splitlines())


def qalc_demo(demo: Demo):
    # Currencies use qalc's own exchange rates, so those results change a little between runs
    sums = ["100 USD to EUR", "44 bytes to bits", "50 GBP to JPY", "350 °F to °C", "5 feet 10 inches to cm", "100 km/h to mph"]
    demo.snap(800)
    for i, sum_ in enumerate(sums):
        if i:
            demo.press("Escape", 400)
        demo.type(sum_, qalc, ms_per_key=(60, 120))
        demo.snap(1500)


def find_demo(demo: Demo):
    demo.snap(800)
    demo.type("photo", find)
    demo.snap(1000)
    for _ in range(3):
        demo.press("ArrowDown", 380)
    demo.snap(2000)


def groq_demo(demo: Demo):
    demo.snap(700)
    demo.type("How do I undo my last git commit but keep the changes?", groq, ms_per_key=(35, 85))
    demo.snap(500)
    demo.press("Enter", 2500, groq)
    # Ctrl+D scrolls half a page (smoothly), down to the sources
    demo.page.keyboard.press("Control+d")
    for _ in range(12):
        demo.snap(33)
    demo.snap(3000)


def to_mp4_demo(demo: Demo):
    demo.snap(900)
    demo.drag_file(RECORDING)
    demo.snap(1000)
    demo.press("Enter", 3500, to_mp4)


def scripts_demo(demo: Demo):
    demo.snap(800)
    demo.type("res", scripts)
    demo.snap(1000)
    # Down past the bottom of the tray (so the list scrolls) and back up a bit
    for key in ["ArrowDown"] * 7 + ["ArrowUp"] * 4:
        demo.press(key, 320)
    demo.snap(1600)


class Spec(NamedTuple):
    command: str
    dark: bool
    script: Callable[[Demo], None]
    # Leave unset to show the app's default
    input_font_size: float | None = None


DEMOS: dict[str, Spec] = {
    "qalc": Spec("qalc", False, qalc_demo),
    "find": Spec("find", False, find_demo),
    "groq": Spec("groq", False, groq_demo, input_font_size=1.3),
    "to-mp4": Spec("to_mp4", True, to_mp4_demo),
    "scripts": Spec("scripts", True, scripts_demo),
}


def make(browser: Browser, name: str):
    command, dark, script, input_font_size = DEMOS[name]
    settings = f'darkMode: "{"on" if dark else "off"}"\ndefaultCommand: {command}\n'
    if input_font_size:
        settings += f"inputFontSize: {input_font_size}\n"
    config = {"cmd_config": (HERE / "cmd-config.yaml").read_text(), "settings": settings}

    context = browser.new_context(
        viewport={"width": WIDTH, "height": HEIGHT},
        device_scale_factor=2,
        color_scheme="dark" if dark else "light",
    )
    page = context.new_page()
    page.on("pageerror", lambda error: print(f"{name}: page error: {error}"))
    page.add_init_script(STAND_IN.replace("__CONFIG__", json.dumps(config)))
    page.goto(URL)
    page.wait_for_function(
        "command => document.querySelector('#leftTile')?.textContent.trim() === command", arg=command
    )
    demo = Demo(page, name)
    script(demo)
    context.close()

    path = OUT / f"demo-{name}.webp"
    with tempfile.TemporaryDirectory() as frames:
        args = ["img2webp", "-loop", "0"]
        for i, (shot, hold_ms) in enumerate(demo.frames):
            frame = Path(frames, f"{i:04}.png")
            frame.write_bytes(shot)
            args += ["-d", str(hold_ms), str(frame)]
        subprocess.run([*args, "-o", str(path)], check=True, capture_output=True)
    seconds = sum(hold_ms for _, hold_ms in demo.frames) / 1000
    print(f"{path.relative_to(ROOT)}: {len(demo.frames)} frames, {seconds:.1f} s, {path.stat().st_size // 1024} KB")


def record_to_mp4():
    """Runs to-mp4.sh on a generated 6-second "screen recording" and saves each line of output
    with when it arrived (ms from the start), with the temporary folder swapped for ~/Desktop."""
    with tempfile.TemporaryDirectory() as tmp:
        desktop = Path(tmp, "Desktop")
        desktop.mkdir()
        video = desktop / Path(RECORDING).name
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60",
             "-f", "lavfi", "-i", "sine=frequency=440", "-t", "6", "-c:v", "prores_ks", "-c:a", "pcm_s16le", str(video)],
            check=True,
        )
        rows, arrived = [], 0
        start = time.monotonic()
        with subprocess.Popen([HERE / "to-mp4.sh", video], stdout=subprocess.PIPE, text=True) as convert:
            for line in convert.stdout or []:
                arrived = round((time.monotonic() - start) * 1000)
                rows.append(f"{arrived}\t{line.rstrip(os.linesep).replace(str(desktop), f'{FAKE_HOME}/Desktop')}")
    (FIXTURES / "to-mp4-output.txt").write_text("\n".join(rows) + "\n")
    print(f"Recorded {len(rows)} lines over {arrived / 1000:.1f} s")


def serving() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=1):
            return True
    except OSError:
        return False


@contextmanager
def vite():
    """Uses the dev server if it's already running (e.g. under `just run`), else starts one."""
    if serving():
        yield
        return
    server = subprocess.Popen(
        ["npm", "run", "dev"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True
    )
    try:
        deadline = time.monotonic() + 30
        while not serving():
            if time.monotonic() > deadline or server.poll() is not None:
                raise SystemExit("Vite didn't start (npm run dev)")
            time.sleep(0.2)
        yield
    finally:
        os.killpg(server.pid, signal.SIGTERM)
        server.wait()


def main():
    parser = argparse.ArgumentParser(description="Make the README's animated demos.")
    parser.add_argument("names", nargs="*", help=f"demos to make (default: all of {', '.join(DEMOS)})")
    parser.add_argument("--record-to-mp4", action="store_true", help="re-record the ffmpeg output first")
    args = parser.parse_args()
    if unknown := set(args.names) - DEMOS.keys():
        parser.error(f"unknown demo: {', '.join(sorted(unknown))} (choose from {', '.join(DEMOS)})")

    if args.record_to_mp4 or not (FIXTURES / "to-mp4-output.txt").exists():
        record_to_mp4()
    with vite(), sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        for name in args.names or DEMOS:
            make(browser, name)
        browser.close()


if __name__ == "__main__":
    main()
