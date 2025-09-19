# Kubernetes

### Requirements

- A kubernetes cluster
- kubectl
- kustomize

### 1. Get the deployment manifests

You can clone the repository and copy the `/kubernetes` directory into another directory of your choice.

### 2. Populate the environment variables

To configure the app, edit the configuration in `.env`.


You **should** change the random strings. You can use `openssl rand -base64 36` to generate the random strings. You should also change the `NEXTAUTH_URL` variable to point to your server address.

Using `HOARDER_VERSION=release` will pull the latest stable version. You might want to pin the version instead to control the upgrades (e.g. `HOARDER_VERSION=0.10.0`). Check the latest versions [here](https://github.com/hoarder-app/hoarder/pkgs/container/hoarder-web).

### 3. Setup OpenAI

To enable automatic tagging, you'll need to configure OpenAI. This is optional though but highly recommended.

- Follow [OpenAI's help](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key) to get an API key.
- Add the OpenAI API key to the `.env` file:

```
OPENAI_API_KEY=<key>
```

Learn more about the costs of using openai [here](/openai).

<details>
    <summary>[EXPERIMENTAL] If you want to use Ollama (https://ollama.com/) instead for local inference.</summary>

    **Note:** The quality of the tags you'll get will depend on the quality of the model you choose. Running local models is a recent addition and not as battle tested as using openai, so proceed with care (and potentially expect a bunch of inference failures).

    - Make sure ollama is running.
    - Set the `OLLAMA_BASE_URL` env variable to the address of the ollama API.
    - Set `INFERENCE_TEXT_MODEL` to the model you want to use for text inference in ollama (for example: `mistral`)
    - Set `INFERENCE_IMAGE_MODEL` to the model you want to use for image inference in ollama (for example: `llava`)
    - Make sure that you `ollama pull`-ed the models that you want to use.


</details>

### 4. Deploy the service

Deploy the service by running:

```
make deploy
```

### 5. Access the service

By default, these manifests expose the application as a LoadBalancer Service. You can run `kubectl get services` to identify the IP of the loadbalancer for your service.

Then visit `http://<loadbalancer-ip>:3000` and you should be greated with the Sign In page.

> Note: Depending on your setup you might want to expose the service via an Ingress, or have a different means to access it.

### [Optional] 6. Setup quick sharing extensions

Go to the [quick sharing page](/quick-sharing) to install the mobile apps and the browser extensions. Those will help you hoard things faster!

## Updating

Edit the `HOARDER_VERSION` variable in the `kustomization.yaml` file and run `make clean deploy`.
