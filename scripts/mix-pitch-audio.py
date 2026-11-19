"""Lays each pitch video's own audio under its on-screen playback in our demo (in sync with the picture),
starting after our narration ends, so there is no silent stretch. Writes launch/our-demo.mp4 in place."""
import json, subprocess as sp, shutil, os, sys

# usage: python3 scripts/mix-pitch-audio.py [rendered.mp4] [output.mp4]
RENDERED = sys.argv[1] if len(sys.argv) > 1 else "launch/build/demo.mp4"
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else "launch/our-demo.mp4"

F = "launch/footage"
plan = json.load(open("launch/build/video_plan.json"))
LEAD = 0.3
# scene id -> (pitch video with audio, seconds into the scene when playback starts, where in the pitch it starts)
ev = lambda d: json.load(open(f"{F}/{d}/events.json"))
run = ev("run")
src = {
    "demo_c_done": (f"{F}/run/pitch.mp4", 2.5, 25.6),
    # GitHub-only scenes: 2.5 s of job page, then the original pitch video from its demo section.
    "demo_c_omnistem": ("eval/github-only/omnistem/demo.mp4", 2.5, 24.0),
    "demo_c_devpad": ("eval/github-only/devpad/demo.mp4", 2.5, 17.5),
    "demo_c_wumpus": ("eval/github-only/wumpus/demo.mp4", 2.5, 14.1),
}
dur = lambda f: float(sp.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())
t = 0.0
inputs, filters = [], []
for sc in plan["scenes"]:
    if sc["id"] in src:
        f, play_at, seek = src[sc["id"]]
        narr = dur(f"launch/build/audio/{sc['id']}.mp3") if os.path.exists(f"launch/build/audio/{sc['id']}.mp3") else 0
        start = max(t + play_at, t + LEAD + narr + 0.3)      # after our narration
        end = t + sc["duration_s"] - 0.3
        if end - start > 0.8:
            offset = seek + (start - (t + play_at))            # keep the pitch audio in sync with its picture
            i = len(filters) + 1
            inputs += ["-ss", f"{offset:.2f}", "-t", f"{end - start:.2f}", "-i", f]
            filters.append(f"[{i}:a]volume=0.9,afade=t=in:d=0.3,afade=t=out:st={end - start - 0.4:.2f}:d=0.4,adelay={int(start * 1000)}|{int(start * 1000)}[a{i}]")
            print(f"{sc['id']}: pitch audio {start:.1f}-{end:.1f}s (from {offset:.1f}s of {f})")
    t += sc["duration_s"]
labels = "".join(f"[a{k}]" for k in range(1, len(filters) + 1))
fc = ";".join(filters) + f";[0:a]{labels}amix=inputs={len(filters) + 1}:normalize=0:duration=first[aout]"
sp.run(["ffmpeg", "-v", "error", "-y", "-i", RENDERED, *inputs, "-filter_complex", fc,
        "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUTPUT], check=True)
print(f"wrote {OUTPUT}")
