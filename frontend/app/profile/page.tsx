export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Profile</h1>

      <div className="glass-card mt-6 flex items-center gap-4 p-6">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-700" />
        <div>
          {/* TODO: pull from GET /api/v1/auth/me once the session/cookie flow is wired up */}
          <p className="font-display text-lg font-semibold">Sign in to view your profile</p>
          <p className="text-sm text-mist">Google login or email/password.</p>
        </div>
      </div>

      <div className="glass-card mt-6 p-6">
        <h2 className="font-display font-semibold">Notifications</h2>
        <div className="mt-4 space-y-3 text-sm">
          {["New episode of a watching-list title airs", "Weekly seasonal digest", "Recommendation updates"].map((label) => (
            <label key={label} className="flex items-center justify-between">
              <span className="text-mist">{label}</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary-600" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
