#!/usr/bin/env bash

# Set the script to exit on error
set -e

# Check if the script is being run as root
if [[ $(/usr/bin/id -u) -ne 0 ]]; then
    echo "Error: This script must be run as root"
    exit 1
fi


# Stop and disable services if the unit files exist
echo "Stopping and disabling services"
for service in plex-iptv-proxy-epg-generator.timer plex-iptv-proxy-ffprobe.timer plex-iptv-proxy-server.service; do
    if [ -f "/etc/systemd/system/$service" ]; then
        systemctl disable --now "$service" || {
            echo "Error: Failed to disable $service service: $?"
            exit 1
        }
    else
        echo "Service unit file $service not found, skipping"
    fi
done

# Remove systemd unit files if they exist
echo "Removing systemd unit files"
for file in /etc/systemd/system/plex-iptv-proxy-epg-generator.* /etc/systemd/system/plex-iptv-proxy-ffprobe.* /etc/systemd/system/plex-iptv-proxy-server.service; do
    if [ -f "$file" ]; then
        rm "$file" || {
            echo "Error: Failed to remove '$file' from systemd directory: $?"
            exit 1
        }
    else
        echo "Systemd unit file $file not found, skipping"
    fi
done

# Reload systemd daemon
echo "Reloading systemd daemon"
systemctl daemon-reload || {
    echo "Error: Failed to reload systemd daemon: $?"
    exit 1
}

# Set the installation directory
INSTALL_DIR=${1:-/usr/lib/plex-iptv-proxy}

# Check if the installation directory exists
echo "Removing '$INSTALL_DIR' directory"
if [ -d "$INSTALL_DIR" ]; then
    # Remove installation directory
    rm -rf "$INSTALL_DIR" || {
        echo "Error: Failed to remove '$INSTALL_DIR' directory: $?"
        exit 1
    }
else
    echo "'$INSTALL_DIR' directory not found, skipping"
fi

if id plex-iptv-proxy >/dev/null 2>&1; then
    # Remove plex-iptv-proxy user
    echo "Removing plex-iptv-proxy user"
    userdel plex-iptv-proxy || {
        echo "Error: Failed to remove plex-iptv-proxy user: $?"
        exit 1
    }
else
    echo "plex-iptv-proxy user not found, skipping"
fi

echo "Uninstallation complete"
