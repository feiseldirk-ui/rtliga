import { DEFAULT_LEFT_LOGO, DEFAULT_RIGHT_LOGO } from "../assets/defaultPdfLogos";

const STORAGE_KEY = "rtliga_settings_v4";

export const DEFAULT_SETTINGS = {
  activeSeason: new Date().getFullYear(),
  seasonLabel: "RTLiga Verwaltung",
  pdfLeagueTitle: "Deutsche Online-Liga Lfd. Scheibe",
  roundTitle: "Ergebnisse Runde",
  overallTitle: "Gesamtwertung",
  subtitle: "Beste 6 Ergebnisse",
  overallHeaderText: "Gesamtwertung\nBeste 6 Ergebnisse",
  roundSubtitle: "Online-Liga Laufende Scheibe",
  footerText: "Erstellt am {date}",
  leftLogo: DEFAULT_LEFT_LOGO,
  rightLogo: DEFAULT_RIGHT_LOGO,
  leftLogoPath: "",
  rightLogoPath: "",
  logoLeftWidth: 42,
  logoRightWidth: 26,
  pdfFontSize: 9,
  pdfMargin: 12,
  qualificationPlaces: 7,
  qualificationText: "Die Plätze 1–7 qualifizieren sich für die Endrunde.",
  freeText1: "",
  freeText1Size: 9,
  freeText1FontFamily: "Arial",
  freeText1FontWeight: "normal",
  freeText2: "",
  freeText2Size: 9,
  freeText2FontFamily: "Arial",
  freeText2FontWeight: "normal",
  overallHeaderFontFamily: "Arial",
  overallHeaderFontSize: 18,
  overallHeaderFontWeight: "bold",
  overallHeaderTextAlign: "center",
  roundHeaderTextAlign: "center",
  pdfLeagueTitleAlign: "center",
  seasonTextAlign: "center",
  editorElementsOverall: [],
  editorElementsRound: [],

  overallLogoLeftX: 16,
  overallLogoLeftY: 12,
  overallLogoRightX: 165,
  overallLogoRightY: 10,
  overallFreeText1X: 50,
  overallFreeText1Y: 18,
  overallFreeText2X: 50,
  overallFreeText2Y: 26,

  roundLogoLeftX: 16,
  roundLogoLeftY: 12,
  roundLogoRightX: 165,
  roundLogoRightY: 10,
  roundFreeText1X: 50,
  roundFreeText1Y: 18,
  roundFreeText2X: 50,
  roundFreeText2Y: 26,
};

function migrateLegacySettings(parsed) {
  const migrated = { ...parsed };
  const copyIfMissing = (targetKey, sourceKey, fallback) => {
    if (migrated[targetKey] == null) migrated[targetKey] = migrated[sourceKey] ?? fallback;
  };

  copyIfMissing("overallLogoLeftX", "logoLeftX", DEFAULT_SETTINGS.overallLogoLeftX);
  copyIfMissing("overallLogoLeftY", "logoLeftY", DEFAULT_SETTINGS.overallLogoLeftY);
  copyIfMissing("overallLogoRightX", "logoRightX", DEFAULT_SETTINGS.overallLogoRightX);
  copyIfMissing("overallLogoRightY", "logoRightY", DEFAULT_SETTINGS.overallLogoRightY);
  copyIfMissing("roundLogoLeftX", "logoLeftX", DEFAULT_SETTINGS.roundLogoLeftX);
  copyIfMissing("roundLogoLeftY", "logoLeftY", DEFAULT_SETTINGS.roundLogoLeftY);
  copyIfMissing("roundLogoRightX", "logoRightX", DEFAULT_SETTINGS.roundLogoRightX);
  copyIfMissing("roundLogoRightY", "logoRightY", DEFAULT_SETTINGS.roundLogoRightY);

  copyIfMissing("overallFreeText1X", "freeText1X", DEFAULT_SETTINGS.overallFreeText1X);
  copyIfMissing("overallFreeText1Y", "freeText1Y", DEFAULT_SETTINGS.overallFreeText1Y);
  copyIfMissing("overallFreeText2X", "freeText2X", DEFAULT_SETTINGS.overallFreeText2X);
  copyIfMissing("overallFreeText2Y", "freeText2Y", DEFAULT_SETTINGS.overallFreeText2Y);
  copyIfMissing("roundFreeText1X", "freeText1X", DEFAULT_SETTINGS.roundFreeText1X);
  copyIfMissing("roundFreeText1Y", "freeText1Y", DEFAULT_SETTINGS.roundFreeText1Y);
  copyIfMissing("roundFreeText2X", "freeText2X", DEFAULT_SETTINGS.roundFreeText2X);
  copyIfMissing("roundFreeText2Y", "freeText2Y", DEFAULT_SETTINGS.roundFreeText2Y);

  if (migrated.overallHeaderText == null) {
    const title = migrated.overallTitle ?? DEFAULT_SETTINGS.overallTitle;
    const subtitle = migrated.subtitle ?? DEFAULT_SETTINGS.subtitle;
    migrated.overallHeaderText = subtitle ? `${title}\n${subtitle}` : title;
  }

  return migrated;
}

