export default function Loading() {
  return (
    <div aria-busy="true" role="status" className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line" />
      <div className="h-72 animate-pulse rounded-2xl bg-line/70" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
