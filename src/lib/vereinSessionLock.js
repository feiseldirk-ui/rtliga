import supabase from "./supabase/client";
import { createClubLogin, createClubSessionApi } from "./clubSessionCore";

export const clubSessionApi = createClubSessionApi(supabase);
export const loginClub = createClubLogin(supabase, clubSessionApi);

export function notifyClubSessionFailure(error) {
  if (["PT401", "PT403"].includes(error?.code)) {
    window.dispatchEvent(new Event("rtliga-club-session-ended"));
  }
}
