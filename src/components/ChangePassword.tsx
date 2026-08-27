"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const inputCls = "w-full rounded-md px-3 py-2 text-sm";

export default function ChangePassword() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSave() {
    setError(null);
    setDone(false);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setDone(true);
      setPassword("");
      setConfirm("");
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Change password</h2>
      <p className="mt-1 text-xs text-muted">
        Set a new password, then save it in your password manager.
      </p>
      <div className="mt-4 space-y-3">
        <input
          type="password"
          name="new-password"
          autoComplete="new-password"
          placeholder="New password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
        <input
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        {done && <p className="text-sm text-accent">Password updated. Save it in your password manager now.</p>}
        <button
          onClick={handleSave}
          disabled={saving || !password || !confirm}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
