#!/usr/bin/env bash

# v3.0.0
# Copyright 2024-2025
# Author: vhsdream
# Adapted from: The Karakeep installation script from https://github.com/community-scripts/ProxmoxVE
# License: MIT

set -Eeuo pipefail
trap 'catch $LINENO "$BASH_COMMAND"' SIGINT SIGTERM ERR
verbose=0
SPINNER_PID=""

usage() {
  header
  cat <<EOF
This script has three functions:

'install'   Installs $(app) on a clean Debian 12/Ubuntu 24.04 system.
'update'    Checks for, and installs updates for $(app) on a system that previously installed $(app) by running this script.
'migrate'   Performs a full Hoarder ==> $(app) migration on a previous install. Also checks for updates afterwards.

Available options:

-h, --help      Print this help and exit
-v, --verbose   Print script StandardOutput
--no-color      Disable colours

This script WILL NOT update or migrate a $(app)/Hoarder install that was installed in any other way.
Please back up your existing installation before running this script!
If you encounter any errors please create a GitHub issue (https://github.com/karakeep-app/karakeep/issues) and tag vhsdream

Usage: bash $(basename "${BASH_SOURCE[0]}") [-h] [-v] [install|update|migrate]

EOF
  exit
}

header() {
  t_width=$(tput cols 2>/dev/null)
  if [[ "$t_width" -gt 115 ]]; then
    echo -e "$(
      cat <<EOF
  ${YELLOW}
  oMMWWWWWMMMMMMMMMMMo    ....                                      ...
  oMM     'MMMMMMMMMMo    xMMX                                     ;MMM.
  oMM     'MMOxkXMMMMo    kMMX                                     ;MMM.
  oMM     'MM'   .OMMo    kMMX   ,;;;. .;lll:.   ';;. :l  ,cloc,   ;MMM.  .;;;.  .:loc,      .:llc'    ;;; .clc,
  oMM     'MM'    .MMo    kMMX .0MMX, dMMXKWMMO  0MM0NMM'WMNKXMMW' ;MMM. dMMWl 'KMW0OXMWl  ;NMW0ONMN: .MMMXMWMMMWl
  oMM     .MM'     MMo    kMMNlWMWl    ...',NMM: 0MMWc.   '.',xMMK ;MMMlNMMk. .WMW:'''KMMc;MMW,'''XMM,.MMMk.  ;WMM:
  oMM     .MM'     MMo    kMMWKMMX.  .xWMN0ONMMo 0MMO   cXMWKOKMMW ;MMM0MMW:  cMMMXXXXXXXddMMWXXXXXXXc.MMM.    KMMx
  oMM     .MM'.ol. MMo    kMMX xMMWl dMM0  .XMMo 0MMO  .MMM.  dMMW ;MMM.:WMMO .NMMo...lc. .WMWc...o:  .MMMX:',xMMM'
  oMMXKKKKXMMWMMMMNMMo    kMMX  :WMM0,0MMMWX0MMo 0MMO   dWMMWWxMMW ;MMM. .KMMN,.dNMMMMMNo  .kWMMMMMXc .MMM0WMMMM0'
  .:cccccccccccccccc:.                  ...               ...                     ..'..       .''.    .MMM, ...
                                                                                                      .MMM,
                                                                                                      .OOO.${CLR}
                                                                               The ${PURPLE}Bookmark${CLR} ${RED}Everything${CLR} ${YELLOW}App${CLR}
                                                                               script version ${GREEN}3.0.0${CLR}
EOF
    )"
  fi
}

# Handling output suppression
set_verbosity() {
  if [ "$verbose" -eq 1 ]; then
    shh=""
  else
    shh="silent_running"
  fi
}

silent_running() {
  "$@" >/dev/null 2>&1
}

set_verbosity

# Colour handling
setup_colours() {
  if [[ -t 2 ]] && [[ -z "${NO_COLOR-}" ]] && [[ "${TERM-}" != "dumb" ]]; then
    CLR='\033[0m' GREEN='\033[0;32m' PURPLE='\033[0;35m' CYAN='\033[0;36m' YELLOW='\033[1;33m' RED='\033[0;31m'
  else
    CLR='' GREEN='' PURPLE='' CYAN='' YELLOW='' RED=''
  fi
}
setup_colours

