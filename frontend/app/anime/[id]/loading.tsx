export default function AnimeDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-72 w-full bg-surface-hi sm:h-96" />
      <div className="mx-auto -mt-32 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative -mt-4 w-40 shrink-0 overflow-hidden rounded-xl2 bg-surface-hi sm:w-56" style={{ aspectRatio: "2/3" }} />
          <div className="flex-1 pt-4 space-y-4">
            <div className="h-8 w-3/4 rounded bg-surface-hi" />
            <div className="h-4 w-1/3 rounded bg-surface-hi" />
            <div className="flex gap-4">
              <div className="h-4 w-20 rounded bg-surface-hi" />
              <div className="h-4 w-20 rounded bg-surface-hi" />
              <div className="h-4 w-20 rounded bg-surface-hi" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded-full bg-surface-hi" />
              <div className="h-6 w-16 rounded-full bg-surface-hi" />
            </div>
            <div className="h-20 w-full rounded bg-surface-hi" />
          </div>
        </div>
      </div>
    </div>
  );
}
