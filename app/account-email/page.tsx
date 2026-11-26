"use client";

import { type FormEvent, useEffect, useState } from "react";
import { readApiResponse } from "@/lib/api-response.mjs";

type Action = "verify" | "reset" | "request-reset";

export default function AccountEmailPage() {
  const [action, setAction] = useState<Action | null>(null);
  const [token, setToken] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const linkAction = params.get("action");
    if (linkAction === "verify" || linkAction === "reset") {
      setAction(linkAction);
      setToken(params.get("token") ?? "");
    } else {
      setAction("request-reset");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (action === "reset" && password !== form.get("confirmPassword")) {
      setError("The passwords don’t match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, email: form.get("email"), password }),
      });
      const result = await readApiResponse(response);
      if (result.ok !== true) throw new Error("The account change couldn’t be confirmed. Try again.");
      window.history.replaceState(null, "", "/account-email");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  const verify = action === "verify";
  const reset = action === "reset";
  return (
    <main className="auth-wrap">
      <section className="auth-card" aria-labelledby="account-email-title">
        <a className="brand" href="/"><span aria-hidden="true" className="brand-mark"><span>♥</span></span> AfroIE Meet</a>
        <h1 className="serif" id="account-email-title">{verify ? "Confirm your email" : reset ? "Choose a new password" : "Recover your account"}</h1>
        {done ? <p role="status">{verify ? "Email verified. You can now continue to your profile." : reset ? "Password updated. Sign in with your new password." : "If an account exists, an email will include its username and a password reset link."}</p> :
          action && <form className="form-grid" onSubmit={submit}>
            {verify && <p>Confirm this address in the browser where you signed up. If the link expired, return to the app to resend it.</p>}
            {!verify && !reset && <div className="field"><label htmlFor="recovery-email">Account email address</label><input id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>}
            {reset && <>
              <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
              <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
            </>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary" disabled={busy}>{busy ? "Please wait…" : verify ? "Confirm email" : reset ? "Update password" : "Send recovery email"}</button>
          </form>}
        <p><a href="/app">{verify ? "Continue to AfroIE Meet" : "Back to sign in"}</a></p>
      </section>
    </main>
  );
}
