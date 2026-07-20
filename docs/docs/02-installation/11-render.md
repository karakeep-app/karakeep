# Render

Deploy Karakeep on [Render](https://render.com/) with the Blueprint in this repo (`render.yaml`). It mirrors the official Docker Compose stack: web app, Meilisearch, and headless Chrome on Render's private network.

<p>
  <a href="https://render.com/deploy?repo=https://github.com/karakeep-app/karakeep">
    <img alt="Deploy to Render" src="https://render.com/images/deploy-to-render-button.svg" height="20" />
  </a>
</p>

### Requirements

- A [Render](https://render.com/) account
- A GitHub account (Render forks the repo when you deploy from the button)

### 1. Deploy the Blueprint

Click **Deploy to Render** above, or open the [Blueprint deploy link](https://render.com/deploy?repo=https://github.com/karakeep-app/karakeep) and apply `render.yaml`.

Render creates three services:

- **karakeep** (web): official image, persistent disk for bookmarks and assets
- **meilisearch** (private service): full-text search
- **chrome** (private service): crawling and screenshots

### 2. Finish setup

1. Open the **karakeep** web service URL and create your account.
2. Optional: set `OPENAI_API_KEY` on the **karakeep** service in the Render Dashboard for AI tagging and summarization.

`NEXTAUTH_SECRET`, `MEILI_MASTER_KEY`, and `NEXTAUTH_URL` are wired by the Blueprint. Plan and image tag choices are made at deploy time in the Dashboard.
