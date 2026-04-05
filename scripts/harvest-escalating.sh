#!/bin/bash
# Escalating harvest: runs indefinitely, deploying at increasing intervals.
# 5K x10, then 10K x10, then 20K x10, ... up to 100K intervals forever.
#
# Usage: nohup bash scripts/harvest-escalating.sh > /tmp/harvest-escalating.log 2>&1 &

cd "$(dirname "$0")/.."

SEQ_FILE=".harvest-seq"

# Start from patch 7.41a
if [ -f "$SEQ_FILE" ]; then
  START_SEQ=$(cat "$SEQ_FILE")
  echo "[escalate] $(date): Resuming from seq $START_SEQ"
else
  START_SEQ=7350000000
  echo "[escalate] $(date): Starting fresh from seq $START_SEQ"
fi

TOTAL=0

run_chunk() {
  local CHUNK=$1
  echo "[escalate] $(date): Harvesting $CHUNK matches from seq $START_SEQ (total so far: $TOTAL)..."

  npm run valve-harvest -- --merge --seq "$START_SEQ" --max "$CHUNK" --deploy --checkpoint "$CHUNK" 2>&1

  # Extract last seq from the harvest output
  LAST_SEQ=$(grep "seq [0-9]" /tmp/harvest-escalating.log | tail -1 | grep -o 'seq [0-9]*' | tail -1 | awk '{print $2}')
  if [ -n "$LAST_SEQ" ] && [ "$LAST_SEQ" -gt "$START_SEQ" ] 2>/dev/null; then
    echo "$LAST_SEQ" > "$SEQ_FILE"
    START_SEQ=$LAST_SEQ
    echo "[escalate] Updated seq to $LAST_SEQ"
  fi

  TOTAL=$((TOTAL + CHUNK))
  echo "[escalate] $(date): Chunk done. Total: $TOTAL"
}

echo "[escalate] $(date): Starting escalating harvest"

# 5K x 10
for i in $(seq 1 10); do echo "--- Round $i/10 (5K) ---"; run_chunk 5000; done

# 10K x 10
for i in $(seq 1 10); do echo "--- Round $i/10 (10K) ---"; run_chunk 10000; done

# 20K x 10
for i in $(seq 1 10); do echo "--- Round $i/10 (20K) ---"; run_chunk 20000; done

# 50K x 10
for i in $(seq 1 10); do echo "--- Round $i/10 (50K) ---"; run_chunk 50000; done

# 100K forever
while true; do echo "--- 100K round ---"; run_chunk 100000; done
