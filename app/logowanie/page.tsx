"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import styles from "../secure.module.css";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const notice = searchParams.get("aktywacja") === "gotowa"
    ? "Konto zostało aktywowane. Możesz się zalogować."
    : searchParams.get("haslo") === "zmienione"
      ? "Hasło zostało zmienione. Zaloguj się ponownie."
      : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const payload = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok || !payload.redirectTo) throw new Error(payload.error || "Logowanie nie powiodło się.");
      router.push(payload.redirectTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Logowanie nie powiodło się.");
      setPending(false);
    }
  }

  return (
    <main className={`${styles.shell} ${styles.loginShell}`} data-theme="light">
      <section className={styles.loginIntro}>
        <div>
          <Link className={styles.brand} href="/" aria-label="Epito, strona główna">
            <span className={styles.brandMark}>E</span>
            <span>EPITO</span>
          </Link>
          <h1>Twoje biuro.<br />Jedno bezpieczne miejsce.</h1>
          <p>Logowanie dla właścicieli biur, pracowników i administratora platformy. Dane produkcyjne są oddzielone od publicznej demonstracji.</p>
        </div>
        <div className={styles.loginLinks}>
          <Link href="/"><ArrowLeft size={18} /> Strona główna</Link>
          <Link href="/panel">Otwórz publiczne demo</Link>
        </div>
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.loginCard} onSubmit={submit}>
          <LockKeyhole size={30} color="#50706a" aria-hidden="true" />
          <h2>Zaloguj się</h2>
          <p>Użyj konta utworzonego przez administratora Epito lub właściciela Twojej organizacji.</p>
          <div className={styles.singleForm}>
            <div className={styles.field}>
              <label htmlFor="email">Adres e-mail</label>
              <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Hasło</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
            </div>
            {notice ? <div className={styles.success} role="status">{notice}</div> : null}
            {error ? <div className={styles.error} role="alert">{error}</div> : null}
            <button className={styles.buttonPrimary} type="submit" disabled={pending}>
              {pending ? "Sprawdzam dane…" : "Zaloguj się"} <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className={styles.loading}>Ładowanie logowania…</main>}><LoginContent /></Suspense>;
}
