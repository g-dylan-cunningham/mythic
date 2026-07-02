import { redirect } from "next/navigation";
import { signIn } from "./actions";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { createClient } from "@/utils/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await searchParams;

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-50">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Mythic Press
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Operations login
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Sign in to view reports, sync status, and production readiness.
          </p>
        </div>

        <form
          action={signIn}
          className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-5 shadow-2xl shadow-black/30"
        >
          <label className="block">
            <span className="text-sm font-medium text-neutral-200">Email</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-200">
              Password
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 outline-none transition focus:border-emerald-400"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <PendingSubmitButton
            className="h-11 w-full rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
            pendingLabel="Signing in"
            type="submit"
          >
            Sign in
          </PendingSubmitButton>
        </form>
      </section>
    </main>
  );
}
