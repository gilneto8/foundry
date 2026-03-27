# ============================================================
# outbound/Dockerfile
# Alpine Python — minimal scraping container
# ============================================================

FROM python:3.12-alpine

WORKDIR /app

# System deps for Playwright/Selenium if needed later.
# Currently using requests + BeautifulSoup (no browser needed
# for Google Maps Scraper API approach).
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    postgresql-client

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/

# Entrypoint handles RUN_MODE=cron vs RUN_MODE=once
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
