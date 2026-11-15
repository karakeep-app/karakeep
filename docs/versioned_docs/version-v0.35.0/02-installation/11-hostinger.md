---
sidebar_label: "Hostinger"
---

# Host Karakeep on Hostinger

:::info
Note: Hostinger shares some of its revenue from hosting Karakeep with the maintainer of this project.
:::

[Hostinger](https://www.hostg.xyz/aff_c?offer_id=815&aff_id=243872&url_id=6969) offers VPS plans with a one-click Karakeep template. It deploys the same Docker Compose setup described in the [Docker guide](./01-docker.md) onto a VPS that you own, so you get a self-hosted instance without having to install Docker or write the compose file yourself.

[![Deploy on Hostinger](https://assets.hostinger.com/vps/deploy.svg)](https://www.hostg.xyz/aff_c?offer_id=815&aff_id=243872&url_id=6969)

:::tip
Use the coupon code `KARAKEEP10` at checkout for 10% off annual (or longer) plans.
:::

### 1. Pick a plan

Click the **Deploy on Hostinger** button above, or open [Hostinger's Karakeep template](https://www.hostg.xyz/aff_c?offer_id=815&aff_id=243872&url_id=6969) directly. Either one opens Hostinger's VPS page with the Karakeep template selected. Choose a plan and billing period, apply the `KARAKEEP10` coupon if you're going for an annual or longer plan, and complete the checkout.

The smallest plan is enough for most personal collections. Pick a bigger one if you plan to archive a lot of full-page content or videos, since the crawler and Meilisearch are the heaviest parts of the stack.

### 2. Finish the VPS setup

After checkout, Hostinger walks you through the VPS setup: choose a server location close to you and set a root password. The Karakeep template is installed on the VPS once the setup completes, which takes a few minutes.

### 3. Configure Karakeep

Open the VPS in Hostinger's panel and go to its Docker Manager, where the Karakeep project lives. From there you can edit the project's environment variables. The ones worth setting early:

- `NEXTAUTH_URL`: the address you'll use to reach Karakeep (e.g. `http://<your-vps-ip>:3000`, or your domain if you point one at the VPS).
- `OPENAI_API_KEY`: enables automatic tagging and summarization. Optional, but recommended. See [here](../06-administration/03-openai.md) for the costs.

The full list of options is in the [configuration docs](../03-configuration/01-environment-variables.md). Changes take effect after the project is redeployed.

### 4. Create your account

Visit `http://<your-vps-ip>:3000` and create the first user under _Sign Up_. The first user becomes the admin. After that you may want to disable further sign-ups by setting `DISABLE_SIGNUPS=true`.

### Updating

The template runs the `release` image tag. To update, pull the latest images and redeploy the project from the Docker Manager. Check the [release notes](https://github.com/karakeep-app/karakeep/releases) before upgrading.
