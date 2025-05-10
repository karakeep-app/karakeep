# Karakeep Helm chart

Helm chart for deploying Karakeep along with:

- **[Meilisearch](https://github.com/meilisearch/meilisearch-kubernetes)**: for fast and lightweight full-text search
- **[Headless Chrome](https://github.com/jlandure/alpine-chrome)**: enables web page previews

This chart inherits from the [bjw-s/common](https://github.com/bjw-s/helm-charts/tree/main/charts/library/common) library.

### Configuration

| Key                    | Description                              | Default                  |
| ---------------------- | ---------------------------------------- | ------------------------ |
| `applicationHost`      | Hostname used in ingress/service         | `karakeep.domain`        |
| `applicationProtocol`  | Protocol for internal service references | `http`                   |
| `applicationSecretKey` | Secret used for app authentication       | Auto-generated if `null` |
| `meilisearchMasterKey` | Meilesearch master key                   | Auto-generated if `null` |

#### Example with OIDC Authentication

```yaml
controllers:
  karakeep:
    containers:
      karakeep:
        env:
          DISABLE_PASSWORD_AUTH: "true"
          OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING: "true"
          OAUTH_PROVIDER_NAME: OIDC
          OAUTH_SCOPE: openid email profile
          OAUTH_WELLKNOWN_URL: https://auth.company/application/o/karakeep/.well-known/openid-configuration

secrets:
  karakeep:
    stringData:
      OAUTH_CLIENT_ID: your-client-id
      OAUTH_CLIENT_SECRET: your-client-secret
```
