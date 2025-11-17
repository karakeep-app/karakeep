# Kubernetes installation with Kustomize
You can use kustomize to deploy Karakeep in one of two ways.

## Remote repo
- Require this path as a remote resource in your kustomize config.
- Provide your own secret and configMap generators to replace the default ones. Example below:

```
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: karakeep
configMapGenerator:
  - envs:
    - env
    name: karakeep-configuration
    behavior: replace
secretGenerator:
- envs:
  - .secrets
  name: karakeep-secrets
  behavior: replace
resources:
  - https://github.com/karakeep-app/karakeep//kubernetes?ref=v0.27.1
```

## Makefile
- Clone this repo
- Edit the object definitions to suit your needs
- Edit the configuration in `.env` and `.secrets`
- Run `make deploy`

