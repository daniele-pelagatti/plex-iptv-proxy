#!/usr/bin/env bash

# Set the script to exit on error
set -e

# Check if the script is being run as root
if [[ $(/usr/bin/id -u) -ne 0 ]]; then
    echo "Error: This script must be run as root"
    exit 1
fi

# Set the installation directory
INSTALL_DIR=${1:-/usr/lib/plex-iptv-proxy}

# Check if the installation directory already exists
if [ -d "$INSTALL_DIR" ]; then
    echo "'$INSTALL_DIR' directory already exists, skipping creation"
else
    echo "Creating '$INSTALL_DIR' directory"
    mkdir $INSTALL_DIR || {
        echo "Error: Failed to create '$INSTALL_DIR' directory: $?"
        exit 1
    }
fi

# Copy files to $INSTALL_DIR
echo "Copying files to '$INSTALL_DIR'"
cp -R . "$INSTALL_DIR" || {
    echo "Error: Failed to copy files to '$INSTALL_DIR': $?"
    exit 1
}

# Check if the plex-iptv-proxy user already exists
if id plex-iptv-proxy >/dev/null 2>&1; then
    echo "plex-iptv-proxy user already exists, skipping creation"
else
    echo "Creating plex-iptv-proxy user"
    useradd --system --no-create-home --user-group --home-dir "$INSTALL_DIR" --shell /usr/bin/nologin plex-iptv-proxy || {
        echo "Error: Failed to create plex-iptv-proxy user: $?"
        exit 1
    }
fi

# Set permissions for /usr/lib/plex-iptv-proxy
echo "Setting permissions for '$INSTALL_DIR'"
chown -R plex-iptv-proxy:plex-iptv-proxy $INSTALL_DIR || {
    echo "Error: Failed to set permissions for '$INSTALL_DIR': $?"
    exit 1
}

# Check if Node.js and npm are available for plex-iptv-proxy user and store their paths
NODE_PATH=$(su -s /bin/bash -c 'command -v node' plex-iptv-proxy 2>/dev/null || echo "")
NPM_PATH=$(su -s /bin/bash -c 'command -v npm' plex-iptv-proxy 2>/dev/null || echo "")

if [ -n "$NODE_PATH" ] && [ -n "$NPM_PATH" ]; then
    echo "Node.js is available for plex-iptv-proxy at: $NODE_PATH"
    echo "npm is available for plex-iptv-proxy at: $NPM_PATH"
else
    echo "Node.js and/or npm are not available for the plex-iptv-proxy user"
    echo "Installing them locally using NVM"
    # install node using nvm https://github.com/nvm-sh/nvm
    su -s /bin/bash -c '
    if command -v curl &> /dev/null; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    elif command -v wget &> /dev/null; then
        wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    else
        echo "Fatal Error: Neither curl nor wget is installed, cannot install nvm"
        exit 1
    fi

    export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm

    nvm install 20.18.1

    ' plex-iptv-proxy || {
        echo "Error: Failed to install Node.js: $?"
        exit 1
    }

    NODE_PATH="$INSTALL_DIR/.nvm/versions/node/v20.18.1/bin/node"
    NPM_PATH="$INSTALL_DIR/.nvm/versions/node/v20.18.1/bin/npm"
fi

# Remove the last part of the path (the executable name)
NODE_PATH="${NODE_PATH%/*}"
NPM_PATH="${NPM_PATH%/*}"

# Check if necessary commands are available to plex-iptv-proxy user
for cmd in ffmpeg ffprobe; do
    su -s /bin/bash -c "
if ! command -v $cmd &> /dev/null; then
    exit 1
fi
    " plex-iptv-proxy || {
        echo "Error: command \"$cmd\" is not available to the plex-iptv-proxy user"
        echo "make use $cmd is installed and available globally"
        exit 1
    }
done

# Copy systemd unit files to systemd directory
echo "copying systemd unit files to systemd directory"
for file in systemd-units/*.timer systemd-units/*.service; do
    cp "$file" /etc/systemd/system/ || {
        echo "Error: Failed to copy '$file' to systemd directory: $?"
        exit 1
    }
done

# Modify the unit files to use the INSTALL_DIR path and NPM_PATH
for file in /etc/systemd/system/plex-iptv-proxy-epg-generator.* /etc/systemd/system/plex-iptv-proxy-ffprobe.* /etc/systemd/system/plex-iptv-proxy-server.service; do
    sed -i "s|INSTALL_DIR|$INSTALL_DIR|g" "$file" || {
        echo "Error: Failed to modify $file: $?"
        exit 1
    }
    sed -i "s|NPM_PATH|$NPM_PATH|g" "$file" || {
        echo "Error: Failed to modify $file: $?"
        exit 1
    }
done

# Reload systemd daemon
echo "Reloading systemd daemon"
systemctl daemon-reload || {
    echo "Error: Failed to reload systemd daemon: $?"
    exit 1
}

# Enable and start services
echo "Enabling and starting services"
for service in plex-iptv-proxy-epg-generator.timer plex-iptv-proxy-ffprobe.timer plex-iptv-proxy-server.service; do
  systemctl enable --now "$service" || {
      echo "Error: Failed to enable '$service': $?"
      exit 1
  }
done

echo "Installation complete"
echo ""
echo "#####################################################"
echo "now log out and log in again to be part of the group"
echo "alternatively, execute"
echo "\$su '$SUDO_USER'"
echo "or, if you are logged in via vscode, execute"
echo "\$pkill -f -u \$EUID /code-server"
echo "#####################################################"