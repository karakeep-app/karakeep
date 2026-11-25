"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plug, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { SettingsPage, SettingsSection } from "./SettingsPage";

interface DiscoveredVoice {
  id: string;
  targetQuality?: string;
}

function TTSProviderSettings() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: config } = useQuery(api.tts.getSettings.queryOptions());

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoveredVoices, setDiscoveredVoices] = useState<DiscoveredVoice[]>(
    [],
  );

  // Auto-discovery on load stays quiet on failure; the Discover buttons
  // still toast.
  const quiet = useRef(false);
  const initialized = useRef(false);

  const { mutate: updateConfig, isPending: isSaving } = useMutation(
    api.tts.updateSettings.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.tts.saved"));
        setApiKey("");
        queryClient.invalidateQueries(api.tts.getSettings.pathFilter());
        queryClient.invalidateQueries(api.tts.isConfigured.pathFilter());
      },
      onError: (error) => {
        toast.error(t("settings.tts.save_failed", { error: error.message }));
      },
    }),
  );

  const {
    mutate: discoverModels,
    mutateAsync: discoverModelsAsync,
    isPending: isDiscoveringModels,
  } = useMutation(
    api.tts.discoverModels.mutationOptions({
      onSuccess: (data) => {
        setDiscoveredModels(data.models);
        if (data.models.length === 0 && !quiet.current) {
          toast.error(t("settings.tts.no_models"));
        }
      },
      onError: (error) => {
        if (!quiet.current)
          toast.error(
            t("settings.tts.discover_models_failed", { error: error.message }),
          );
      },
    }),
  );

  const {
    mutate: discoverVoices,
    mutateAsync: discoverVoicesAsync,
    isPending: isDiscoveringVoices,
  } = useMutation(
    api.tts.discoverVoices.mutationOptions({
      onSuccess: (data) => {
        setDiscoveredVoices(data.voices);
        if (data.voices.length === 0 && !quiet.current) {
          toast.error(t("settings.tts.no_voices"));
        }
      },
      onError: (error) => {
        if (!quiet.current)
          toast.error(
            t("settings.tts.discover_voices_failed", { error: error.message }),
          );
      },
    }),
  );

  useEffect(() => {
    // Once: later refetches (window focus) must not clobber unsaved edits.
    if (!config || initialized.current) {
      return;
    }
    initialized.current = true;
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setVoice(config.voice);
    quiet.current = true;
    discoverModels({ baseUrl: config.baseUrl });
    discoverVoices({ baseUrl: config.baseUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per loaded config
  }, [config]);

  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  // ponytail: "connected" = the models or voices endpoint answered.
  const testConnection = async () => {
    quiet.current = true;
    setIsTesting(true);
    setTestResult(null);
    const args = { baseUrl, apiKey: apiKey || undefined };
    const [m, v] = await Promise.allSettled([
      discoverModelsAsync(args),
      discoverVoicesAsync(args),
    ]);
    setIsTesting(false);
    if (m.status === "rejected" && v.status === "rejected") {
      setTestResult({
        ok: false,
        text: m.reason?.message ?? t("settings.tts.unreachable"),
      });
      return;
    }
    const models = m.status === "fulfilled" ? m.value.models.length : 0;
    const voices = v.status === "fulfilled" ? v.value.voices.length : 0;
    setTestResult({
      ok: true,
      text: t("settings.tts.connected", { models, voices }),
    });
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { mutate: previewVoice, isPending: isPreviewing } = useMutation(
    api.tts.previewVoice.mutationOptions({
      onSuccess: (data) => {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(
          new Blob([bytes], { type: data.contentType }),
        );
        previewUrlRef.current = url;
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = url;
        void audio.play();
      },
      onError: (error) => {
        toast.error(t("settings.tts.preview_failed", { error: error.message }));
      },
    }),
  );

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  return (
    <SettingsSection
      title={t("settings.tts.tts_settings")}
      description={t("settings.tts.section_description")}
    >
      <Field className="rounded-lg border p-3">
        <FieldLabel htmlFor="tts-base-url">
          {t("settings.tts.base_url")}
        </FieldLabel>
        <FieldDescription>
          {t("settings.tts.base_url_description")}
        </FieldDescription>
        <Input
          id="tts-base-url"
          type="url"
          placeholder="http://localhost:8880/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </Field>

      <Field className="rounded-lg border p-3">
        <FieldLabel htmlFor="tts-api-key">
          {t("settings.tts.api_key")}
        </FieldLabel>
        <FieldDescription>
          {config?.hasApiKey
            ? t("settings.tts.api_key_set")
            : t("settings.tts.api_key_optional")}
        </FieldDescription>
        <Input
          id="tts-api-key"
          type="password"
          placeholder={config?.hasApiKey ? "••••••••" : ""}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </Field>

      <Field className="rounded-lg border p-3">
        <FieldLabel htmlFor="tts-model">{t("settings.tts.model")}</FieldLabel>
        <FieldDescription>
          {t("settings.tts.model_description")}
        </FieldDescription>
        <div className="flex gap-2">
          {discoveredModels.length > 0 ? (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="tts-model" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {discoveredModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="tts-model"
              className="flex-1"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
          <ActionButton
            type="button"
            variant="outline"
            loading={isDiscoveringModels}
            disabled={!baseUrl}
            onClick={() => {
              quiet.current = false;
              discoverModels({ baseUrl, apiKey: apiKey || undefined });
            }}
          >
            <Search className="mr-2 size-4" />
            {t("settings.tts.discover")}
          </ActionButton>
        </div>
      </Field>

      <Field className="rounded-lg border p-3">
        <FieldLabel htmlFor="tts-voice">{t("settings.tts.voice")}</FieldLabel>
        <FieldDescription>
          {t("settings.tts.voice_description")}
        </FieldDescription>
        <div className="flex gap-2">
          {discoveredVoices.length > 0 ? (
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger id="tts-voice" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {discoveredVoices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        {v.id}
                        {v.targetQuality && (
                          <Badge variant="secondary">{v.targetQuality}</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="tts-voice"
              className="flex-1"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            />
          )}
          <ActionButton
            type="button"
            variant="outline"
            loading={isDiscoveringVoices}
            disabled={!baseUrl}
            onClick={() => {
              quiet.current = false;
              discoverVoices({ baseUrl, apiKey: apiKey || undefined });
            }}
          >
            <Search className="mr-2 size-4" />
            {t("settings.tts.discover")}
          </ActionButton>
          <ActionButton
            type="button"
            variant="outline"
            loading={isPreviewing}
            disabled={!baseUrl || !model || !voice}
            onClick={() =>
              previewVoice({
                baseUrl,
                apiKey: apiKey || undefined,
                model,
                voice,
              })
            }
          >
            <Play className="mr-2 size-4" />
            {t("settings.tts.play_sample")}
          </ActionButton>
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {testResult && (
          <p
            className={`text-sm ${testResult.ok ? "text-green-600 dark:text-green-500" : "text-destructive"}`}
          >
            {testResult.text}
          </p>
        )}
        <ActionButton
          type="button"
          variant="outline"
          loading={isTesting}
          disabled={!baseUrl}
          onClick={testConnection}
        >
          <Plug className="mr-2 size-4" />
          {t("settings.tts.test_connection")}
        </ActionButton>
        <ActionButton
          loading={isSaving}
          disabled={!baseUrl || !model || !voice}
          onClick={() =>
            updateConfig({
              provider: "openai-compatible",
              baseUrl,
              apiKey: apiKey || undefined,
              model,
              voice,
            })
          }
        >
          <Save className="mr-2 size-4" />
          {t("actions.save")}
        </ActionButton>
      </div>
    </SettingsSection>
  );
}

export default function TTSSettings() {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t("settings.tts.tts_settings")}
      description={t("settings.tts.page_description")}
    >
      <TTSProviderSettings />
    </SettingsPage>
  );
}
