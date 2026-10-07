"use client";

import ky from "ky";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";

const CreateKeyResponseSchema = z.object({
  ok: z.literal(true),
  key: z.string().min(1),
});

export function KeyCreator() {
  const router = useRouter();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setGeneratedKey(null);
    setIsCopied(false);

    try {
      const form = event.currentTarget;
      const response = await ky
        .post("/api/api-keys", { body: new FormData(form) })
        .json<unknown>();
      const parsed = CreateKeyResponseSchema.parse(response);
      setGeneratedKey(parsed.key);
      form.reset();
      router.refresh();
    } catch (error) {
      if (error && typeof error === "object" && "response" in error && error.response instanceof Response) {
        try {
          const data = (await error.response.json()) as { error?: string };
          if (data?.error && typeof data.error === "string") {
            setErrorMessage(data.error);
            return;
          }
        } catch {
          // fall through to default message
        }
      }
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to generate an API key.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setIsCopied(true);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to copy the API key.");
      }
    }
  }

  return (
    <>
      <form className="key-form" onSubmit={createKey}>
        <label htmlFor="key-name">Key name</label>
        <input
          id="key-name"
          name="name"
          type="text"
          maxLength={40}
          placeholder="prod-llm-app"
          required
        />
        <button
          className="cta cta-primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Generating..." : "Generate key"}
        </button>
      </form>
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {generatedKey ? (
        <div className="key-reveal" aria-live="polite">
          <p>
            <strong>Copy this key now.</strong> It will not be shown again.
          </p>
          <code>{generatedKey}</code>
          <button className="cta cta-ghost" type="button" onClick={copyKey}>
            {isCopied ? "Copied" : "Copy key"}
          </button>
        </div>
      ) : null}
    </>
  );
}
