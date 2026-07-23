export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-white/5" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-[3/4.25] animate-pulse rounded-xl bg-white/5" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
