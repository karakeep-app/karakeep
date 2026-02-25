# Debian 12/Ubuntu 24.04

:::warning
This script is a stripped-down version of those found in the [Proxmox Community Scripts](https://github.com/community-scripts/ProxmoxVE) repo. It has been adapted to work on baremetal Debian 12 or Ubuntu 24.04 installs **only**. Any other use is not supported and you use this script at your own risk.
:::

### Requirements

- **Debian 12** (Buster) or
- **Ubuntu 24.04** (Noble Numbat)

The script will download and install all dependencies (except for Ollama), install Karakeep, do a basic configuration of Karakeep and Meilisearch (the search app used by Karakeep), and create and enable the systemd service files needed to run Karakeep on startup. Karakeep and Meilisearch are run in the context of their low-privilege user environments for more security.

The script functions as an update script in addition to an installer. See **[Updating](#updating)**.

### 1. Download the script from the [Karakeep repository](https://github.com/karakeep-app/karakeep/blob/main/karakeep-linux.sh)

```
wget https://raw.githubusercontent.com/karakeep-app/karakeep/main/karakeep-linux.sh
```

### 2. Run the script

> This script must be run as `root`, or as a user with `sudo` privileges.

    If this is a fresh install, then run the installer by using the following command:

    ```shell
    bash karakeep-linux.sh install
    ```

### 3. Create an account/sign in

    Then visit `http://localhost:3000` and you should be greated with the Sign In page.

## Updating

> This script must be run as `root`, or as a user with `sudo` privileges.

    If Karakeep has previously been installed using this script, then run the updater like so:

    ```shell
     bash karakeep-linux.sh update
    ```

## Services and Ports

`karakeep.target` includes 4 services: `meilisearch.service`, `karakeep-web.service`, `karakeep-workers.service`, `karakeep-browser.service`.

- `meilisearch.service`: Provides full-text search, Karakeep Workers service connects to it, uses port `7700` by default.

- `karakeep-web.service`: Provides the karakeep web service, uses `3000` port by default.

- `karakeep-workers.service`: Provides the karakeep workers service, no port.

- `karakeep-browser.service`: Provides the headless browser service, uses `9222` port by default.

## Configuration, ENV file, database locations

During installation, the script created a configuration file for `meilisearch`, an `ENV` file for Karakeep, and located config paths and database paths separate from the installation path of Karakeep, so as to allow for easier updating. Their names/locations are as follows:

- `/etc/meilisearch.toml` - a basic configuration for meilisearch, that contains configs for the database location, disabling analytics, and using a master key, which prevents unauthorized connections.
- `/var/lib/meilisearch` - Meilisearch DB location.
- `/etc/karakeep/karakeep.env` - The Karakeep `ENV` file. Edit this file to configure Karakeep beyond the default. The web service and the workers service need to be restarted after editing this file:

    ```shell
    sudo systemctl restart karakeep-workers karakeep-web
    ```

- `/var/lib/karakeep` - The Karakeep database location. If you delete the contents of this folder you will lose all your data.

## Still Running Hoarder?

There is a way to upgrade. Please see [Hoarder to Karakeep Migration](../06-administration/08-hoarder-to-karakeep-migration.md)
