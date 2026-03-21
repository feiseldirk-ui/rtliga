import supabase from "./supabase/client";

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function mapAdminRow(row) {
  return {
    user_id: row?.user_id || "",
    email: normalizeEmail(row?.email),
    role: row?.role || "admin",
  };
}

function isMissingRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find the function") ||
    message.includes("function public.list_admins")
  );
}

export function normalizeAdminEmail(email) {
  return normalizeEmail(email);
}

export function getFriendlyAdminError(error, fallbackText) {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();

  if (!message) {
    return fallbackText;
  }

  if (
    normalized.includes("kein bestehender auth-benutzer") ||
    normalized.includes("no user found") ||
    normalized.includes("user not found")
  ) {
    return "Zu dieser E-Mail existiert noch kein Auth-Benutzer in Supabase.";
  }

  if (normalized.includes("duplicate") || normalized.includes("already exists") || normalized.includes("duplicate key")) {
    return "Diese E-Mail ist bereits als Admin eingetragen.";
  }

  if (normalized.includes("nur admins dürfen")) {
    return message;
  }

  if (normalized.includes("aktuell angemeldete admin-sitzung kann nicht entfernt werden")) {
    return "Der aktuell angemeldete Admin kann nicht entfernt werden.";
  }

  if (normalized.includes("mindestens ein admin muss erhalten bleiben")) {
    return "Mindestens ein Admin muss erhalten bleiben.";
  }

  if (normalized.includes("invalid input syntax for type uuid")) {
    return "Die Admin-ID ist ungültig.";
  }

  return message || fallbackText;
}

export async function fetchAdmins() {
  const rpcResult = await supabase.rpc("list_admins");

  if (!rpcResult.error) {
    return Array.isArray(rpcResult.data) ? rpcResult.data.map(mapAdminRow) : [];
  }

  if (!isMissingRpc(rpcResult.error)) {
    throw rpcResult.error;
  }

  const { data, error } = await supabase
    .from("admins")
    .select("user_id, email, role")
    .order("email", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(mapAdminRow) : [];
}

export async function addAdminByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase.rpc("add_admin_by_email", {
    p_email: normalizedEmail,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapAdminRow(row) : null;
}

export async function removeAdminByUserId(userId) {
  const { error } = await supabase.rpc("remove_admin", {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }
}
