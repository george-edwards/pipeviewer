#!/usr/bin/env bash
# Build Pipeviewer and deploy it to the web server.
#
#   ./deploy-george.sh     test, build, copy the site, write the nginx site file, and reload nginx
#
# The site is copied to a staging folder in your home directory on the server first, and then
# installed with sudo, so sudo can ask for your password as usual. The certificate and key come
# from scratch/ here and are installed beside george's others; the staged copies are deleted. The
# nginx site file is named after the domain, like the others on george, and is written on every
# deploy; if nginx -t rejects it, the previous file, certificate and key are put back.
set -euo pipefail

HOST=george
NAME=pipeviewer
DOMAIN=pipeviewer.it.csiro.au
ROOT=/var/www/$NAME
CERT=/etc/ssl/certs/$DOMAIN--certificate.crt
KEY=/etc/ssl/private/$DOMAIN.key
LOCAL_CERT=scratch/$DOMAIN.crt   # relative to this script; scratch/ is not in git
LOCAL_KEY=scratch/$DOMAIN.key
STAGE=.cache/$NAME-deploy   # relative to your home directory on the server

[ $# -eq 0 ] || { echo "usage: $0" >&2; exit 2; }

cd "$(dirname "$0")"

for file in "$LOCAL_CERT" "$LOCAL_KEY"; do
  [ -r "$file" ] || { echo "$file is missing or unreadable; not deploying." >&2; exit 1; }
done

echo "==> Testing"
node --test tests/*.test.mjs >/dev/null || { echo "Tests failed; not deploying. Run npm test to see why." >&2; exit 1; }

echo "==> Building"
rm -rf dist
node build.mjs

# The nginx site file and the install step, staged next to the site.
extra=$(mktemp -d)
trap 'rm -rf "$extra"' EXIT

cat > "$extra/$NAME.nginx" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    # HTTP/2 fetches the page's ~150 small modules over one connection.
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;

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

# The staged key is deleted however this ends.
trap 'rm -f cert.crt cert.key' EXIT

echo "==> Installing the site in $ROOT"
mkdir -p $ROOT
rsync -a --delete --chown=root:root --chmod=D755,F644 site/ $ROOT/

echo "==> Installing the certificate and key"
for file in $CERT $KEY; do if [ -e "\$file" ]; then cp -p "\$file" "\$file.previous"; fi; done
install -m 644 -o root -g root cert.crt $CERT
install -m 600 -o root -g root cert.key $KEY

available=/etc/nginx/sites-available/$DOMAIN
echo "==> Writing \$available"
[ -e "\$available" ] && cp -p "\$available" "\$available.previous"
install -m 644 $NAME.nginx "\$available"
ln -sfn "\$available" /etc/nginx/sites-enabled/$DOMAIN

echo "==> Testing and reloading nginx"
if ! nginx -t; then
  for file in $CERT $KEY; do
    if [ -e "\$file.previous" ]; then mv "\$file.previous" "\$file"; else rm -f "\$file"; fi
  done
  if [ -e "\$available.previous" ]; then
    mv "\$available.previous" "\$available"
    echo "nginx -t failed, so the previous \$available, certificate and key are back and nginx was not reloaded." >&2
  else
    rm -f /etc/nginx/sites-enabled/$DOMAIN "\$available"
    echo "nginx -t failed, so the new site, certificate and key were removed and nginx was not reloaded." >&2
  fi
  exit 1
fi
rm -f "\$available.previous" $CERT.previous $KEY.previous
systemctl reload nginx
EOF

echo "==> Copying to $HOST"
ssh "$HOST" "mkdir -p $STAGE"
rsync -az --delete dist/ "$HOST:$STAGE/site/"
rsync -az "$extra/$NAME.nginx" "$extra/install.sh" "$HOST:$STAGE/"
rsync -z --chmod=F600 "$LOCAL_CERT" "$HOST:$STAGE/cert.crt"
rsync -z --chmod=F600 "$LOCAL_KEY" "$HOST:$STAGE/cert.key"

echo "==> Installing on $HOST (sudo may ask for your password)"
ssh -t "$HOST" "sudo bash $STAGE/install.sh"

echo "==> Deployed: https://$DOMAIN/"
