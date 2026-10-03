#!/usr/bin/env bash
# Build Pipeviewer and deploy it to the web server.
#
#   ./deploy-jellyfin.sh   test, build, copy the site, write the nginx site file, and reload nginx
#
# The site is copied to a staging folder in your home directory on the server first, and then
# installed with sudo, so sudo can ask for your password as usual. The nginx site file is written
# on every deploy, using the *.offelbrook.com certificate; if nginx -t rejects it, the previous
# file is put back.
set -euo pipefail

HOST=jellyfin
NAME=pipeviewer
DOMAIN=pipeviewer.offelbrook.com
ROOT=/var/www/$NAME
CERT=/etc/letsencrypt/live/offelbrook.com
STAGE=.cache/$NAME-deploy   # relative to your home directory on the server

[ $# -eq 0 ] || { echo "usage: $0" >&2; exit 2; }

cd "$(dirname "$0")"

echo "==> Testing"
node --test tests/*.test.mjs >/dev/null || { echo "Tests failed; not deploying. Run npm test to see why." >&2; exit 1; }

echo "==> Building"
rm -rf dist
node build.mjs

# This server hides the Tips & Tricks talk button. Only the deployed copy is changed.
sed -i 's/ id="talk-button"/ id="talk-button" style="display: none;"/' dist/index.html
grep -q 'id="talk-button" style="display: none;"' dist/index.html || { echo "Couldn't hide the talk button in dist/index.html; not deploying." >&2; exit 1; }

# The nginx site file and the install step, staged next to the site.
extra=$(mktemp -d)
trap 'rm -rf "$extra"' EXIT

cat > "$extra/$NAME.nginx" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    # HTTP/2 fetches the page's ~150 small modules over one connection.
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;

    root $ROOT;
    index index.html;

    # The code is plain text, unminified, and shrinks to a fraction when compressed.
    gzip on;
    gzip_vary on;
    gzip_types text/css text/javascript application/javascript image/svg+xml;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Code and icons are cached briefly, so a redeploy shows up within the hour.
    location ~* \.(js|css|svg|png)\$ {
        expires 1h;
    }
}
EOF

cat > "$extra/install.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"

echo "==> Installing the site in $ROOT"
mkdir -p $ROOT
rsync -a --delete --chown=root:root --chmod=D755,F644 site/ $ROOT/

available=/etc/nginx/sites-available/$NAME
echo "==> Writing \$available"
[ -e "\$available" ] && cp -p "\$available" "\$available.previous"
install -m 644 $NAME.nginx "\$available"
ln -sfn "\$available" /etc/nginx/sites-enabled/$NAME

echo "==> Testing and reloading nginx"
if ! nginx -t; then
  if [ -e "\$available.previous" ]; then
    mv "\$available.previous" "\$available"
    echo "nginx -t failed, so the previous \$available is back and nginx was not reloaded." >&2
  else
    rm -f /etc/nginx/sites-enabled/$NAME "\$available"
    echo "nginx -t failed, so the new site was removed and nginx was not reloaded." >&2
  fi
  exit 1
fi
rm -f "\$available.previous"
systemctl reload nginx
EOF

echo "==> Copying to $HOST"
ssh "$HOST" "mkdir -p $STAGE"
rsync -az --delete dist/ "$HOST:$STAGE/site/"
rsync -az "$extra/$NAME.nginx" "$extra/install.sh" "$HOST:$STAGE/"

echo "==> Installing on $HOST (sudo may ask for your password)"
ssh -t "$HOST" "sudo bash $STAGE/install.sh"

echo "==> Deployed: https://$DOMAIN/"
