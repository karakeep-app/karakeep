# Railway

:::info
This is a community-maintained template, not an official Karakeep build. If you'd rather the
core team handled hosting, updates and backups for you, see [Karakeep Cloud](./09-cloud-hosting.md).
:::

[Railway](https://railway.com) runs containers for you, so there's no server to provision or
maintain. Deploying Karakeep there takes one click.

### Requirements

- A _Railway_ account. Can be created [here](https://railway.com/login).

### 1. Deploy the template

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/karakeep-2)

This provisions three services wired together: Karakeep itself, Meilisearch for full-text
search, and a headless Chrome instance for crawling. `NEXTAUTH_SECRET` and the Meilisearch
master key are generated for you, and `NEXTAUTH_URL` is set to the assigned domain.

### 2. Wait for the first deploy

All three services start in a couple of minutes. Karakeep is then served over HTTPS on an
assigned `*.up.railway.app` domain, which you can swap for your own later.

### 3. Add your user

Visit the domain and register under _Sign Up_. Afterwards you may want to close registration
by setting `DISABLE_SIGNUPS` to `true` in the Karakeep service's variables.

### Optional

- Set `OPENAI_API_KEY` on the Karakeep service to enable AI tagging. Other options are in the
  [configuration docs](../03-configuration/01-environment-variables.md).
- Attach a volume mounted at `/data` if you want bookmark assets to survive redeploys.
