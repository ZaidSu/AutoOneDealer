import Link from "next/link";

export default function LoadMore({ basePath, params, next }: { basePath: string; params: Record<string, string>; next: string | null }) {
  if (!next) return null;
  return (
    <Link
      href={{ pathname: basePath, query: { ...params, page: next } }}
      className="mt-4 inline-flex h-10 items-center rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white"
    >
      Show older
    </Link>
  );
}
