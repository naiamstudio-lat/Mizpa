#!/bin/bash
# Start Vite dev server detached
cd /workspaces/Mizpa
nohup npx vite --host 0.0.0.0 --port 5173 > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!
echo $VITE_PID > /tmp/vite-dev.pid
echo "Vite started (PID: $VITE_PID)"
# Wait for it to be ready
for i in $(seq 1 10); do
  if curl -s -o /dev/null -w "" http://localhost:5173 2>/dev/null; then
    echo "Ready on http://localhost:5173"
    exit 0
  fi
  sleep 1
done
echo "Timed out waiting"
exit 1
