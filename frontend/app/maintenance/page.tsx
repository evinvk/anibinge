import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-void px-4">
      <div className="glass-card max-w-md p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          <Wrench className="h-8 w-8 text-accent" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-paper">
          Under Maintenance
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          We&apos;re making some improvements to bring you a better experience.
          This should only take a few minutes. Please check back shortly.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="live-dot h-2 w-2" />
          <span className="text-xs text-mist">In progress</span>
        </div>
      </div>
    </div>
  );
}
