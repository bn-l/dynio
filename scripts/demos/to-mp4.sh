#!/bin/bash
# Converts a video to an mp4 next to the original, printing progress as it goes.
# The last line is the new file's path, so Dynio can open or reveal it.
in="$1"
out="${in%.*}.mp4"
size() { du -h "$1" | awk '{ print $1 }'; }
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")

echo "Converting $(basename "$in") ($(size "$in"))"

# -progress prints progress as key=value lines (ffmpeg's usual progress line rewrites itself
# with \r, which never ends a line). awk turns them into a bar every 20%, and fflush() sends
# each line straight away instead of when awk's buffer fills.
ffmpeg -hide_banner -loglevel error -y -i "$in" \
    -c:v libx264 -crf 23 -preset fast -c:a aac -movflags +faststart \
    -progress pipe:1 -stats_period 0.2 -nostats "$out" |
    awk -F= -v total="$duration" '
        function show(pct,   bar, i) {
            for (i = 0; i < 10; i++) bar = bar (i < pct / 10 ? "■" : "□")
            printf "%s %3d%%\n", bar, pct
            fflush()
        }
        $1 == "out_time_us" { while ($2 / 10000 / total >= next_pct + 20 && next_pct < 80) show(next_pct += 20) }
        $1 == "progress" && $2 == "end" { show(100) }
    '

echo "Done: $(size "$in") → $(size "$out")"
echo "$out"
