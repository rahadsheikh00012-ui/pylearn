"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { api, jsonBody } from "@/lib/api";
import { ErrorMessage, Loading, LoadingModal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";

type Config = { id: number; provider: string; model: string; base_url: string; api_key: string; is_active: boolean } | null;
type Provider = "OPENAI" | "GEMINI" | "GENERIC";

const providerOptions = [
  { value: "OPENAI", label: "OpenAI" },
  { value: "GEMINI", label: "Gemini" },
  { value: "GENERIC", label: "OpenAI-compatible" },
];

const modelOptions: Record<Exclude<Provider, "GENERIC">, { value: string; label: string }[]> = {
  OPENAI: [
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-5-nano", label: "GPT-5 nano" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  GEMINI: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

function normalizeProvider(value: string | null | undefined): Provider {
  const normalized = String(value || "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "GEMINI" || normalized === "GOOGLE_GEMINI") return "GEMINI";
  if (normalized === "GENERIC" || normalized === "OPENAI_COMPATIBLE" || normalized === "OPENAI_COMPAT") return "GENERIC";
  return "OPENAI";
}

function defaultModel(provider: Provider) {
  return provider === "GENERIC" ? "" : modelOptions[provider][0].value;
}

function providerModelOptions(provider: Exclude<Provider, "GENERIC">, model: string) {
  const options = modelOptions[provider];
  if (!model || options.some(option => option.value === model)) return options;
  return [{ value: model, label: `Current: ${model}` }, ...options];
}

export function AISettingsPage() {
  const current = useApiData<Config>("/ai/config/");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<Provider>("OPENAI");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const hasConfig = Boolean(current.data);

  useEffect(() => {
    if (!current.data) {
      setProvider("OPENAI");
      setModel("");
      setBaseUrl("");
      setEditing(true);
      return;
    }
    const currentProvider = normalizeProvider(current.data.provider);
    setProvider(currentProvider);
    setModel(current.data.model);
    setBaseUrl(current.data.base_url || "");
    setEditing(false);
  }, [current.data]);

  function changeProvider(nextProvider: string) {
    const typedProvider = normalizeProvider(nextProvider);
    setProvider(typedProvider);
    setModel(defaultModel(typedProvider));
    if (typedProvider !== "GENERIC") setBaseUrl("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setSaving(true);
      await api("/ai/config/", { method: "POST", body: jsonBody(raw) });
      await current.reload();
      setEditing(false);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!current.data) return;
    setProvider(normalizeProvider(current.data.provider));
    setModel(current.data.model);
    setBaseUrl(current.data.base_url || "");
    setError("");
    setEditing(false);
  }

  if (current.loading) return <Loading variant="form" />;

  return (
    <>
      <LoadingModal open={saving} title="Saving provider" message="Updating the active AI configuration." />
      <PageHeader title="AI Provider Settings" description="Configure one active encrypted provider credential." />
      <div className="grid md:grid-cols-2 gap-5">
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-bold text-lg">Current configuration</h2>
            {hasConfig && !editing ? (
              <button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit
              </button>
            ) : null}
          </div>
          {current.error ? (
            <ErrorMessage message={current.error} />
          ) : current.data ? (
            <dl className="mt-4 space-y-2">
              <div>
                <dt className="muted">Provider</dt>
                <dd>{current.data.provider}</dd>
              </div>
              <div>
                <dt className="muted">Model</dt>
                <dd>{current.data.model}</dd>
              </div>
              <div>
                <dt className="muted">Base URL</dt>
                <dd>{current.data.base_url || "Default provider endpoint"}</dd>
              </div>
              <div>
                <dt className="muted">API key</dt>
                <dd>{current.data.api_key}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted mt-3">No active provider.</p>
          )}
        </section>

        {editing ? (
          <form className="panel p-5 space-y-3" onSubmit={save}>
            <h2 className="font-bold text-lg">{hasConfig ? "Edit provider" : "Add provider"}</h2>
            <ModernSelect
              className="field"
              name="provider"
              aria-label="AI provider"
              options={providerOptions}
              value={provider}
              onValueChange={changeProvider}
            />
            {provider === "GENERIC" ? (
              <input
                className="field"
                name="model"
                placeholder="Model name"
                value={model}
                onChange={event => setModel(event.target.value)}
                required
              />
            ) : (
              <ModernSelect
                className="field"
                name="model"
                aria-label="Model"
                options={providerModelOptions(provider, model)}
                value={model || defaultModel(provider)}
                onValueChange={setModel}
              />
            )}
            <input
              className="field"
              name="base_url"
              type="url"
              placeholder="Optional custom base URL"
              value={baseUrl}
              onChange={event => setBaseUrl(event.target.value)}
              disabled={provider !== "GENERIC"}
              required={provider === "GENERIC"}
            />
            <input
              className="field"
              name="api_key"
              type="password"
              placeholder={hasConfig ? "New API key" : "API key"}
              required={!hasConfig}
            />
            {error && <ErrorMessage message={error} />}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Save size={16} /> {saving ? "Saving..." : "Save"}
              </button>
              {hasConfig ? (
                <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
                  <X size={16} /> Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