export function loadSeasonSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem("rtliga_settings_v3") ||
      window.localStorage.getItem("rtliga_settings_v2");
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = migrateLegacySettings(JSON.parse(raw));
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSeasonSettings(nextSettings) {
  if (typeof window === "undefined") return nextSettings;
  const merged = { ...DEFAULT_SETTINGS, ...nextSettings };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent("rtliga-settings-updated", { detail: merged }));
  return merged;
}

export function useIsNewSeasonAllowed() {
  const today = new Date();
  return today.getMonth() === 0 && today.getDate() >= 1;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



const SETTINGS_TABLE = "pdf_layout_settings";
const SETTINGS_ROW_KEY = "global";
const STORAGE_BUCKET = "pdf-assets";

function buildStoragePath(season, side, fileName = "") {
  const extension = (fileName.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `logos/${season}_${side}.${extension}`;
}

async function resolveLogoUrls(settings, supabase) {
  const resolved = { ...settings };
  if (resolved.leftLogoPath) {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(resolved.leftLogoPath);
    if (data?.publicUrl) resolved.leftLogo = data.publicUrl;
  }
  if (resolved.rightLogoPath) {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(resolved.rightLogoPath);
    if (data?.publicUrl) resolved.rightLogo = data.publicUrl;
  }
  return resolved;
}

function resolveSeasonValue(settingsLike) {
  const raw = settingsLike?.activeSeason ?? DEFAULT_SETTINGS.activeSeason;
  return String(raw);
}

async function getSupabaseModule() {
  const module = await import("./supabase/client");
  return module.default;
}

async function hasActiveSession() {
  try {
    const supabase = await getSupabaseModule();
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return !!data?.session;
  } catch {
    return false;
  }
}

export async function loadSeasonSettingsFromSupabase(settingsLike = loadSeasonSettings()) {
  const sessionExists = await hasActiveSession();
  if (!sessionExists) return null;

  try {
    const supabase = await getSupabaseModule();
    const season = resolveSeasonValue(settingsLike);
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select("settings_json")
      .eq("season", season)
      .eq("layout_key", SETTINGS_ROW_KEY)
      .maybeSingle();

    if (error || !data?.settings_json || typeof data.settings_json !== "object") {
      return null;
    }

    const merged = await resolveLogoUrls({ ...DEFAULT_SETTINGS, ...migrateLegacySettings(data.settings_json) }, supabase);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("rtliga-settings-updated", { detail: merged }));
    }
    return merged;
  } catch {
    return null;
  }
}

export async function saveSeasonSettingsToSupabase(nextSettings) {
  const sessionExists = await hasActiveSession();
  if (!sessionExists) return { ok: false, reason: "no-session" };

  try {
    const supabase = await getSupabaseModule();
    const merged = { ...DEFAULT_SETTINGS, ...nextSettings };
    const season = resolveSeasonValue(merged);
    const { leftLogo, rightLogo, ...settingsPayload } = merged;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from(SETTINGS_TABLE).upsert(
      {
        season,
        layout_key: SETTINGS_ROW_KEY,
        settings_json: settingsPayload,
        updated_by: userData?.user?.id ?? null,
      },
      { onConflict: "season,layout_key" }
    );

    if (error) {
      return { ok: false, reason: "db-error", error };
    }

    return { ok: true, scope: "supabase", season };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}


export async function uploadPdfLogoToSupabase({ file, season, side }) {
  const sessionExists = await hasActiveSession();
  if (!sessionExists) return { ok: false, reason: "no-session" };

  try {
    const supabase = await getSupabaseModule();
    const filePath = buildStoragePath(resolveSeasonValue({ activeSeason: season }), side, file?.name || "logo.png");
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true, contentType: file?.type || undefined });

    if (uploadError) {
      return { ok: false, reason: "upload-error", error: uploadError };
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return { ok: true, path: filePath, publicUrl: data?.publicUrl || "" };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}
