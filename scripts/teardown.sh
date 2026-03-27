#!/usr/bin/env bash
# ============================================================
# scripts/teardown.sh
# The 60-Day Kill Switch — safe, complete project teardown.
#
# WHAT IT DOES (in order):
#   1. Snapshot the database to a dated .tar.gz in the repo
#   2. Stop all Docker containers for the product
#   3. Remove Docker images
#   4. Remove the Nginx site config
#   5. Print a manual Certbot cleanup reminder
#
# USAGE:
#   ./scripts/teardown.sh <PRODUCT_NAME> <DB_NAME> <DB_USER> <DB_PORT>
#
# EXAMPLE:
#   ./scripts/teardown.sh invoicer invoicer_db foundry 4100
#
# ARGUMENTS:
#   PRODUCT_NAME  Base name of the product (used for container/image naming)
#   DB_NAME       PostgreSQL database name to snapshot
#   DB_USER       PostgreSQL user
#   DB_PORT       Host port the postgres container is exposed on
#
# SAFETY:
#   - Requires explicit confirmation before destructive steps
#   - Snapshot is saved BEFORE anything is destroyed
#   - Nginx config is disabled (not deleted) first — re-enable with ln -s
#   - Dry-run mode available: set DRY_RUN=1 to preview without acting
# ============================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
PRODUCT_NAME="${1:-}"
DB_NAME="${2:-}"
DB_USER="${3:-foundry}"
DB_PORT="${4:-4101}"

if [[ -z "$PRODUCT_NAME" || -z "$DB_NAME" ]]; then
    echo "Usage: $0 <PRODUCT_NAME> <DB_NAME> [DB_USER] [DB_PORT]"
    echo "Example: $0 invoicer invoicer foundry 4101"
    exit 1
fi

DRY_RUN="${DRY_RUN:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SNAPSHOT_DIR="$REPO_ROOT/snapshots"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
SNAPSHOT_FILE="$SNAPSHOT_DIR/POST-MORTEM_${PRODUCT_NAME}_${TIMESTAMP}.tar.gz"
NGINX_CONF="/etc/nginx/sites-enabled/${PRODUCT_NAME}.conf"
NGINX_AVAIL="/etc/nginx/sites-available/${PRODUCT_NAME}.conf"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[teardown] $*"; }
warn() { echo "[teardown] ⚠️  $*"; }
run()  {
    if [[ "$DRY_RUN" == "1" ]]; then
        echo "[DRY-RUN] $*"
    else
        eval "$*"
    fi
}

confirm() {
    local prompt="$1"
    read -rp "[teardown] $prompt [y/N] " answer
    [[ "${answer,,}" == "y" ]]
}

# ---------------------------------------------------------------------------
# Step 0 — Dry-run warning
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
    warn "DRY_RUN=1 — no changes will be made"
    echo ""
fi

log "═══════════════════════════════════════════════"
log "  Kill Switch: $PRODUCT_NAME"
log "═══════════════════════════════════════════════"
echo ""

# ---------------------------------------------------------------------------
# Step 1 — Database snapshot (BEFORE anything is destroyed)
# ---------------------------------------------------------------------------
log "Step 1/5 — Snapshot database '$DB_NAME' → $SNAPSHOT_FILE"

mkdir -p "$SNAPSHOT_DIR"

if [[ "$DRY_RUN" != "1" ]]; then
    TMP_DUMP="/tmp/${PRODUCT_NAME}_${TIMESTAMP}.sql"

    log "Running pg_dump on 127.0.0.1:${DB_PORT}..."
    PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
        -h 127.0.0.1 \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        -f "$TMP_DUMP"

    log "Compressing snapshot..."
    tar -czf "$SNAPSHOT_FILE" -C /tmp "${PRODUCT_NAME}_${TIMESTAMP}.sql"
    rm -f "$TMP_DUMP"

    log "✓ Snapshot saved: $SNAPSHOT_FILE ($(du -sh "$SNAPSHOT_FILE" | cut -f1))"
else
    echo "[DRY-RUN] pg_dump -h 127.0.0.1 -p $DB_PORT -U $DB_USER -d $DB_NAME > $SNAPSHOT_FILE"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2 — Confirm before destruction
# ---------------------------------------------------------------------------
warn "The next steps are DESTRUCTIVE and irreversible."
warn "Snapshot is saved. Ready to tear down: $PRODUCT_NAME"
echo ""

if ! confirm "Proceed with teardown?"; then
    log "Aborted. Snapshot is safe at: $SNAPSHOT_FILE"
    exit 0
fi

echo ""

# ---------------------------------------------------------------------------
# Step 3 — Stop and remove containers
# ---------------------------------------------------------------------------
log "Step 2/5 — Stopping containers..."

CONTAINERS=$(docker ps -a --filter "name=${PRODUCT_NAME}" --format "{{.Names}}" 2>/dev/null || true)
if [[ -n "$CONTAINERS" ]]; then
    echo "$CONTAINERS" | while read -r container; do
        log "  Stopping: $container"
        run "docker stop $container"
        run "docker rm $container"
    done
else
    log "  No running containers found for: $PRODUCT_NAME"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 4 — Remove Docker images
# ---------------------------------------------------------------------------
log "Step 3/5 — Removing Docker images..."

IMAGES=$(docker images --filter "reference=*${PRODUCT_NAME}*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
if [[ -n "$IMAGES" ]]; then
    echo "$IMAGES" | while read -r image; do
        log "  Removing image: $image"
        run "docker rmi $image"
    done
else
    log "  No images found matching: *${PRODUCT_NAME}*"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 5 — Remove Nginx config (symlink first, then the file)
# ---------------------------------------------------------------------------
log "Step 4/5 — Disabling Nginx site..."

if [[ -L "$NGINX_CONF" ]]; then
    log "  Removing symlink: $NGINX_CONF"
    run "sudo rm $NGINX_CONF"
    log "  Testing Nginx config..."
    run "sudo nginx -t"
    log "  Reloading Nginx..."
    run "sudo systemctl reload nginx"
    log "  ✓ Site disabled. Config preserved at: $NGINX_AVAIL"
else
    warn "No symlink found at $NGINX_CONF — skipping Nginx step"
    warn "If you added the site manually, remove it from sites-enabled yourself."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 6 — Certbot reminder (manual step — too dangerous to automate)
# ---------------------------------------------------------------------------
log "Step 5/5 — Certbot cleanup (MANUAL):"
echo ""
echo "    # If you no longer need the SSL cert for this domain:"
echo "    sudo certbot delete --cert-name <YOUR_DOMAIN>"
echo ""
echo "    # To verify what certs exist:"
echo "    sudo certbot certificates"
echo ""
warn "Do NOT run certbot delete if the domain is shared with other configs."

echo ""
log "═══════════════════════════════════════════════"
log "  Teardown complete: $PRODUCT_NAME"
log "  Snapshot: $SNAPSHOT_FILE"
log "═══════════════════════════════════════════════"
