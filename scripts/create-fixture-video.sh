#!/usr/bin/env bash
set -euo pipefail

mkdir -p fixtures
ffmpeg -y \
  -f lavfi -i color=c=black:s=1280x720:d=1 \
  -f lavfi -i sine=frequency=880:duration=1 \
  -f lavfi -i color=c=blue:s=1280x720:d=2 \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100:d=2 \
  -f lavfi -i color=c=green:s=1280x720:d=1 \
  -f lavfi -i sine=frequency=660:duration=1 \
  -filter_complex "[0:v][1:a][2:v][3:a][4:v][5:a]concat=n=3:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac fixtures/silence-fixture.mp4
