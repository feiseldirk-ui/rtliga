import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { subscribeToTables } from "../../../lib/realtime";
import {
  addAdminByEmail,
  fetchAdmins,
  getFriendlyAdminError,
  normalizeAdminEmail,
  removeAdminByUserId,
} from "../../../lib/admins";

function formatSyncTime(date) {
  if (!date) return "Noch keine Synchronisierung";
  return `Letzte Synchronisierung: ${date.toLocaleTimeString("de-DE")}`;
}

export default function AdminManagementTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const loadAdmins = useCallback(async ({ keepLoading = false } = {}) => {
    if (!keepLoading) {
      setLoading(true);
    }

    try {
      const [{ data: authData }, adminRows] = await Promise.all([supabase.auth.getUser(), fetchAdmins()]);
      setCurrentUserId(authData?.user?.id || "");
      setCurrentUserEmail(normalizeAdminEmail(authData?.user?.email));
      setAdmins(adminRows);
      setErrorMessage("");
      setLastSync(new Date());
    } catch (error) {
      setErrorMessage(getFriendlyAdminError(error, "Adminliste konnte nicht geladen werden."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  useEffect(() => {
    return subscribeToTables({
      tables: ["admins"],
      onChange: () => loadAdmins({ keepLoading: true }),
    });
  }, [loadAdmins]);

  const sortedAdmins = useMemo(
    () => [...admins].sort((left, right) => left.email.localeCompare(right.email, "de", { sensitivity: "base" })),
    [admins]
  );

  const normalizedInputEmail = normalizeAdminEmail(email);
  const emailAlreadyExists = sortedAdmins.some((adminRow) => adminRow.email === normalizedInputEmail);

  const handleAddAdmin = async (event) => {
    event.preventDefault();

    if (!normalizedInputEmail) {
      setErrorMessage("Bitte eine E-Mail-Adresse eingeben.");
      return;
    }

    if (emailAlreadyExists) {
      setErrorMessage("Diese E-Mail ist bereits als Admin eingetragen.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setErrorMessage("");

    try {
      const row = await addAdminByEmail(normalizedInputEmail);
      setMessage(row ? `${row.email} wurde als Admin hinzugefügt.` : "Admin wurde hinzugefügt.");
      setEmail("");
      await loadAdmins({ keepLoading: true });
    } catch (error) {
      setErrorMessage(getFriendlyAdminError(error, "Admin konnte nicht hinzugefügt werden."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAdmin = async (adminRow) => {
    if (!adminRow?.user_id) return;

    const confirmed = window.confirm(
      `Admin wirklich entfernen?\n\n${adminRow.email}\n\nDer Auth-Benutzer bleibt bestehen. Es wird nur der Eintrag aus public.admins entfernt.`
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setMessage("");
    setErrorMessage("");

    try {
      await removeAdminByUserId(adminRow.user_id);
      setMessage(`${adminRow.email} wurde als Admin entfernt.`);
      await loadAdmins({ keepLoading: true });
    } catch (error) {
      setErrorMessage(getFriendlyAdminError(error, "Admin konnte nicht entfernt werden."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <div>
              <h4 className="text-lg font-semibold text-zinc-900">Neuen Admin hinzufügen</h4>
              <p className="mt-1 text-sm text-zinc-600">
                Es werden nur bereits vorhandene Supabase-Auth-Benutzer freigeschaltet. Passwort-Reset und Login bleiben unverändert.
              </p>
            </div>

            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-700">E-Mail-Adresse</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input w-full"
                  autoComplete="email"
                  placeholder="bestehender-auth-user@example.de"
                  required
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Nur bestehende Auth-User können hier als Admin eingetragen werden.
                </p>
              </div>

              {normalizedInputEmail ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    emailAlreadyExists
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}
                >
                  {emailAlreadyExists
                    ? "Diese E-Mail ist bereits als Admin eingetragen."
                    : "Die E-Mail wird beim Speichern in Kleinbuchstaben abgelegt und direkt mit Supabase synchronisiert."}
                </div>
              ) : null}

              <button className="btn btn-primary" type="submit" disabled={submitting || emailAlreadyExists}>
                {submitting ? "Speichern…" : "Admin hinzufügen"}
              </button>
            </form>

            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-zinc-900">Aktive Admins</h4>
              <p className="mt-1 text-sm text-zinc-600">
                Anzeige wird direkt aus <code>public.admins</code> geladen und bei Änderungen neu synchronisiert.
              </p>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">
                  Angemeldet als: {currentUserEmail || "unbekannt"}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-600">
                  {sortedAdmins.length} Admin{sortedAdmins.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="text-sm text-zinc-500">{formatSyncTime(lastSync)}</div>
          </div>

          {loading ? (
            <div className="py-8 text-sm text-zinc-600">Adminliste wird geladen…</div>
          ) : sortedAdmins.length ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">E-Mail</th>
                      <th className="px-4 py-3 font-semibold">Rolle</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white text-zinc-800">
                    {sortedAdmins.map((adminRow) => {
                      const isCurrentUser = currentUserId && adminRow.user_id === currentUserId;
                      return (
                        <tr key={adminRow.user_id || adminRow.email}>
                          <td className="px-4 py-3 font-medium">{adminRow.email}</td>
                          <td className="px-4 py-3">{adminRow.role || "admin"}</td>
                          <td className="px-4 py-3">
                            {isCurrentUser ? (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                                Aktuelle Sitzung
                              </span>
                            ) : (
                              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">
                                Aktiv
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={submitting || isCurrentUser}
                              onClick={() => handleRemoveAdmin(adminRow)}
                              title={isCurrentUser ? "Aktuelle Admin-Sitzung kann nicht entfernt werden." : "Admin entfernen"}
                            >
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-sm text-zinc-600">Es sind aktuell keine Admins eingetragen.</div>
          )}
        </div>
      </div>
    </div>
  );
}
