import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Logo from "./Logo";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";

const enum LoginState {
  NONE = "NONE",
  USERNAME_PASSWORD = "USERNAME/PASSWORD",
  API_KEY = "API_KEY",
}

export default function SignInPage() {
  const navigate = useNavigate();
  const { settings, setSettings } = usePluginSettings();

  const {
    mutate: login,
    error: usernamePasswordError,
    isPending: userNamePasswordRequestIsPending,
  } = api.apiKeys.exchange.useMutation({
    onSuccess: (resp) => {
      setSettings((s) => ({ ...s, apiKey: resp.key, apiKeyId: resp.id }));
      navigate("/options");
    },
  });

  const {
    mutate: validateApiKey,
    error: apiKeyValidationError,
    isPending: apiKeyValueRequestIsPending,
  } = api.apiKeys.validate.useMutation({
    onSuccess: () => {
      setSettings((s) => ({ ...s, apiKey: apiKeyFormData.apiKey }));
      navigate("/options");
    },
  });

  const [lastLoginAttemptSource, setLastLoginAttemptSource] =
    useState<LoginState>(LoginState.NONE);

  const [formData, setFormData] = useState<{
    email: string;
    password: string;
  }>({
    email: "",
    password: "",
  });

  const [apiKeyFormData, setApiKeyFormData] = useState<{
    apiKey: string;
  }>({
    apiKey: "",
  });

  const onUserNamePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLastLoginAttemptSource(LoginState.USERNAME_PASSWORD);
    const randStr = (Math.random() + 1).toString(36).substring(5);
    login({ ...formData, keyName: `Browser extension: (${randStr})` });
  };

  const onApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLastLoginAttemptSource(LoginState.API_KEY);
    validateApiKey({ ...apiKeyFormData });
  };

  let errorMessage = "";
  let loginError;
  switch (lastLoginAttemptSource) {
    case LoginState.USERNAME_PASSWORD:
      loginError = usernamePasswordError;
      break;
    case LoginState.API_KEY:
      loginError = apiKeyValidationError;
      break;
  }
  if (loginError) {
    errorMessage = loginError.message || "Wrong username or password";
  }

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <p className="text-lg">Login</p>
      <p className="text-red-500">{errorMessage}</p>
      <form
        className="flex flex-col gap-y-2"
        onSubmit={onUserNamePasswordSubmit}
      >
        <div className="flex flex-col gap-y-1">
          <label className="my-auto font-bold">Email</label>
          <Input
            value={formData.email}
            onChange={(e) =>
              setFormData((f) => ({ ...f, email: e.target.value }))
            }
            type="text"
            name="email"
            className="h-8 flex-1 rounded-lg border border-gray-300 p-2"
          />
        </div>
        <div className="flex flex-col gap-y-1">
          <label className="my-auto font-bold">Password</label>
          <Input
            value={formData.password}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                password: e.target.value,
              }))
            }
            type="password"
            name="password"
            className="h-8 flex-1 rounded-lg border border-gray-300 p-2"
          />
        </div>
        <Button
          type="submit"
          disabled={
            userNamePasswordRequestIsPending || apiKeyValueRequestIsPending
          }
        >
          Login
        </Button>
      </form>
      <div className="flex w-full flex-row items-center gap-3">
        <hr className="flex-1" />
        Or
        <hr className="flex-1" />
      </div>

      <form className="flex flex-col gap-y-2" onSubmit={onApiKeySubmit}>
        <div className="flex flex-col gap-y-1">
          <label className="my-auto font-bold">API Key</label>
          <Input
            value={apiKeyFormData.apiKey}
            onChange={(e) =>
              setApiKeyFormData((f) => ({ ...f, apiKey: e.target.value }))
            }
            type="text"
            name="apiKey"
            className="h-8 flex-1 rounded-lg border border-gray-300 p-2"
          />
        </div>
        <Button
          type="submit"
          disabled={
            userNamePasswordRequestIsPending || apiKeyValueRequestIsPending
          }
        >
          Login with API key
        </Button>
      </form>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => navigate("/customheaders")}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Configure Custom Headers
          {settings.customHeaders &&
            Object.keys(settings.customHeaders).length > 0 &&
            ` (${Object.keys(settings.customHeaders).length})`}
        </button>
      </div>
    </div>
  );
}
