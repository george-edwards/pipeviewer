#!/usr/bin/env bash
# Build Pipeviewer and deploy it to the web server.
#
#   ./deploy.sh          test, build, copy the site, and reload nginx
#   ./deploy.sh --nginx  also rewrite the nginx site file, even if it exists
#
# The site is copied to a staging folder in your home directory on the server first, and then
# installed with sudo, so sudo can ask for your password as usual. The nginx site file is written
# only when it's missing, because certbot edits it to add HTTPS and a rewrite would undo that.
set -euo pipefail

HOST=jellyfin
NAME=pipeviewer
DOMAIN=pipeviewer.offelbrook.com
ROOT=/var/www/$NAME
STAGE=.cache/$NAME-deploy   # relative to your home directory on the server

rewrite_nginx=0
for arg in "$@"; do
  case $arg in
    --nginx) rewrite_nginx=1 ;;
    *) echo "usage: $0 [--nginx]" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"

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
    listen [::]:80;
    server_name $DOMAIN;

    root $ROOT;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Code is cached briefly, so a redeploy shows up within the hour.
    location ~* \.(js|css)\$ {
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
if [ ! -e "\$available" ] || [ $rewrite_nginx = 1 ]; then
  echo "==> Writing \$available"
  install -m 644 $NAME.nginx "\$available"
else
  echo "==> Keeping the existing \$available (pass --nginx to rewrite it)"
fi
ln -sfn "\$available" /etc/nginx/sites-enabled/$NAME

echo "==> Testing and reloading nginx"
nginx -t
systemctl reload nginx
EOF

echo "==> Copying to $HOST"
ssh "$HOST" "mkdir -p $STAGE"
rsync -az --delete dist/ "$HOST:$STAGE/site/"
rsync -az "$extra/$NAME.nginx" "$extra/install.sh" "$HOST:$STAGE/"

echo "==> Installing on $HOST (sudo may ask for your password)"
ssh -t "$HOST" "sudo bash $STAGE/install.sh"

echo "==> Deployed: http://$DOMAIN/"
