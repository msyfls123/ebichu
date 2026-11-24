interface AuthFormOptions {
  formId: string;
  /** API endpoint receiving `{ email, password }` as JSON. */
  endpoint: string;
  /** Where to go after a successful response. */
  redirectTo: string;
}

export function wireAuthForm({
  formId,
  endpoint,
  redirectTo,
}: AuthFormOptions): void {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  const error = form.querySelector<HTMLElement>("[data-error]");
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error?.setAttribute("hidden", "");
    submit?.setAttribute("disabled", "");

    const data = new FormData(form);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed. Please try again.");
      }
      location.assign(redirectTo);
    } catch (cause) {
      if (error) {
        error.textContent = cause instanceof Error ? cause.message : "Request failed";
        error.removeAttribute("hidden");
      }
    } finally {
      submit?.removeAttribute("disabled");
    }
  });
}

/** Reads the sanitized `return_to` value baked into the form. */
export function formReturnTo(formId: string): string {
  const form = document.getElementById(formId);
  return (form instanceof HTMLFormElement ? form.dataset.returnTo : undefined) ?? "/";
}
