#!/usr/bin/env bash

set -Eeuo pipefail

# v2.2
# Copyright 2024-2025
# Author: vhsdream
# Adapted from: The Karakeep installation script from https://github.com/community-scripts/ProxmoxVE
# License: MIT

# Basic error handling
trap 'catch $? $LINENO' ERR

catch() {
  if [ "$1" == 0 ]; then
    return
  fi
  echo "Caught error $1 on line $2"
}

OS="$(awk -F'=' '/^VERSION_CODENAME=/{ print $NF }' /etc/os-release)"
INSTALL_DIR=/opt/karakeep
export DATA_DIR=/var/lib/karakeep
CONFIG_DIR=/etc/karakeep
LOG_DIR=/var/log/karakeep
ENV_FILE=${CONFIG_DIR}/karakeep.env

install() {
  echo "Karakeep installation for Debian 12/Ubuntu 24.04" && sleep 4
  echo "Installing Dependencies..." && sleep 1
  apt-get install --no-install-recommends -y \
    g++ \
    curl \
    build-essential \
    sudo \
    unzip \
    gnupg \
    graphicsmagick \
    ghostscript \
    ca-certificates
  if [[ "$OS" == "noble" ]]; then
    apt-get install -y software-properties-common
    add-apt-repository ppa:xtradeb/apps -y
    apt-get install --no-install-recommends -y ungoogled-chromium yt-dlp
    ln -s /usr/bin/ungoogled-chromium /usr/bin/chromium
  else
    apt-get install --no-install-recommends -y chromium
    wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -O /usr/bin/yt-dlp && chmod +x /usr/bin/yt-dlp
  fi

  wget -q https://github.com/Y2Z/monolith/releases/latest/download/monolith-gnu-linux-x86_64 -O /usr/bin/monolith && chmod +x /usr/bin/monolith
  wget -q https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch.deb &&
    DEBIAN_FRONTEND=noninteractive dpkg -i meilisearch.deb && rm meilisearch.deb
  echo "Installed Dependencies" && sleep 1

  echo "Installing Node.js..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
  # https://github.com/karakeep-app/karakeep/issues/967
  npm install -g corepack@0.31.0
  echo "Installed Node.js" && sleep 1

  echo "Installing Karakeep..."
  mkdir -p "$DATA_DIR"
  mkdir -p "$CONFIG_DIR"
  mkdir -p "$LOG_DIR"
  touch "$LOG_DIR"/{karakeep-workers.log,karakeep-web.log}
  M_DATA_DIR=/var/lib/meilisearch
  M_CONFIG_FILE=/etc/meilisearch.toml
  RELEASE=$(curl -s https://api.github.com/repos/karakeep-app/karakeep/releases/latest | grep "tag_name" | awk '{print substr($2, 3, length($2)-4) }')
  cd /tmp
  wget -q "https://github.com/karakeep-app/karakeep/archive/refs/tags/v${RELEASE}.zip"
  unzip -q v"$RELEASE".zip
  mv karakeep-"$RELEASE" "$INSTALL_DIR" && cd "$INSTALL_DIR"/apps/web
  corepack enable
  export NEXT_TELEMETRY_DISABLED=1
  export PUPPETEER_SKIP_DOWNLOAD="true"
  export CI="true"
  pnpm i --frozen-lockfile
  pnpm build
  cd "$INSTALL_DIR"/apps/workers
  pnpm i --frozen-lockfile
  cd "$INSTALL_DIR"/apps/cli
  pnpm i --frozen-lockfile
  pnpm build
  cd "$INSTALL_DIR"/packages/db
  pnpm migrate
  echo "Installed Karakeep" && sleep 1

  echo "Creating configuration files..."
  cd "$INSTALL_DIR"
  MASTER_KEY="$(openssl rand -base64 12)"
  cat <<EOF >${M_CONFIG_FILE}
env = "production"
master_key = "$MASTER_KEY"
db_path = "${M_DATA_DIR}/data"
dump_dir = "${M_DATA_DIR}/dumps"
snapshot_dir = "${M_DATA_DIR}/snapshots"
no_analytics = true
EOF
  chmod 600 "$M_CONFIG_FILE"

  karakeep_SECRET="$(openssl rand -base64 36 | cut -c1-24)"
  cat <<EOF >${ENV_FILE}
NODE_ENV=production
SERVER_VERSION=${RELEASE}
NEXTAUTH_SECRET="${karakeep_SECRET}"
NEXTAUTH_URL="http://localhost:3000"
DATA_DIR=${DATA_DIR}
MEILI_ADDR="http://127.0.0.1:7700"
MEILI_MASTER_KEY="${MASTER_KEY}"
BROWSER_WEB_URL="http://127.0.0.1:9222"
# CRAWLER_VIDEO_DOWNLOAD=true
# CRAWLER_VIDEO_DOWNLOAD_MAX_SIZE=
# OPENAI_API_KEY=
# OLLAMA_BASE_URL=
# INFERENCE_TEXT_MODEL=
# INFERENCE_IMAGE_MODEL=
EOF
  chmod 600 "$ENV_FILE"
  echo "$RELEASE" >"$INSTALL_DIR"/version.txt
  echo "Configuration complete" && sleep 1

  echo "Creating service files..."
  cat <<EOF >/etc/systemd/system/meilisearch.service
[Unit]
Description=MeiliSearch is a RESTful search API
Documentation=https://docs.meilisearch.com/
After=network.target

[Service]
User=meilisearch
Group=meilisearch
Restart=on-failure
WorkingDirectory=${M_DATA_DIR}
ExecStart=/usr/bin/meilisearch --config-file-path ${M_CONFIG_FILE}
NoNewPrivileges=true
ProtectHome=true
ReadWritePaths=${M_DATA_DIR}
ProtectSystem=full
ProtectHostname=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectKernelLogs=true
ProtectClock=true
LockPersonality=true
RestrictRealtime=yes
RestrictNamespaces=yes
MemoryDenyWriteExecute=yes
PrivateDevices=yes
PrivateTmp=true
CapabilityBoundingSet=
RemoveIPC=true

[Install]
WantedBy=multi-user.target
EOF

  cat <<EOF >/etc/systemd/system/karakeep-browser.service
[Unit]
Description=Karakeep headless browser
After=network.target

[Service]
User=root
Restart=on-failure
ExecStart=/usr/bin/chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --hide-scrollbars
TimeoutStopSec=5
SyslogIdentifier=karakeep-browser

[Install]
WantedBy=multi-user.target
EOF

  cat <<EOF >/etc/systemd/system/karakeep-workers.service
[Unit]
Description=Karakeep workers
Wants=network.target karakeep-browser.service meilisearch.service
After=network.target karakeep-browser.service meilisearch.service

[Service]
User=karakeep
Group=karakeep
Restart=always
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${INSTALL_DIR}/apps/workers
ExecStart=/usr/bin/pnpm run start:prod
StandardOutput=append:${LOG_DIR}/karakeep-workers.log
StandardError=append:${LOG_DIR}/karakeep-workers.log
TimeoutStopSec=5
SyslogIdentifier=karakeep-workers

[Install]
WantedBy=multi-user.target
EOF

  cat <<EOF >/etc/systemd/system/karakeep-web.service
[Unit]
Description=Karakeep web
Wants=network.target karakeep-workers.service
After=network.target karakeep-workers.service

[Service]
User=karakeep
Group=karakeep
Restart=on-failure
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${INSTALL_DIR}/apps/web
ExecStart=/usr/bin/pnpm start
StandardOutput=append:${LOG_DIR}/karakeep-web.log
StandardError=append:${LOG_DIR}/karakeep-web.log
TimeoutStopSec=5
SyslogIdentifier=karakeep-web

[Install]
WantedBy=multi-user.target
EOF

  cat <<EOF >/etc/systemd/system/karakeep.target
[Unit]
Description=Karakeep Services
After=network-online.target
Wants=meilisearch.service karakeep-browser.service karakeep-workers.service karakeep-web.service

[Install]
WantedBy=multi-user.target
EOF
  echo "Service files created" && sleep 1

  # configure log rotation
  cat <<EOF >/etc/logrotate.d/karakeep
/var/log/karakeep/*.log
{
  su karakeep karakeep
  weekly
  missingok
  rotate 4
  compress
  notifempty
}
EOF

  echo "Creating users and modifying permissions..."
  useradd -U -s /usr/sbin/nologin -r -m -d "$M_DATA_DIR" meilisearch
  useradd -U -s /usr/sbin/nologin -r -M -d "$INSTALL_DIR" karakeep
  chown meilisearch:meilisearch "$M_CONFIG_FILE"
  chown -R karakeep:karakeep "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
  echo "Users created, permissions modified" && sleep 1

  echo "Cleaning up" && sleep 1
  rm /tmp/v"$RELEASE".zip
  apt -y autoremove
  apt -y autoclean
  echo "Cleaned" && sleep 1

  echo "Enabling and starting services, please wait..." && sleep 3
  systemctl enable -q --now karakeep.target
  service_check install
}

update() {
  if [[ ! -d ${INSTALL_DIR} ]]; then
    echo "Is Karakeep even installed?"
    exit 1
  fi
  RELEASE=$(curl -s https://api.github.com/repos/karakeep-app/karakeep/releases/latest | grep "tag_name" | awk '{print substr($2, 3, length($2)-4) }')
  PREV_RELEASE=$(cat "$INSTALL_DIR"/version.txt)
  if [[ "$RELEASE" != "$PREV_RELEASE" ]]; then
    if [[ "$(systemctl is-active karakeep-web)" == "active" ]]; then
      echo "Stopping affected services..." && sleep 1
      systemctl stop karakeep-web karakeep-workers
      echo "Stopped services" && sleep 1
    fi
    if [[ "$OS" == "bookworm" ]]; then
      yt-dlp -U
    fi
    echo "Updating Karakeep to v${RELEASE}..." && sleep 1
    sed -i "s|SERVER_VERSION=${PREV_RELEASE}|SERVER_VERSION=${RELEASE}|" "$ENV_FILE"
    rm -R "$INSTALL_DIR"
    cd /tmp
    wget -q "https://github.com/karakeep-app/karakeep/archive/refs/tags/v${RELEASE}.zip"
    unzip -q v"$RELEASE".zip
    mv karakeep-"$RELEASE" "$INSTALL_DIR"
    # https://github.com/karakeep-app/karakeep/issues/967
    if [[ $(corepack -v) < "0.31.0" ]]; then
      npm install -g corepack@0.31.0
    fi
    corepack enable
    export NEXT_TELEMETRY_DISABLED=1
    export PUPPETEER_SKIP_DOWNLOAD="true"
    export CI="true"
    cd "$INSTALL_DIR"/apps/web && pnpm i --frozen-lockfile
    pnpm build
    cd "$INSTALL_DIR"/apps/workers && pnpm i --frozen-lockfile
    cd "$INSTALL_DIR"/apps/cli && pnpm i --frozen-lockfile
    pnpm build
    cd "$INSTALL_DIR"/packages/db && pnpm migrate
    echo "$RELEASE" >"$INSTALL_DIR"/version.txt
    chown -R karakeep:karakeep "$INSTALL_DIR" "$DATA_DIR"
    echo "Updated Karakeep to v${RELEASE}" && sleep 1
    echo "Restarting services..." && sleep 1
    rm /tmp/v"$RELEASE".zip
    systemctl restart karakeep.target
    service_check update
  else
    echo "No update required."
  fi
  exit 0
}

migrate() {
  if [[ ! -d /opt/karakeep ]]; then
    echo "Migrating your Hoarder installation to Karakeep, then checking for an update..." && sleep 3
    systemctl stop hoarder-browser hoarder-workers hoarder-web
    sed -i -e "s|hoarder|karakeep|g" /etc/hoarder/hoarder.env /etc/systemd/system/hoarder-{browser,web,workers}.service /etc/systemd/system/hoarder.target \
      -e "s|Hoarder|Karakeep|g" /etc/systemd/system/hoarder-{browser,web,workers}.service /etc/systemd/system/hoarder.target
    for path in /etc/systemd/system/hoarder*.service; do
      new_path="${path//hoarder/karakeep}"
      mv "$path" "$new_path"
    done
    mv /etc/systemd/system/hoarder.target /etc/systemd/system/karakeep.target
    mv /opt/hoarder "$INSTALL_DIR"
    mv /var/lib/hoarder "$DATA_DIR"
    mv /etc/hoarder "$CONFIG_DIR"
    mv /var/log/hoarder "$LOG_DIR"
    mv "$CONFIG_DIR"/hoarder.env "$ENV_FILE"
    mv "$LOG_DIR"/hoarder-web.log "$LOG_DIR"/karakeep-web.log
    mv "$LOG_DIR"/hoarder-workers.log "$LOG_DIR"/karakeep-workers.log
    usermod -l karakeep hoarder -d "$INSTALL_DIR"
    groupmod -n karakeep hoarder
    chown -R karakeep:karakeep "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
    systemctl daemon-reload
    systemctl -q enable --now karakeep.target
    service_check migrate
  else
    echo "There is no need for a migration: Karakeep is already installed."
    exit 1
  fi
}

service_check() {
  local services=("karakeep-browser" "karakeep-workers" "karakeep-web")
  readarray -t status < <(for service in "${services[@]}"; do
    systemctl is-active "$service" | grep "^active" -
  done)
  if [[ "${#status[@]}" -eq 3 ]]; then
    if [[ "$1" == "install" ]]; then
      echo "Karakeep is running!"
      sleep 1
      LOCAL_IP="$(hostname -I | awk '{print $1}')"
      echo "Go to http://$LOCAL_IP:3000 to create your account"
      exit 0
    elif [[ "$1" == "update" ]]; then
      echo "Karakeep is updated and running!"
      sleep 1
      exit 0
    elif [[ "$1" == "migrate" ]]; then
      echo "Karakeep migration complete!"
      sleep 1
      exit 0
    fi
  else
    echo "Some services have failed. Check 'journalctl -xeu <service-name>' to see what is going on"
    exit 1
  fi
}

[ "$(id -u)" -ne 0 ] && echo "This script requires root privileges. Please run with sudo or as the root user." && exit 1
command="${1:-}"
if [ "$command" = "" ]; then
  echo -e "\nRun script with:\r
parameter 'install' to install Karakeep\r
parameter 'update' to update Karakeep\r
parameter 'migrate' to migrate your Hoarder install to Karakeep\n
Note: 'migrate' will also update to the latest version if necessary" && exit 1
fi

case "$command" in
install)
  install
  ;;
update)
  update
  ;;
migrate)
  migrate && update
  ;;
*)
  echo -e "Unknown command. Choose 'install', 'update' or 'migrate'." && exit 1
  ;;
esac
