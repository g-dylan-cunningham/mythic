import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewReports } from "@/lib/auth/roles";
import { reports } from "@/lib/reporting/reports";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";

export default async function ReportingPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canViewReports(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <HoverText text={hoverTextCopy.links.dashboard}>
            <Link
              className="text-sm text-neutral-400 hover:text-neutral-200"
              href="/dashboard"
            >
              Dashboard
            </Link>
          </HoverText>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Reporting
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Mythic reports
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Read-only reporting surfaces for validating vendor connections,
            reconciling business rules, and shaping the database before we
            automate syncs.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <HoverText
              className="block"
              key={report.href}
              text={hoverTextCopy.reporting.reportCard}
            >
              <Link
                className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60"
                href={report.href}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                    {report.source}
                  </span>
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
                    {report.status}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-semibold">{report.title}</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {report.description}
                </p>
                <p className="mt-5 text-sm font-medium text-emerald-300">
                  Open report
                </p>
              </Link>
            </HoverText>
          ))}
        </section>
      </div>
    </main>
  );
}
