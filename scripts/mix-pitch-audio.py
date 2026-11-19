"""Lays each pitch video's own audio under its on-screen playback in our demo (in sync with the picture),
starting after our narration ends, so there is no silent stretch. Writes launch/our-demo.mp4 in place."""
import json, subprocess as sp, shutil, os

F = "launch/footage"
plan = json.load(open("launch/build/video_plan.json"))
LEAD = 0.3
# scene id -> (pitch video with audio, seconds into the scene when playback starts, where in the pitch it starts)
ev = lambda d: json.load(open(f"{F}/{d}/events.json"))
run = ev("run")
src = {
    "demo_c_done": (f"{F}/run/pitch.mp4", run["play"] - (run["done"] - 0.5), 0.0),
    "demo_c_omnistem": ("eval/github-only/omnistem/demo.mp4", ev("omnistem")["play"] - (ev("omnistem")["page"] + 0.2), 24.0),
    "demo_c_devpad": ("eval/github-only/devpad/demo.mp4", ev("devpad")["play"] - (ev("devpad")["page"] + 0.2), 17.5),
    "demo_c_wumpus": ("eval/github-only/wumpus/demo.mp4", ev("wumpus")["play"] - (ev("wumpus")["page"] + 0.2), 14.1),
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
shutil.copy("launch/build/demo.mp4", "launch/build/demo-voice-only.mp4")
sp.run(["ffmpeg", "-v", "error", "-y", "-i", "launch/build/demo-voice-only.mp4", *inputs, "-filter_complex", fc,
        "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "launch/our-demo.mp4"], check=True)
print("wrote launch/our-demo.mp4")
