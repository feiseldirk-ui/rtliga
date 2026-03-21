import { useEffect } from "react";
import supabase from "./supabase/client";

function normalizeTables(tables = []) {
  return Array.from(new Set((tables || []).filter(Boolean)));
}

export function subscribeToTables({ tables = [], onChange, filter } = {}) {
  const normalizedTables = normalizeTables(tables);
  if (!normalizedTables.length || typeof onChange !== "function") {
    return () => {};
  }

  const channelName = `rtliga-watch-${normalizedTables.join("-")}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  const channel = supabase.channel(channelName);

  normalizedTables.forEach((table) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      },
      () => {
        onChange();
      }
    );
  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function useRealtimeRefresh({ tables = [], onChange, filter, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeToTables({ tables, onChange, filter });
  }, [enabled, filter, onChange, JSON.stringify(normalizeTables(tables))]);
}
