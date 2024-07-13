
<div align="center">

# Dynio

### Converts all commands that run on the cli in windows, linux or macos to a spotlight-like omnibar

</div>

<div align="center">
<img src="./demo.webp" alt="screen recording of usage" width="650px">
</div>

### Adding an LLM is trivial

Just copy and paste the curl command they give you in the api tester or write a curl yourself. This demo is 
running llama3-70b (current top rated open source model) on groq. There's no need for streaming as groq runs so fast. Openai can be added just as easily:

<div align="center">
<img src="./demo2.webp" alt="screen recording of usage" width="650px">
</div>

This demo is running bat file that takes a single argument (the content of the user message). You can download the examples for <a href="./unsorted/groq.bat">groq</a> and <a href="./unsorted/openai.bat">openai</a>.


## Installation

Run installer for your OS in releases

## Setup and Usage

1. Start dynio then check `~/.dynio` or `C:\Users\INSERT_YOUR_USERNAME\.dynio`. 
2. Example general settings command config files will have been created along with their schemas.

### Hotkeys

| Shortcut      | Action                |
| ------------- | --------------------- |
| `Alt + Space` | Show / Hide           |
| `Alt + s`     | Show command selector |
| `Alt + 1-9`   | Select command 1-9    |


If your editor supports 
intellisense or similar for editing yaml files with schema (like vscode does) then it's 
easy to edit both files as the descriptions for all options are in the schema.

The app watches its config dir and will relaunch after any changes.

## Extras

[Scoop](https://github.com/ScoopInstaller/Scoop) is a really nice command line package manager for windows. You can use it to install qalculate (what I'm using in the first demo). After install run `scoop bucket add extras` then `scoop install qalculate`. The everything cli can be installed with `scoop install everything-cli`. 

## Privacy

Open source with signed builds. No data collection BS. No nasty surprises. The app can be 
built after cloning this repo with `tauri build` (after removing the update section from tauri.conf). It makes one request on launch to releases on this repository to check for updates.

## Troubleshooting

If you are on an older version of windows, it should detect and install webview on windows if necessary. If there any issues it can be installed manually: https://go.microsoft.com/fwlink/p/?LinkId=2124703