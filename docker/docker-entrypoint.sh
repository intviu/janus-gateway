#!/bin/bash
set -euo pipefail

echo "[entrypoint] Starting janus container entrypoint (loop-wait mode)"

# 简单的循环等待模式，方便在容器内手动启动真实进程。
# 在收到 SIGINT 或 SIGTERM 时优雅退出，容器也会终止。
trap 'echo "[entrypoint] Received termination signal, exiting..."; exit 0' SIGINT SIGTERM

echo "[entrypoint] Container will wait; exec 'docker exec -it <container> /bin/bash' to enter and start processes manually."

while true; do
  sleep 3600
done