# Flash and bling
app() {
  echo -e "${CLR}${PURPLE}Karakeep${CLR}"
}

spinner() {
  local frames=('▹▹▹▹▹' '▸▹▹▹▹' '▹▸▹▹▹' '▹▹▸▹▹' '▹▹▹▸▹' '▹▹▹▹▸')
  local spin_i=0
  local interval=0.1
  printf "\e[?25l"

  while true; do
    printf "\r${PURPLE}%s${CLR}" "${frames[spin_i]}"
    spin_i=$(((spin_i + 1) % ${#frames[@]}))
    sleep "$interval"
  done
}

msg_start() {
  printf "       "
  echo >&1 -ne "${CYAN}${1-}${CLR}"
  spinner &
  SPINNER_PID=$!
}

msg_done() {
  if [[ -n "$SPINNER_PID" ]] && ps -p "$SPINNER_PID" >/dev/null; then kill "$SPINNER_PID" >/dev/null; fi
  printf "\e[?25h"
  local msg="${1-}"
  echo -e "\r"
  echo >&1 -e "${GREEN}Done ✔ ${msg}${CLR}"
}

msg_info() {
  if [[ -n "$SPINNER_PID" ]] && ps -p "$SPINNER_PID" >/dev/null; then kill "$SPINNER_PID" >/dev/null; fi
  printf "\e[?25h"
  echo >&1 -e "${1-}\r"
}

# Exception and error handling
msg_err() {
  if [[ -n "$SPINNER_PID" ]] && ps -p "$SPINNER_PID" >/dev/null; then kill "$SPINNER_PID" >/dev/null; fi
  echo >&2 -e "${RED}${1-}${CLR}"
}

die() {
  local err=$1
  local code=${2-1}
  msg_err "$err"
  exit "$code"
}

catch() {
  local code=$?
  local line=$1
  local command=$2
  msg_err "Caught error in line $line: exit code $code: while executing $command"
}

parse_params() {
  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) verbose=1 && set_verbosity ;;
    --no-color) NO_COLOR=1 ;;
    -?*) die "Unknown flag: $1. Use -h|--help for help" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")
  [[ ${#args[@]} -eq 0 ]] && die "Missing script arguments. Use -h|--help for help"
  return 0
}

parse_params "$@"

OS="$(awk -F'=' '/^VERSION_CODENAME=/{ print $NF }' /etc/os-release)"
INSTALL_DIR=/opt/karakeep
APP_DIR="$INSTALL_DIR"/apps
export DATA_DIR=/var/lib/karakeep
CONFIG_DIR=/etc/karakeep
LOG_DIR=/var/log/karakeep
ENV_FILE=${CONFIG_DIR}/karakeep.env

install_karakeep() {
  header
  msg_info "$(app) installation for Debian 12/Ubuntu 24.04" && sleep 3
  echo -e "\n"
  msg_start "Installing dependencies..."
  $shh apt-get install --no-install-recommends -y \
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
    $shh apt-get install -y software-properties-common
    $shh add-apt-repository ppa:xtradeb/apps -y
    $shh apt-get install --no-install-recommends -y ungoogled-chromium yt-dlp
    ln -s /usr/bin/ungoogled-chromium /usr/bin/chromium
  else
    $shh apt-get install --no-install-recommends -y chromium
    curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/bin/yt-dlp && chmod +x /usr/bin/yt-dlp
  fi

  curl -fsSL https://github.com/Y2Z/monolith/releases/latest/download/monolith-gnu-linux-x86_64 -o /usr/bin/monolith && chmod +x /usr/bin/monolith
  curl -fsSLO https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch.deb
  DEBIAN_FRONTEND=noninteractive $shh apt-get install -y ./meilisearch.deb && rm ./meilisearch.deb
  msg_done "Installed dependencies"

  msg_start "Installing Node.js..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
  $shh apt-get update
  $shh apt-get install -y nodejs
  # https://github.com/karakeep-app/karakeep/issues/967
  $shh npm install -g corepack@0.31.0
  msg_done "Installed Node.js"

  msg_start "Installing $(app)${CYAN}, please wait...${CLR}"
  mkdir -p {"$DATA_DIR","$CONFIG_DIR","$LOG_DIR"}
  M_DATA_DIR=/var/lib/meilisearch
  M_CONFIG_FILE=/etc/meilisearch.toml
  RELEASE="$(curl -s https://api.github.com/repos/karakeep-app/karakeep/releases/latest | grep "tag_name" | awk '{print substr($2, 3, length($2)-4) }')"
  cd /tmp
  curl -fsSLO "https://github.com/karakeep-app/karakeep/archive/refs/tags/v${RELEASE}.zip"
  unzip -q v"$RELEASE".zip
  mv karakeep-"$RELEASE" "$INSTALL_DIR" && cd "$APP_DIR"/web
  corepack enable
  export NEXT_TELEMETRY_DISABLED=1
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="true"
  export CI="true"
  $shh pnpm i --frozen-lockfile
  $shh pnpm build
  cd "$APP_DIR"/workers
  $shh pnpm i --frozen-lockfile
  $shh pnpm build
  cd "$APP_DIR"/cli
  $shh pnpm i --frozen-lockfile
  $shh pnpm build
  cd "$INSTALL_DIR"/packages/db
  $shh pnpm migrate
  msg_done "Installed $(app)"

  msg_start "Creating configuration files..."
  cd "$INSTALL_DIR"
  MASTER_KEY="$(openssl rand -base64 12)"
  cat <<EOF >"$M_CONFIG_FILE"
env = "production"
master_key = "$MASTER_KEY"
db_path = "${M_DATA_DIR}/data"
dump_dir = "${M_DATA_DIR}/dumps"
snapshot_dir = "${M_DATA_DIR}/snapshots"
no_analytics = true
EOF
  chmod 600 "$M_CONFIG_FILE"

  karakeep_SECRET="$(openssl rand -base64 36 | cut -c1-24)"
  cat <<EOF >"$ENV_FILE"
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
  msg_done "Configuration complete"

  msg_start "Creating users and modifying permissions..."
  if ! id -u meilisearch >/dev/null 2>&1; then
    useradd -U -s /usr/sbin/nologin -r -m -d "$M_DATA_DIR" meilisearch
  fi
  if ! id -u karakeep >/dev/null 2>&1; then
    useradd -U -s /usr/sbin/nologin -r -M -d "$INSTALL_DIR" karakeep
  fi
  chown meilisearch:meilisearch "$M_CONFIG_FILE"
  touch "$LOG_DIR"/{karakeep-workers.log,karakeep-web.log}
  chown -R karakeep:karakeep "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
  msg_done "Users created, permissions modified"

  msg_start "Creating service files and configuring log rotation..."
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
WorkingDirectory=${APP_DIR}/workers
ExecStart=/usr/bin/node dist/index.js
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
WorkingDirectory=${APP_DIR}/web
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

  msg_done "Service files created, log rotation configured"

  msg_start "Enabling and starting services, please wait..." && sleep 3
  systemctl enable -q --now meilisearch.service karakeep.target
  service_check install
  exit 0
}

update_karakeep() {
  msg_info "${YELLOW}Checking for an update...${CLR}" && sleep 1
  if [[ ! -d ${INSTALL_DIR} ]]; then
    die "Is Karakeep even installed?"
  fi
  RELEASE="$(curl -s https://api.github.com/repos/karakeep-app/karakeep/releases/latest | grep "tag_name" | awk '{print substr($2, 3, length($2)-4) }')"
  PREV_RELEASE="$(cat "$INSTALL_DIR"/version.txt)"
  if [[ "$RELEASE" != "$PREV_RELEASE" ]]; then
    if [[ "$(systemctl is-active karakeep-web)" == "active" ]]; then
      msg_start "Stopping affected services..."
      systemctl stop karakeep-web karakeep-workers
      msg_done "Stopped services"
    fi
    if [[ "$OS" == "bookworm" ]]; then
      $shh yt-dlp -U
    fi
    msg_start "Updating $(app) ${CYAN}to v${RELEASE}...${CLR}"
    sed -i "s|SERVER_VERSION=${PREV_RELEASE}|SERVER_VERSION=${RELEASE}|" "$ENV_FILE"
    rm -R "$INSTALL_DIR"
    cd /tmp
    curl -fsSLO "https://github.com/karakeep-app/karakeep/archive/refs/tags/v${RELEASE}.zip"
    unzip -q v"$RELEASE".zip
    mv karakeep-"$RELEASE" "$INSTALL_DIR"
    # https://github.com/karakeep-app/karakeep/issues/967
    if [[ "$(corepack -v)" < "0.31.0" ]]; then
      $shh npm install -g corepack@0.31.0
    fi
    corepack enable
    export NEXT_TELEMETRY_DISABLED=1
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="true"
    export CI="true"
    cd "$APP_DIR"/web && $shh pnpm i --frozen-lockfile
    $shh pnpm build
    cd "$APP_DIR"/workers && $shh pnpm i --frozen-lockfile
    $shh pnpm build
    cd "$APP_DIR"/cli && $shh pnpm i --frozen-lockfile
    $shh pnpm build
    cd "$INSTALL_DIR"/packages/db && $shh pnpm migrate
    echo "$RELEASE" >"$INSTALL_DIR"/version.txt
    chown -R karakeep:karakeep "$INSTALL_DIR" "$DATA_DIR"
    msg_done "Updated $(app) ${CYAN}to v${RELEASE}${CLR}"
    msg_start "Restarting services and cleaning up..."
    rm /tmp/v"$RELEASE".zip

    # Migrations
    # 0.27 changed the worker compiled file from .mjs to .js
    if grep -q '^ExecStart=/usr/bin/node\s\+dist/index\.mjs$' /etc/systemd/system/karakeep-workers.service; then
      sed -i -E 's#^(ExecStart=/usr/bin/node\s+dist/)index\.mjs$#\1index.js#' /etc/systemd/system/karakeep-workers.service
      systemctl daemon-reload
    fi
    # End migrations

    systemctl restart karakeep.target
    service_check update
  else
    msg_info "${YELLOW}No update required.${CLR}"
  fi
  exit 0
}

migrate_karakeep() {
  if [[ ! -d /opt/karakeep ]]; then
    msg_start "Migrating your Hoarder installation to $(app), ${CYAN}then checking for an update...${CLR}"
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
    msg_info "${YELLOW}There is no need for a migration: $(app) ${YELLOW}is already installed.${CLR}"
  fi
}

service_check() {
  local services=("karakeep-browser" "karakeep-workers" "karakeep-web" "meilisearch")
  readarray -t status < <(for service in "${services[@]}"; do
    systemctl is-active "$service" | grep "^active" -
  done)
  if [[ "${#status[@]}" -eq 4 ]]; then
    if [[ "$1" == "install" ]]; then
      msg_done "$(app) ${CYAN}is running!${CLR}"
      sleep 1
      LOCAL_IP="$(hostname -I | awk '{print $1}')"
      msg_info "Go to ${YELLOW}http://$LOCAL_IP:3000 ${CLR}to create your account"
      msg_info "Change settings at ${YELLOW}'/etc/karakeep/karakeep.env'${CLR}"
      exit 0
    elif [[ "$1" == "update" ]]; then
      msg_done "$(app) ${CYAN}is updated and running!${CLR}"
      sleep 1
      exit 0
    elif [[ "$1" == "migrate" ]]; then
      msg_done "$(app) ${CYAN}migration complete!${CLR}"
      sleep 1
      exit 0
    fi
  else
    die "Some services have failed. Check 'journalctl -xeu <service-name>' to see what is going on"
  fi
}

[ "$(id -u)" -ne 0 ] && die "This script requires root privileges. Please run with sudo or as the root user."

case "${args[0]}" in
install)
  install_karakeep
  ;;
update)
  update_karakeep
  ;;
migrate)
  migrate_karakeep && update_karakeep
  ;;
*)
  die "Unknown command. Choose 'install', 'update' or 'migrate.'"
  ;;
esac
