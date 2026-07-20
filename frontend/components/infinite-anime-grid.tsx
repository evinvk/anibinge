let detail;
  try {
    const res = await api.detail(malId);
    detail = res.data;
  } catch (err) {
    // Only show "not found" when the backend genuinely reports the anime
    // doesn't exist (404). Anything else — a Jikan timeout, a 5xx, a cold
    // Render backend waking up — is temporary, so show a retry message
    // instead of incorrectly telling the user this anime doesn't exist.
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-primary-400" />
        <h1 className="mt-4 font-display text-xl font-bold">Temporarily unavailable</h1>
        <p className="mt-2 text-sm text-mist">
          We couldn't load this anime right now — this is usually a brief hiccup with the
          upstream data source. Please refresh the page in a moment.
        </p>
      </div>
    );
  }
