#!/usr/bin/env bash

if [[ $(/usr/bin/id -u) -ne 0 ]]; then
  echo "Not running as root"
  exit
fi

# add plex-iptv-proxy user 
if id plex-iptv-proxy >/dev/null 2>&1; then
  echo "user plex-iptv-proxy already exists, not adding"
else
  useradd --system --no-create-home --user-group --home-dir $(pwd) --shell /usr/bin/nologin plex-iptv-proxy
  echo "user plex-iptv-proxy added"
fi

# make plex-iptv-proxy user owner of this folder
chown -R plex-iptv-proxy:plex-iptv-proxy .
echo "made current directory owned by plex-iptv-proxy:plex-iptv-proxy"

# add user executing this script to the plex-iptv-proxy group (so he can modify stuff)
usermod -a -G plex-iptv-proxy "$SUDO_USER"
echo "added user $SUDO_USER to group plex-iptv-proxy"

# give group permission to all folders
find . -type d -exec chmod g+rwx {} +
echo "set group rwx permission to all folders"

# give group rw permission to all files 
find . -type f -exec chmod g+rw {} +
echo "set group rw permission to all files"

# give group permission to execute scripts
chmod -R g+x ./*.sh
echo "set group execute scripts permission"

echo "done!"

echo "#####################################################"
echo "now log out and log in again to be part of the group"
echo "alternatively, execute"
echo "\$su $SUDO_USER"
echo "or, if you are logged in via vscode, execute"
echo "\$pkill -f -u \$EUID /code-server"
echo "#####################################################"