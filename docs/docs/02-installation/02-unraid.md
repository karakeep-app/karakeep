# Unraid

## Docker Compose Manager Plugin (Recommended)

You can use [Docker Compose Manager](https://forums.unraid.net/topic/114415-plugin-docker-compose-manager/) plugin to deploy Karakeep using the official docker compose file provided [here](https://github.com/karakeep-app/karakeep/blob/main/docker/docker-compose.yml). After creating the stack, you'll need to setup some env variables similar to that from the docker compose installation docs [here](/installation/docker#3-populate-the-environment-variables).

## Community Apps

:::info
The community application template is maintained by the community.
:::

Karakeep can be installed on Unraid using the community application plugins. Karakeep is a multi-container service, and because unraid doesn't natively support that, you'll have to install the different pieces as separate applications and wire them manually together.

Here's a high level overview of the services you'll need:

- **Karakeep** ([Support post](https://forums.unraid.net/topic/165108-support-collectathon-karakeep/)): Karakeep's main web app.
- **Browserless** ([Support post](https://forums.unraid.net/topic/130163-support-template-masterwishxbrowserless/)) OR **chrome** (sgraaf's repo): The chrome headless service used for fetching the content.
  - Karakeep's official docker compose doesn't use browserless.
  - The **chrome** app (sgraaf's repo) uses the alpine-chrome image by zenika, which is used in Karakeep's official docker compose
- **MeiliSearch** ([Support post](https://forums.unraid.net/topic/164847-support-collectathon-meilisearch/)): The search engine used by Karakeep. It's optional but highly recommended. If you don't have it set up, search will be disabled.

### Simple install of Karakeep with the chrome app (sgraaf's repo)
1. Install **chrome** (sgraaf's repo) and **meilisearch** (optional)
2. Install Karakeep:
   - Remove all Container Variables referencing **browserless**, specifically `BROWSER_WEBSOCKET_URL` and `BROWSER_CONNECT_ONDEMAND` (click `Show more settings ...`, may require Advanced View toggle)
   - Add another Variable:
     - Name: `BROWSER_WEB_URL`
     - Key: `BROWSER_WEB_URL`
     - Value: `http://YOUR_SERVER_IP:9222`
   - Configure the required Container Variables:
     - You may need to set the value for `NEXTAUTH_URL` to `http://YOUR_SERVER_IP:3000`
     - Generate a string for `NEXTAUTH_SECRET` using `openssl rand -base64 36` in the terminal
   - Configure or remove the optional Container Variables to your preference (e.g. the Meili and OpenAI variables)
   - Consider reading through the [Configuration docs](https://docs.karakeep.app/configuration) for additional Environment Variables that you may want to use
