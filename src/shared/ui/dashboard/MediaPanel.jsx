import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import {
  MEDIA_BUCKET,
  MEDIA_ITEMS,
  MEDIA_SIGNED_URL_TTL,
} from "../../media/mediaAssets";
import { subscribeAudioState, toggleGlobalAudio } from "../../media/audioPlayer";

function CompactMediaCard({ item, signedUrl, onDownload, downloadingId, unavailableReason, onOpen, active = false, audioPlaying = false, onToggleAudio }) {
  const isDownloading = downloadingId === item.id;
  const isAudio = item.type === "audio";
  const cardRef = useRef(null);

  const handleOpen = () => {
    if (isAudio) return;
    const rect = cardRef.current?.getBoundingClientRect?.() || null;
    onOpen(item, rect);
  };

  return (
    <div
      ref={cardRef}
      className={`group mt-4 flex h-[168px] w-[148px] flex-col overflow-hidden rounded-[26px] border bg-white/96 p-3 shadow-[0_1px_2px_rgba(16,24,40,0.06)] backdrop-blur transition-all duration-200 ${
        active
          ? "border-indigo-300 shadow-[0_12px_24px_rgba(99,102,241,0.12)]"
          : "border-zinc-200/80 hover:z-20 hover:shadow-[0_12px_24px_rgba(16,24,40,0.12)]"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-600">
            {isAudio ? "Audio" : "Video"}
          </p>
          <h4 className="mt-1 line-clamp-2 text-[12px] font-semibold leading-tight text-zinc-900">{item.title}</h4>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
          Privat
        </span>
      </div>

      {signedUrl ? (
        isAudio ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] border border-zinc-200 bg-zinc-50/90 px-3 py-4">
            <button
              type="button"
              onClick={() => onToggleAudio?.(item, signedUrl)}
              className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold transition ${
                audioPlaying
                  ? "border-indigo-300 bg-indigo-600 text-white shadow-[0_12px_26px_rgba(99,102,241,0.22)]"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100"
              }`}
              aria-label={audioPlaying ? "Audio pausieren" : "Audio abspielen"}
            >
              {audioPlaying ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => onDownload(item)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-100"
              disabled={!signedUrl || isDownloading}
              aria-label="MP3 herunterladen"
            >
              {isDownloading ? "Lädt…" : "Download"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="relative flex h-[64px] w-full items-center justify-center overflow-hidden rounded-[20px] border border-zinc-200 bg-black/95"
          >
            <video
              playsInline
              preload="metadata"
              muted
              className="pointer-events-none h-full w-full object-contain opacity-90"
            >
              <source src={signedUrl} type="video/mp4" />
            </video>
            <span className="absolute inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow">▶</span>
          </button>
        )
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50 px-2 text-center text-[10px] text-zinc-500">
          {unavailableReason || "Medium aktuell nicht verfügbar."}
        </div>
      )}

      {!isAudio ? (
        <div className="mt-auto flex items-center gap-2 pt-3">
          <button
            type="button"
            onClick={handleOpen}
            className="min-w-0 flex-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
            disabled={!signedUrl}
          >
            Öffnen
          </button>
          <button type="button" onClick={() => onDownload(item)} className="btn-mini !px-2.5 !py-1.5 !text-[10px]" disabled={!signedUrl || isDownloading}>
            {isDownloading ? "…" : "↓"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MediaRegularCard({ item, signedUrl, onDownload, downloadingId, unavailableReason }) {
  const isDownloading = downloadingId === item.id;

  return (
    <div className="h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">
              {item.type === "audio" ? "Audio" : "Video"}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-900">{item.title}</h3>
            <p className="mt-1 text-sm text-zinc-600">{item.description}</p>
          </div>

          <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-600">
            Private Datei
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {signedUrl ? (
          item.type === "audio" ? (
            <audio controls preload="metadata" className="w-full rounded-2xl border border-zinc-200 bg-zinc-50">
              <source src={signedUrl} type="audio/mpeg" />
              Dein Browser unterstützt dieses Audioformat nicht.
            </audio>
          ) : (
            <video controls playsInline preload="metadata" className="w-full rounded-2xl border border-zinc-200 bg-black/95">
              <source src={signedUrl} type="video/mp4" />
              Dein Browser unterstützt dieses Videoformat nicht.
            </video>
          )
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            {unavailableReason || "Medium aktuell nicht verfügbar."}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDownload(item)}
            className="btn btn-secondary"
            disabled={!signedUrl || isDownloading}
          >
            {isDownloading
              ? "Lädt herunter…"
              : item.type === "audio"
              ? "Download MP3"
              : "Download MP4"}
          </button>

          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
            {item.filename}
          </span>
        </div>
      </div>
    </div>
  );
}


function FloatingMediaPanel({ item, signedUrl, downloading, onDownload, onClose, anchorRect, unavailableReason }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ top: 96, left: 24 });

  useEffect(() => {
    if (!item || !anchorRect) return;

    const place = () => {
      const panelWidth = panelRef.current?.offsetWidth || (item?.type === "video" ? 340 : 320);
      const panelHeight = panelRef.current?.offsetHeight || (item?.type === "video" ? 240 : 180);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = 10;
      const margin = 12;
      const safeTop = 88;

      const roomRight = viewportWidth - anchorRect.right - margin;
      const roomLeft = anchorRect.left - margin;
      const roomBelow = viewportHeight - anchorRect.bottom - margin;

      let left = anchorRect.right + gap;
      let top = Math.max(safeTop, anchorRect.top);

      if (roomRight >= panelWidth) {
        left = anchorRect.right + gap;
        top = Math.max(safeTop, Math.min(anchorRect.top - 4, viewportHeight - panelHeight - margin));
      } else if (roomLeft >= panelWidth) {
        left = anchorRect.left - panelWidth - gap;
        top = Math.max(safeTop, Math.min(anchorRect.top - 4, viewportHeight - panelHeight - margin));
      } else if (roomBelow >= panelHeight + gap) {
        left = Math.min(Math.max(margin, anchorRect.left), viewportWidth - panelWidth - margin);
        top = anchorRect.bottom + gap;
      } else {
        left = Math.min(
          Math.max(margin, anchorRect.left + (anchorRect.width / 2) - (panelWidth / 2)),
          viewportWidth - panelWidth - margin,
        );
        top = Math.max(safeTop, viewportHeight - panelHeight - margin);
      }

      if (top + panelHeight > viewportHeight - margin) {
        top = viewportHeight - panelHeight - margin;
      }
      if (top < safeTop) top = safeTop;

      setPosition({ top, left });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [item, anchorRect]);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target)) return;
      onClose?.();
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!item) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[90] w-[min(340px,calc(100vw-24px))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-[0_18px_46px_rgba(15,23,42,0.18)]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600">{item.type === "audio" ? "Audio" : "Video"}</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-900">{item.title}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">Schließen</button>
      </div>
      {signedUrl ? (
        item.type === "audio" ? (
          <audio controls preload="metadata" controlsList="nodownload" className="w-full rounded-2xl border border-zinc-200 bg-zinc-50">
            <source src={signedUrl} type="audio/mpeg" />
          </audio>
        ) : (
          <video controls playsInline preload="metadata" className="max-h-[28vh] w-full rounded-2xl border border-zinc-200 bg-black/95 object-contain">
            <source src={signedUrl} type="video/mp4" />
          </video>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
          {unavailableReason}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => onDownload(item)} className="btn btn-secondary" disabled={!signedUrl || downloading}>
          {downloading ? "Lädt…" : item.type === "audio" ? "Download MP3" : "Download MP4"}
        </button>
      </div>
    </div>
  );
}

export default function MediaPanel({
  areaLabel = "Medien",
  title = "Audio & Video",
  subtitle = "Private Medien aus Supabase Storage mit Player und Download.",
  compact = false,
  showIntro = true,
  filterType = null,
}) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [signedUrls, setSignedUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  const [audioState, setAudioState] = useState({ isPlaying: false, currentItemId: null });

  const visibleItems = useMemo(() => {
    if (!filterType) return MEDIA_ITEMS;
    return MEDIA_ITEMS.filter((item) => item.type === filterType);
  }, [filterType]);

  const unavailableReason = useMemo(() => {
    if (!sessionChecked) return "Prüfe Zugriff…";
    if (!hasSession) return "Private Medien benötigen eine aktive Supabase-Session.";
    if (loading) return "Medien werden geladen…";
    if (error) return error;
    return "Medium aktuell nicht verfügbar.";
  }, [sessionChecked, hasSession, loading, error]);

  useEffect(() => {
    const unsubscribe = subscribeAudioState(setAudioState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadMedia = async () => {
      setLoading(true);
      setError("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        logError("Mediensitzung konnte nicht geprüft werden.");
      }

      const sessionExists = !!session;
      setHasSession(sessionExists);
      setSessionChecked(true);

      if (!sessionExists) {
        setLoading(false);
        return;
      }

      const { data, error: signedError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrls(
          MEDIA_ITEMS.map((item) => item.path),
          MEDIA_SIGNED_URL_TTL
        );

      if (signedError) {
        logError("Media-URLs konnten nicht erstellt werden.");
        setError("Signed URLs konnten nicht erzeugt werden.");
        setLoading(false);
        return;
      }

      const urlMap = {};
      (data || []).forEach((entry) => {
        if (entry?.path && entry?.signedUrl) {
          urlMap[entry.path] = entry.signedUrl;
        }
      });

      setSignedUrls(urlMap);
      setLoading(false);
    };

    loadMedia();
  }, []);

  const handleToggleAudio = async (item, signedUrl) => {
    await toggleGlobalAudio({ itemId: item.id, src: signedUrl });
  };

  const handleDownload = async (item) => {
    if (!hasSession) {
      setError("Download nur mit aktiver Supabase-Session möglich.");
      return;
    }

    setDownloadingId(item.id);
    setError("");

    try {
      const { data, error: downloadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .download(item.path);

      if (downloadError || !data) {
        throw downloadError || new Error("Download fehlgeschlagen");
      }

      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      logError("Datei konnte nicht heruntergeladen werden.");
      setError("Download fehlgeschlagen.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (compact) {
    const activeSignedUrl = activeItem ? signedUrls[activeItem.path] || "" : "";

    return (
      <>
        <div className="flex items-center justify-center gap-3">
          {visibleItems.map((item) => {
            const signedUrl = signedUrls[item.path] || "";
            return (
              <CompactMediaCard
                key={item.id}
                item={item}
                signedUrl={signedUrl}
                onDownload={handleDownload}
                downloadingId={downloadingId}
                unavailableReason={unavailableReason}
                onOpen={(nextItem, rect) => setActiveItem({ ...nextItem, __anchorRect: rect })}
                active={activeItem?.id === item.id || (item.type === "audio" && audioState.currentItemId === item.id)}
                audioPlaying={item.type === "audio" && audioState.currentItemId === item.id && audioState.isPlaying}
                onToggleAudio={handleToggleAudio}
              />
            );
          })}
        </div>

        <FloatingMediaPanel
          item={activeItem}
          signedUrl={activeSignedUrl}
          downloading={downloadingId === activeItem?.id}
          onDownload={handleDownload}
          onClose={() => setActiveItem(null)}
          anchorRect={activeItem?.__anchorRect || null}
          unavailableReason={unavailableReason}
        />
      </>
    );
  }

  return (
    <section className="space-y-4">
      {showIntro ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
            {areaLabel}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">{subtitle}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleItems.map((item) => {
          const signedUrl = signedUrls[item.path] || "";
          return (
            <MediaRegularCard
              key={item.id}
              item={item}
              signedUrl={signedUrl}
              onDownload={handleDownload}
              downloadingId={downloadingId}
              unavailableReason={unavailableReason}
            />
          );
        })}
      </div>
    </section>
  );
}
