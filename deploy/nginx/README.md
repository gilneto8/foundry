# Nginx Deployment Guide

> This is the **canonical, step-by-step procedure** for exposing a new Foundry-based product on the Hetzner VPS via Nginx. Follow it exactly — live sites (`alerta-at.pt`, `kelaro.io`, `gil-neto.com`) are on the same Nginx instance. One wrong `nginx -t` skip and you take them all down.

---

## Prerequisites

- The product stack is running via `docker compose up -d` on the VPS
- You know which **host port** the app is bound to (e.g. `3000` from `ports: "3000:3000"` in `docker-compose.yml`)
- Your domain DNS A record already points to the VPS IP (check with `dig +short your-domain.com`)
- Certbot is already installed on the VPS (`certbot --version`)

---

## Task 4.1.1 + 4.1.2 — Deploy Nginx Config

### Step 1 — Copy and fill in the template

```bash
# Copy the template to sites-available
sudo cp /path/to/foundry/deploy/nginx/foundry.conf.template \
        /etc/nginx/sites-available/YOUR_PRODUCT.conf
```

Open it and replace the two placeholders:

```bash
sudo nano /etc/nginx/sites-available/YOUR_PRODUCT.conf
```

| Placeholder | Replace with | Example |
|---|---|---|
| `{{APP_DOMAIN}}` | Your product's subdomain or domain | `invoicer.yourdomain.com` |
| `{{APP_PORT}}` | Host port from `docker-compose.yml` | `3001` |

There are **4 occurrences** of `{{APP_DOMAIN}}` (two in the HTTP block, two in the HTTPS block) and **3 occurrences** of `{{APP_PORT}}`. Replace all of them.

---

### Step 2 — Test the config **before** enabling it

```bash
# This MUST pass before you touch sites-enabled.
# If it fails, fix the conf — do NOT proceed.
sudo nginx -t
```

Expected output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If it fails, `nginx -t` will tell you the exact file and line number. Fix it. Do **not** reload.

---

### Step 3 — Enable the site

```bash
# Create the symlink — this is how Nginx "activates" a config
sudo ln -s /etc/nginx/sites-available/YOUR_PRODUCT.conf \
           /etc/nginx/sites-enabled/YOUR_PRODUCT.conf

# Test again with the symlink in place
sudo nginx -t
```

---

### Step 4 — Reload Nginx (graceful, zero-downtime)

```bash
# reload — NOT restart. Reload applies the new config without
# dropping existing connections. Live sites stay up.
sudo systemctl reload nginx
```

> **Never use `sudo systemctl restart nginx`** during peak hours. `restart` kills all connections immediately. `reload` sends SIGHUP and drains gracefully.

At this point, `http://{{APP_DOMAIN}}` should return a 301 redirect to `https://` (which will show a cert error until Step 5).

---

## Task 4.1.3 — SSL with Certbot

### Step 5 — Obtain the SSL certificate

```bash
# --nginx: Certbot reads your Nginx config, obtains the cert, and
# modifies the config in-place to wire up the certificate paths.
# It ONLY touches files for your domain — existing certs are unaffected.
sudo certbot --nginx -d {{APP_DOMAIN}}
```

Certbot will:
1. Use the HTTP block's ACME challenge location to verify domain ownership
2. Write the cert to `/etc/letsencrypt/live/{{APP_DOMAIN}}/`
3. Fill in the `ssl_certificate` and `ssl_certificate_key` paths in your config
4. Automatically reload Nginx

**Flags to know:**

| Flag | When to use |
|---|---|
| `--nginx` | Standard — let Certbot manage the Nginx config |
| `--dry-run` | Test the renewal process without actually issuing a cert |
| `--expand` | Add a new domain to an **existing** cert (do NOT run without this if the cert already exists) |

> If certbot says the cert already exists for this domain, use `--expand` or `--cert-name` to add the new subdomain without creating a duplicate:
> ```bash
> sudo certbot --nginx --expand -d existing.domain.com -d new.domain.com
> ```

---

### Step 6 — Verify

```bash
# 1. Check the cert was issued
sudo certbot certificates

# 2. Test HTTPS from outside
curl -I https://{{APP_DOMAIN}}
# Should return: HTTP/2 200 (or your app's response)

# 3. Check Nginx is healthy
sudo nginx -t && sudo systemctl status nginx
```

---

## Rollback Procedure

If something goes wrong after enabling a new config:

```bash
# 1. Remove the symlink (disables the site, does NOT delete the config)
sudo rm /etc/nginx/sites-enabled/YOUR_PRODUCT.conf

# 2. Test that removing it restores a clean config
sudo nginx -t

# 3. Reload to remove the broken site from the running config
sudo systemctl reload nginx

# 4. Debug the config file at your leisure
sudo nano /etc/nginx/sites-available/YOUR_PRODUCT.conf
```

The original config file in `sites-available/` is preserved. Once fixed, re-symlink and reload.

---

## Cert Renewal

Certbot installs a systemd timer that auto-renews certs 30 days before expiry. You do not need to do anything.

```bash
# Confirm the timer is active
sudo systemctl status certbot.timer

# Manually test renewal (safe — uses --dry-run internally)
sudo certbot renew --dry-run
```

---

## Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Skipping `nginx -t` before reload | Nginx reloads with broken config, drops all sites | Always test. No exceptions. |
| Using `restart` instead of `reload` | All live connections dropped instantly | Use `systemctl reload nginx` |
| Two sites on the same port | Nginx startup conflict | Check port registry above |
| Wrong `{{APP_PORT}}` | 502 Bad Gateway | Match the `ports:` mapping in `docker-compose.yml` |
| DNS not pointing to VPS yet | Certbot challenge fails | Wait for DNS propagation, check with `dig +short {{APP_DOMAIN}}` |
| Certbot without `--expand` on existing cert | Duplicate cert, possible renewal issues | Always use `--expand` when adding domains to an existing cert |
