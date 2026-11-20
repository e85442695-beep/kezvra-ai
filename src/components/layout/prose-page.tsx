/** Simple long-form page wrapper for help, changelog and legal documents. */
export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-medium tracking-[-0.02em]">{title}</h1>
      {updated && <p className="mt-2 font-mono text-xs text-faint">{updated}</p>}
      <div className="prose-kz mt-8 [&_h2]:mt-10 [&_h2]:text-xl">{children}</div>
    </article>
  );
}

/** Visible notice on legal templates: they must be reviewed by a lawyer before launch. */
export function LegalDraftNotice({ en }: { en: boolean }) {
  return (
    <p className="not-prose rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      {en
        ? "Template. The operator must fill in the legal entity, jurisdiction and contacts and have this document reviewed by a lawyer before launch."
        : "Шаблон. Оператор сервісу має вказати юридичну особу, юрисдикцію й контакти та погодити документ із юристом до запуску."}
    </p>
  );
}
