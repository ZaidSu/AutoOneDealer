export default function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8 max-w-3xl">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-muted">{description}</p>}
    </header>
  );
}
