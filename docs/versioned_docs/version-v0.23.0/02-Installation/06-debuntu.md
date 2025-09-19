# Debian 12/Ubuntu 24.04

:::warning
This script is a stripped-down version of those found in the [Proxmox Community Scripts](https://github.com/community-scripts/ProxmoxVE) repo. It has been adapted to work on baremetal Debian 12 or Ubuntu 24.04 installs **only**. Any other use is not supported and you use this script at your own risk.
:::

### Requirements

- **Debian 12** (Buster) or
- **Ubuntu 24.04** (Noble Numbat)

The script will download and install all dependencies (except for Ollama), install Hoarder, do a basic configuration of Hoarder and Meilisearch (the search app used by Hoarder), and create and enable the systemd service files needed to run Hoarder on startup. Hoarder and Meilisearch are run in the context of their low-privilege user environments for more security.

The script functions as an update script in addition to an installer. See **[Updating](#updating)**.

### 1. Download the script from the [Hoarder repository](https://github.com/hoarder-app/hoarder/blob/main/hoarder-linux.sh).

```
wget https://raw.githubusercontent.com/hoarder-app/hoarder/main/hoarder-linux.sh
```

### 2. Run the script

> This script must be run as `root`, or as a user with `sudo` privileges.

    If this is a fresh install, then run the installer by using the following command:

    ```shell
    bash hoarder-linux.sh install
    ```

### 3. Create an account/sign in!

    Then visit `http://localhost:3000` and you should be greated with the Sign In page.

## Updating

> This script must be run as `root`, or as a user with `sudo` privileges.

    If Hoarder has previously been installed using this script, then run the updater like so:

    ```shell
     bash hoarder-linux.sh update
    ```

## Services and Ports

`hoarder.target` includes 4 services: `meilisearch.service`, `hoarder-web.service`, `hoarder-workers.service`, `hoarder-browser.service`. 

- `meilisearch.service`: Provides full-text search, Hoarder Workers service connects to it, uses port `7700` by default.

- `hoarder-web.service`: Provides the hoarder web service, uses `3000` port by default.

- `hoarder-workers.service`: Provides the hoarder workers service, no port.

- `hoarder-browser.service`: Provides the headless browser service, uses `9222` port by default.

## Configuration, ENV file, database locations

During installation, the script created a configuration file for `meilisearch`, an `ENV` file for Hoarder, and located config paths and database paths separate from the installation path of Hoarder, so as to allow for easier updating. Their names/locations are as follows:

- `/etc/meilisearch.toml` - a basic configuration for meilisearch, that contains configs for the database location, disabling analytics, and using a master key, which prevents unauthorized connections.
- `/var/lib/meilisearch` - Meilisearch DB location.
- `/etc/hoarder/hoarder.env` - The Hoarder `ENV` file. Edit this file to configure Hoarder beyond the default. The web service and the workers service need to be restarted after editing this file:
    
    ```shell
    sudo systemctl restart hoarder-workers hoarder-web
    ```
- `/var/lib/hoarder` - The Hoarder database location. If you delete the contents of this folder you will lose all your data.

