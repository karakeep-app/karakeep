# Kubernetes

### Requirements

- A kubernetes cluster
- kubectl
- kustomize

### 1. Get the deployment manifests

You can clone the repository and copy the `/kubernetes` directory into another directory of your choice.

### 2. Populate the environment variables and secrets

To configure the app, copy the `.env_sample` to `.env` and change to your specific needs.

You should also change the `NEXTAUTH_URL` variable to point to your server address.

Using `KARAKEEP_VERSION=release` will pull the latest stable version. You might want to pin the version instead to control the upgrades (e.g. `KARAKEEP_VERSION=0.10.0`). Check the latest versions [here](https://github.com/karakeep-app/karakeep/pkgs/container/karakeep).

To see all available configuration options check the [documentation](../03-configuration/01-environment-variables.md).

To configure the neccessary secrets for the application copy the `.secrets_sample` file to `.secrets` and change the sample secrets to your generated secrets.

> Note: You **should** change the random strings. You can use `openssl rand -base64 36` to generate the random strings.

### 3. Setup OpenAI

To enable automatic tagging, you'll need to configure OpenAI. This is optional though but highly recommended.

- Follow [OpenAI's help](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key) to get an API key.
- Add the OpenAI API key to the `.env` file:

```
OPENAI_API_KEY=<key>
```

Learn more about the costs of using openai [here](../06-administration/03-openai.md).

If you want to use a different AI provider (e.g. Ollama for local inference), check out the [different AI providers](../03-configuration/02-different-ai-providers.md) guide.

### 4. Deploy the service

Deploy the service by running:

```
make deploy
```

### 5. Access the service

#### via LoadBalancer IP

By default, these manifests expose the application as a LoadBalancer Service. You can run `kubectl get services` to identify the IP of the loadbalancer for your service.

Then visit `http://<loadbalancer-ip>:3000` and you should be greated with the Sign In page.

> Note: Depending on your setup you might want to expose the service via an Ingress, or have a different means to access it.

#### Via Ingress

If you want to use an ingress, you can customize the sample ingress in the kubernetes folder and change the host to the DNS name of your choice.

After that you have to configure the web service to the type ClusterIP so it is only reachable via the ingress.

If you have already deployed the service you can patch the web service to the type ClusterIP with the following command:

` kubectl -n karakeep patch service web -p '{"spec":{"type":"ClusterIP"}}' `

Afterwards you can apply the ingress and access the service via your chosen URL.

#### Setting up HTTPS access to the Service

To access karakeep securely you can configure the ingress to use a preconfigured TLS certificate. This requires that you already have the needed files, namely your .crt and .key file, on hand.

After you have deployed the karakeep manifests you can deploy your certificate for karakeep in the `karakeep` namespace with this example command. You can name the secret however you want. But be aware that the secret name in the ingress definition has to match the secret name.

` $ kubectl --namespace karakeep create secret tls karakeep-web-tls --cert=/path/to/crt --key=/path/to/key `

If the secret is successfully created you can now configure the Ingress to use TLS via this changes to the spec:

```` yaml
 spec:
  tls:
  - hosts:
      - karakeep.example.com
    secretName: karakeep-web-tls
````

> Note: Be aware that the hosts have to match between the tls spec and the HTTP spec.

### [Optional] 6. Setup quick sharing extensions

Go to the [quick sharing page](../04-using-karakeep/quick-sharing.md) to install the mobile apps and the browser extensions. Those will help you hoard things faster!

## Updating

Edit the `KARAKEEP_VERSION` variable in the `kustomization.yaml` file and run `make clean deploy`.

If you have chosen `release` as the image tag you can also destroy the web pod, since the deployment has an ImagePullPolicy set to always the pod always pulls the image from the registry, this way we can ensure that the newest release image is pulled.
