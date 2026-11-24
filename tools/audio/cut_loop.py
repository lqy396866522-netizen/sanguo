"""把 find_loop.py 找到的循环段单独切成运行时文件（Cocos AudioSource 只能整文件循环）。

Usage: python cut_loop.py <src> <dst.mp3> <start> <end> [--peak -7] [--bitrate 64k] [--mono]
首尾各做 15ms 淡入淡出防止接缝爆音，峰值归一化后编码 MP3。
"""
import argparse
import subprocess

from process_sfx import FFMPEG, peak_db


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("start", type=float); ap.add_argument("end", type=float)
    ap.add_argument("--peak", type=float, default=-7)
    ap.add_argument("--bitrate", default="64k")
    ap.add_argument("--mono", action="store_true")
    a = ap.parse_args()
    length = a.end - a.start
    chain = [
        f"atrim=start={a.start}:end={a.end}", "asetpts=PTS-STARTPTS",
        "afade=t=in:d=0.015", f"afade=t=out:st={length - 0.015}:d=0.015",
        f"aformat=channel_layouts={'mono' if a.mono else 'stereo'}:sample_rates=44100",
    ]
    base = ",".join(chain)
    gain = a.peak - peak_db(a.src, base)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", a.src, "-af", f"{base},volume={gain:.2f}dB",
                    "-codec:a", "libmp3lame", "-b:a", a.bitrate, a.dst], check=True)
    print(f"{a.dst}: {a.start}-{a.end}s ({length:.2f}s), gain {gain:+.2f} dB")


if __name__ == "__main__":
    main()
