# Arch Linux

## Installation

> [Hoarder on AUR](https://aur.archlinux.org/packages/hoarder) is not maintained by the hoarder official.

1. Install hoarder

    ```shell
    paru -S hoarder
    ```

2. (**Optional**) Install optional dependencies

    ```shell
    # meilisearch: for full text search
    paru -S meilisearch

    # ollama: for automatic tagging
    paru -S ollama

    # hoarder-cli: hoarder cli tool
    paru -S hoarder-cli
    ```

    You can use Open-AI instead of `ollama`. If you use `ollama`, you need to download the ollama model. Please refer to: [https://ollama.com/library](https://ollama.com/library).

3. Set up

    Environment variables can be set in `/etc/hoarder/hoarder.env` according to [configuration page](/configuration). **The environment variables that are not specified in `/etc/hoarder/hoarder.env` need to be added by yourself.**

4. Enable service

    ```shell
    sudo systemctl enable --now hoarder.target
    ```

    Then visit `http://localhost:3000` and you should be greated with the Sign In page.

## Services and Ports

`hoarder.target` include 3 services: `hoarder-web.service`, `hoarder-works.service`, `hoarder-browser.service`. 

- `hoarder-web.service`: Provide hoarder WebUI service, use `3000` port default.

- `hoarder-works.service`: Provide hoarder works service, no port.

- `hoarder-browser.service`: Provide browser headless service, use `9222` port default.
