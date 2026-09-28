# Maintenance page

nginx serves `index.html` (browsers) or `maintenance.json` (`/api/` calls) with status 503
while maintenance mode is on. It also serves them automatically whenever the app is stopped
or restarting, instead of a bare "502 Bad Gateway".

Run these from `/root/CPQ12/deploymentgigitaldocker` on the production server.

## Turn on

```bash
touch maintenance/on          # users now see the page (no reload needed)
docker-compose stop app       # optional: also stops writes and the hourly reminder emails
```

## Turn off

```bash
docker-compose start app                  # or `docker-compose up -d app` if .env changed
docker-compose ps app                     # wait until it shows (healthy)
docker-compose exec nginx nginx -s reload # picks up the app's address if it changed
rm maintenance/on
```

## Let your own IP through (to test before users come back)

```bash
echo "203.0.113.5 1;" > maintenance/bypass.conf   # your public IP
docker-compose exec nginx nginx -s reload
```

Delete `maintenance/bypass.conf` and reload again when you are done.
Check the IP nginx actually sees in `docker-compose logs nginx` first.

## Never

- Never restart or recreate nginx while the app is stopped. nginx cannot start without
  the `app` host, so the whole site (and this page) goes offline.
- Never use `docker-compose down`. Stop only the app.

`on` and `bypass.conf` are gitignored, so `git reset --hard` does not remove them.
