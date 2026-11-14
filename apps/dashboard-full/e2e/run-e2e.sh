#!/usr/bin/env bash
# Builds the dashboard, builds the server from a checkout of it (MEDIAORQUESTATOR_DIR, by default ../mediaOrquestator
# next to this repository; only read, the binary goes to a scratch folder), starts `orchestrator serve --web-dir` in a
# scratch workdir with stub pipeline binaries, and runs the Playwright suite against it. The built dashboard served by
# the server from a directory IS the system under test.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/../.." && pwd)"
SERVER_DIR="$(cd "${MEDIAORQUESTATOR_DIR:-$REPO_DIR/../mediaOrquestator}" && pwd)"
DIST="$REPO_DIR/dist/dashboard-full/browser"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mo-e2e.XXXXXX")"
PORT="${E2E_PORT:-4670}"
trap 'kill "$SERVE_PID" 2>/dev/null || true; rm -rf "$WORK"' EXIT

echo "== building the dashboard (production)"
(cd "$REPO_DIR" && npx ng build dashboard-full >/dev/null)

echo "== building orchestrator from $SERVER_DIR"
# The private edition has its own files (see internal/edition); the public tree does not.
TAGS=""
[ -f "$SERVER_DIR/internal/edition/edition_private.go" ] && TAGS="private"
(cd "$SERVER_DIR" && go build ${TAGS:+-tags "$TAGS"} -o "$WORK/orchestrator" ./cmd/orchestrator)

echo "== stub pipeline binaries"
mkdir -p "$WORK/bin" "$WORK/models" "$WORK/voices" "$WORK/projects"
printf 'fake-model' > "$WORK/models/model.safetensors"
printf 'fake-voice' > "$WORK/voices/voz.onnx"
printf '{}' > "$WORK/voices/voz.onnx.json"
# Sorts after model.safetensors so it never becomes the "first available
# model"; the model-manager scenario deletes it.
printf 'disposable' > "$WORK/models/zz-disposable.safetensors"
# Pony is a catalog model for the anime style: installed, so the styles can be chosen.
printf 'fake-pony' > "$WORK/models/ponyDiffusionV6XL_v6StartWithThisOne.safetensors"
cat > "$WORK/bin/piper" <<'EOS'
#!/bin/sh
cat >/dev/null
echo FAKEWAV
EOS
# One card with plenty of memory, so the suite does not depend on the machine it runs on (a laptop has no NVIDIA GPU
# and the Create page then finds no image model that fits).
cat > "$WORK/bin/nvidia-smi" <<'EOS'
#!/bin/sh
case "$*" in
  *--version*) echo "NVIDIA-SMI stub" ;;
  *) echo "0, NVIDIA GeForce RTX 4090, 24000, 24564" ;;
esac
EOS
cat > "$WORK/bin/ffprobe" <<'EOS'
#!/bin/sh
echo '{"format":{"duration":"2.5"}}'
EOS
cat > "$WORK/bin/sd" <<'EOS'
#!/bin/sh
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
sleep 0.3
echo FAKEPNG > "$out"
EOS
# Music engine stubs: ace-lm writes an enriched request and ace-synth a tiny
# playable WAV next to the request they are given, named after its stem — the
# real programs' contract (req.json -> req0.json -> req0.mp3|wav).
mkdir -p "$WORK/models/music"
for f in acestep-5Hz-lm-1.7B-Q8_0.gguf acestep-v15-turbo-Q8_0.gguf acestep-v15-xl-turbo-Q8_0.gguf Qwen3-Embedding-0.6B-Q8_0.gguf vae-BF16.gguf; do
  printf 'fake-gguf' > "$WORK/models/music/$f"
done
python3 - "$WORK/tiny.wav" <<'EOPY'
import sys, struct
rate, n = 8000, 1600  # 0.2 s of silence, 8-bit mono
data = bytes([128]) * n
hdr = b"RIFF" + struct.pack("<I", 36 + n) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate, 1, 8) + b"data" + struct.pack("<I", n)
open(sys.argv[1], "wb").write(hdr + data)
EOPY
# ffmpeg stub: the music pipeline encodes songs with it, and the studio plays them, so an audio
# output gets the tiny playable WAV; anything else (a clip, a contact sheet) a placeholder.
cat > "$WORK/bin/ffmpeg" <<EOS
#!/bin/sh
for a in "\$@"; do out="\$a"; done
case "\$out" in
  *.mp3|*.wav) cp "$WORK/tiny.wav" "\$out" ;;
  *) echo FAKEMEDIA > "\$out" ;;
