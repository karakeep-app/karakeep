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
- **Browserless** ([Support post](https://forums.unraid.net/topic/130163-support-template-masterwishxbrowserless/)): The chrome headless service used for fetching the content. Karakeep's official docker compose doesn't use browserless, but it's currently the only headless chrome service available on unraid, so you'll have to use it.
- **MeiliSearch** ([Support post](https://forums.unraid.net/topic/164847-support-collectathon-meilisearch/)): The search engine used by Karakeep. It's optional but highly recommended. If you don't have it set up, search will be disabled.
