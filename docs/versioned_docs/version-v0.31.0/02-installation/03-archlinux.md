# Arch Linux

## Installation

> [Karakeep on AUR](https://aur.archlinux.org/packages/karakeep) is not maintained by the karakeep official.

1. Install karakeep

    ```shell
    paru -S karakeep
    ```

2. (**Optional**) Install optional dependencies

    ```shell
    # karakeep-cli: karakeep cli tool
    paru -S karakeep-cli

    # ollama: for automatic tagging
    sudo pacman -S ollama

    # yt-dlp: for download video
    sudo pacman -S yt-dlp
    ```

    You can use Open-AI instead of `ollama`. If you use `ollama`, you need to download the ollama model. Please refer to: [https://ollama.com/library](https://ollama.com/library).

3. Set up

    Environment variables can be set in `/etc/karakeep/karakeep.env` according to [configuration page](../03-configuration/01-environment-variables.md). **The environment variables that are not specified in `/etc/karakeep/karakeep.env` need to be added by yourself.**

4. Enable service

    ```shell
    sudo systemctl enable --now karakeep.target
    ```

    Then visit `http://localhost:3000` and you should be greated with the sign in page.

## Services and Ports

`karakeep.target` include 3 services: `karakeep-web.service`, `karakeep-works.service`, `karakeep-browser.service`.

- `karakeep-web.service`: Provide karakeep webui service, uses `3000` port by default.

- `karakeep-workers.service`: Provide karakeep workers service, no port.

- `karakeep-browser.service`: Provide browser headless service, uses `9222` port by default.

Now `karakeep` depends on `meilisearch`, and `karakeep-workers.service` wants `meilisearch.service`, starting `karakeep.target` will start `meilisearch.service` at the same time.

## How to Migrate from Hoarder to Karakeep

The PKGBUILD has been fully updated to replace all references to `hoarder` with `karakeep`. If you want to preserve your existing `hoarder` data during the upgrade, please follow the steps below:

**1. Stop the old services**

```shell
sudo systemctl stop hoarder-web.service hoarder-worker.service hoarder-browser.service
sudo systemctl disable --now hoarder.target
```

**2. Uninstall Hoarder**  
After uninstalling, you can manually remove the old `hoarder` user and group if needed.
```shell
paru -R hoarder
```

**3. Rename the old data directory**
```shell
sudo mv /var/lib/hoarder /var/lib/karakeep
```

**4. Install Karakeep**
```shell
paru -S karakeep
```

**5. Fix ownership of the data directory**
```shell
sudo chown -R karakeep:karakeep /var/lib/karakeep
```

**6. Set Karakeep**  
Edit `/etc/karakeep/karakeep.env` according to [configuration page](../03-configuration/01-environment-variables.md). **The environment variables that are not specified in `/etc/karakeep/karakeep.env` need to be added by yourself.**

Or you can copy old hoarder env file to karakeep:
```shell
sudo cp -f /etc/hoarder/hoarder.env /etc/karakeep/karakeep.env
```

**7. Start Karakeep**
```shell
sudo systemctl enable --now karakeep.target
```
