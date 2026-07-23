export default function WatchLoading() {
  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="mb-4 h-4 w-16 animate-pulse rounded bg-surface-hi" />
        <div className="mb-4 h-8 w-64 animate-pulse rounded bg-surface-hi" />
        <div className="aspect-video w-full animate-pulse rounded-xl2 bg-surface-hi" />
      </div>
    </div>
  );
}
