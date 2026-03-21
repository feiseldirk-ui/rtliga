import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import VereinLogin from "./features/auth/components/VereinLogin";
import VereinRegistrierung from "./features/auth/components/VereinRegistrierung";
import PasswortVergessen from "./features/auth/pages/PasswortVergessen";
import PasswortZuruecksetzen from "./features/auth/pages/PasswortZuruecksetzen";
import AdminsTab from "./features/admin/components/AdminsTab";
import VereinStart from "./features/verein/components/VereinStart";
import { logError } from "./lib/logger";
import {
  clearVereinSession,
  readVereinSession,
  writeVereinSession,
} from "./lib/storage/vereinSession";
import supabase from "./lib/supabase/client";

const ADMIN_LOGOUT_REDIRECT_KEY = "rtliga_admin_logout_redirect";
const ADMIN_ACCESS_FLAG_KEY = "rtliga_admin_access_verified";

function Auswahlseite() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(ADMIN_LOGOUT_REDIRECT_KEY);
      window.sessionStorage.removeItem(ADMIN_ACCESS_FLAG_KEY);
    } catch {
      // noop
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 animate-fade-in">
        <h1 className="mb-2 text-center text-2xl font-extrabold text-zinc-900">
          RTLiga Verwaltung
        </h1>

        <p className="mb-6 text-center text-sm text-zinc-600">
          Bitte wählen Sie Ihren Bereich.
        </p>

        <div className="flex flex-col gap-3">
          <button
            className="btn-action w-full"
            onClick={() => navigate("/login")}
          >
            Vereinslogin
          </button>

          <button
            className="btn-action w-full"
            onClick={() => navigate("/registrieren")}
          >
            Verein registrieren
          </button>

          <button
            className="btn-action w-full"
            onClick={() => navigate("/admin")}
          >
            Adminbereich
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminRoute() {
  try {
    if (window.sessionStorage.getItem(ADMIN_LOGOUT_REDIRECT_KEY) === "1") {
      return <Navigate to="/" replace />;
    }
  } catch {
    // noop
  }

  return <AdminsTab />;
}

export default function App() {
  const [verein, setVerein] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const parsed = readVereinSession();

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (!data?.session) {
          clearVereinSession();
          if (mounted) {
            setVerein(null);
          }
          return;
        }

        if (parsed?.id && mounted) {
          setVerein(parsed);
        }
      } catch {
        logError("Vereinssitzung konnte nicht geladen werden.");
        clearVereinSession();
        if (mounted) {
          setVerein(null);
        }
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearVereinSession();
        if (mounted) {
          setVerein(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLoginErfolg = (vereinObj) => {
    if (!vereinObj?.id || !vereinObj?.vereinsname) return;

    const safeVerein = {
      id: vereinObj.id,
      vereinsname: vereinObj.vereinsname,
    };

    setVerein(safeVerein);
    writeVereinSession(safeVerein);
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-sm p-6 text-center animate-fade-in">
          <div className="text-sm font-medium text-zinc-600">
            Anwendung wird geladen…
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Auswahlseite />} />
      <Route
        path="/login"
        element={<VereinLogin onLoginErfolg={handleLoginErfolg} />}
      />
      <Route path="/registrieren" element={<VereinRegistrierung />} />
      <Route path="/passwort-vergessen" element={<PasswortVergessen />} />
      <Route path="/passwort-aendern" element={<PasswortZuruecksetzen />} />
      <Route
        path="/verein"
        element={
          verein ? (
            <VereinStart verein={verein} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}