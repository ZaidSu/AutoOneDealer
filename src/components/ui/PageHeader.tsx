export default function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <span aria-hidden className="mb-2.5 block h-1.5 w-12 rounded-full bg-gradient-to-r from-[#d7163b] via-[#f08c00] to-[#2f6fed]" />
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
