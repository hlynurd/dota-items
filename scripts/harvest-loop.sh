#!/bin/bash
# Continuous harvest loop — harvests matches, commits data.json, pushes, deploys.
# Runs indefinitely until killed. Harvests in chunks, pushes every ~2 hours.
#
# Usage: bash scripts/harvest-loop.sh
# Or:    nohup bash scripts/harvest-loop.sh &

set -e
cd "$(dirname "$0")/.."

CHUNK=30000        # matches per harvest chunk
DEPLOY_INTERVAL=2  # hours between deploys
SEQ_FILE=".harvest-seq"

# Track last sequence number between runs
if [ -f "$SEQ_FILE" ]; then
  START_SEQ=$(cat "$SEQ_FILE")
  echo "[loop] Resuming from seq $START_SEQ"
else
  START_SEQ=7350000000
  echo "[loop] Starting fresh from seq $START_SEQ"
fi

while true; do
  echo "[loop] $(date): Harvesting $CHUNK matches from seq $START_SEQ..."

  # Run harvest with merge (add to existing data)
  npm run valve-harvest -- --merge --seq "$START_SEQ" --max "$CHUNK" 2>&1 | tee /tmp/harvest-latest.log

  # Extract the last sequence number from the log
  LAST_SEQ=$(grep "seq " /tmp/harvest-latest.log | tail -1 | grep -o 'seq [0-9]*' | awk '{print $2}')
  if [ -n "$LAST_SEQ" ]; then
    echo "$LAST_SEQ" > "$SEQ_FILE"
    START_SEQ=$LAST_SEQ
    echo "[loop] Updated seq cursor to $LAST_SEQ"
  fi

  # Commit and push
  echo "[loop] $(date): Committing and pushing data.json..."
  git add public/data.json
  MATCHES=$(grep "Done\." /tmp/harvest-latest.log | grep -o '[0-9,]* ranked' | head -1 || echo "unknown")
  git commit -m "Update data.json: +${MATCHES} matches from patch 7.41a

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" || true
  git push origin main || true

  # Deploy
  echo "[loop] $(date): Deploying to Vercel..."
  vercel --prod --yes 2>&1 | tail -5 || true

  echo "[loop] $(date): Cycle complete. Sleeping ${DEPLOY_INTERVAL}h..."
  sleep $((DEPLOY_INTERVAL * 3600))
done
