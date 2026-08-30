"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react";
import styles from "../secure.module.css";

function ActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(token ? "" : "Brakuje tokenu aktywacyjnego.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setError("Hasła nie są takie same.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Aktywacja nie powiodła się.");
      router.replace("/logowanie?aktywacja=gotowa");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aktywacja nie powiodła się.");
      setPending(false);
    }
  }

  return (
    <form className={styles.loginCard} onSubmit={submit}>
      <KeyRound size={30} color="#50706a" aria-hidden="true" />
      <h2>Aktywuj konto</h2>
      <p>Ustaw własne hasło. Link jest jednorazowy i po aktywacji przestanie działać.</p>
      <div className={styles.singleForm}>
        <div className={styles.field}><label htmlFor="password">Nowe hasło</label><input id="password" name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, co najmniej jedna litera i jedna cyfra.</small></div>
        <div className={styles.field}><label htmlFor="confirmation">Powtórz hasło</label><input id="confirmation" name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /></div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        <button className={styles.buttonPrimary} type="submit" disabled={pending || !token}>{pending ? "Aktywuję konto…" : "Aktywuj konto"} <ArrowRight size={18} /></button>
      </div>
    </form>
  );
}

export default function ActivationPage() {
  return (
    <main className={`${styles.shell} ${styles.loginShell}`} data-theme="light">
      <section className={styles.loginIntro}>
        <div><Link className={styles.brand} href="/"><span className={styles.brandMark}>E</span><span>EPITO</span></Link><h1>Dostęp tylko do Twojej firmy.</h1><p>Konto klienta jest przypisane do konkretnej firmy. Dokumenty i płatności pozostałych klientów biura są odseparowane również na poziomie bazy danych.</p></div>
        <div className={styles.loginLinks}><Link href="/logowanie"><ArrowLeft size={18} /> Wróć do logowania</Link></div>
      </section>
      <section className={styles.loginPanel}><Suspense fallback={<div className={styles.loading}>Ładowanie zaproszenia…</div>}><ActivationForm /></Suspense></section>
    </main>
  );
}
