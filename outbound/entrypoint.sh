#!/bin/sh
# ============================================================
# entrypoint.sh
# Controls whether the scraper runs once (testing) or on cron.
# Set RUN_MODE=once for a single test run, cron for production.
# ============================================================

set -e

RUN_MODE="${RUN_MODE:-cron}"

if [ "$RUN_MODE" = "once" ]; then
    echo "[entrypoint] RUN_MODE=once — running scraper once and exiting"
    python src/main.py
else
    echo "[entrypoint] RUN_MODE=cron — installing cron schedule"
    # Write cron job: run at 03:00 every day
    # Adjust CRON_SCHEDULE env var if you need a different cadence
    CRON_SCHEDULE="${CRON_SCHEDULE:-0 3 * * *}"
    echo "$CRON_SCHEDULE python /app/src/main.py >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
    echo "[entrypoint] Schedule: $CRON_SCHEDULE"
    # Run crond in foreground (keeps container alive, logs to stdout)
    exec crond -f -l 8
fi
