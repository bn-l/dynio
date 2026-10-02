#!/bin/bash
# Lists the scripts in ~/scripts, best matches for the input first (matching file names only)
find "$HOME/scripts" -type f -perm -u+x | fzf --filter "$1" --delimiter / --nth -1
