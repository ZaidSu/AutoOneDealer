export default function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-7 max-w-3xl">
      <h1 className="page-title">{title}</h1>
      {description && <p className="mt-1.5 text-muted">{description}</p>}
    </header>
  );
}
