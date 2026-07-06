// Owner login for the Autopilot dashboard. Middleware sends everything
// under /admin here until the cs-admin cookie is set.

export const dynamic = 'force-dynamic'

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        method="POST"
        action="/api/admin/login"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8"
      >
        <h1 className="font-grotesk text-xl font-bold text-text">Autopilot admin</h1>
        <p className="mt-2 text-sm text-muted">Owner access only.</p>
        {searchParams.error && (
          <p className="mt-3 text-sm text-danger">Wrong token.</p>
        )}
        <input
          type="password"
          name="token"
          placeholder="Admin token"
          autoComplete="off"
          className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-background"
        >
          Enter
        </button>
      </form>
    </main>
  )
}