esac
EOS
# whisper-cli stub (dictation): writes a fixed sentence as whisper's JSON next to the prefix it is given.
mkdir -p "$WORK/models/whisper"
printf 'fake-whisper' > "$WORK/models/whisper/ggml-large-v3-turbo-q5_0.bin"
cat > "$WORK/bin/whisper-cli" <<'EOS'
#!/bin/sh
prefix=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-of" ]; then prefix="$a"; fi
  prev="$a"
done
cat > "$prefix.json" <<'EOJ'
{"result":{"language":"es"},"transcription":[{"offsets":{"from":0,"to":3000},"text":" una canción triste de piano"}]}
EOJ
EOS
cat > "$WORK/bin/ace-lm" <<EOS
#!/bin/sh
req=""
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--request" ]; then req="\$a"; fi
  prev="\$a"
done
stem="\${req%.json}"
cat > "\${stem}0.json" <<'EOJ'
{"caption":"stub caption","lyrics":"[Verse]\nla la la","bpm":90,"duration":2,"keyscale":"C major","timesignature":"4","vocal_language":"en","seed":1,"lm_seed":1,"audio_codes":"1,2,3"}
EOJ
EOS
cat > "$WORK/bin/ace-synth" <<EOS
#!/bin/sh
req=""
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--request" ]; then req="\$a"; fi
  prev="\$a"
done
stem="\${req%.json}"
ext=mp3
if grep -q wav16 "\$req"; then ext=wav; fi
cp "$WORK/tiny.wav" "\${stem}0.\$ext"
EOS
chmod +x "$WORK/bin/"*

# The servers keep their settings (the Ollama address) under XDG_CONFIG_HOME: use the
# scratch dir, never the real user's, and start from no OLLAMA_HOST.
export XDG_CONFIG_HOME="$WORK/config"
unset OLLAMA_HOST
echo "== starting orchestrator serve --web-dir on 127.0.0.1:$PORT"
(cd "$WORK" && ./orchestrator serve --addr "127.0.0.1:$PORT" --web-dir "$DIST") &
SERVE_PID=$!
for i in $(seq 1 30); do
  sleep 0.3
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null
kill -0 "$SERVE_PID" 2>/dev/null || { echo "serve died (port busy?)"; exit 1; }
curl -s "http://127.0.0.1:$PORT/" | grep -q app-root || { echo "the dashboard is not served at / (--web-dir)"; exit 1; }

# Second server: the REMOTE one. Token-protected, allows the first
# server's origin (which serves the UI) via CORS, own workdir and history.
REMOTE_PORT="${E2E_REMOTE_PORT:-4671}"
REMOTE_TOKEN="e2e-remote-token"
mkdir -p "$WORK/remote/projects"
ln -s "$WORK/bin" "$WORK/remote/bin"
ln -s "$WORK/models" "$WORK/remote/models"
ln -s "$WORK/voices" "$WORK/remote/voices"
echo "== starting REMOTE orchestrator serve on 127.0.0.1:$REMOTE_PORT (token + CORS)"
(cd "$WORK/remote" && ../orchestrator serve --addr "127.0.0.1:$REMOTE_PORT" --token "$REMOTE_TOKEN" --cors-origin "http://127.0.0.1:$PORT") &
REMOTE_PID=$!
trap 'kill "$SERVE_PID" "$REMOTE_PID" 2>/dev/null || true; rm -rf "$WORK"' EXIT
for i in $(seq 1 30); do
  sleep 0.3
  if curl -sf "http://127.0.0.1:$REMOTE_PORT/api/health" >/dev/null 2>&1; then break; fi
done
curl -sf "http://127.0.0.1:$REMOTE_PORT/api/health" >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$REMOTE_PORT/api/projects")" = 401 ] || { echo "remote API is not token-protected"; exit 1; }

echo "== running Playwright"
cd "$REPO_DIR"
E2E_BASE_URL="http://127.0.0.1:$PORT" E2E_REMOTE_URL="http://127.0.0.1:$REMOTE_PORT" E2E_REMOTE_TOKEN="$REMOTE_TOKEN" npx playwright test -c apps/dashboard-full/playwright.config.ts "$@"
