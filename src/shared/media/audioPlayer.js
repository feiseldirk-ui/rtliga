let audioElement = null;
let currentSrc = "";
let currentItemId = null;
let playPromise = null;
const listeners = new Set();

function emit() {
  const state = getAudioState();
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // noop
    }
  });
}

function ensureAudio() {
  if (typeof window === "undefined") return null;
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = "metadata";
    audioElement.addEventListener("play", emit);
    audioElement.addEventListener("pause", emit);
    audioElement.addEventListener("ended", () => {
      currentItemId = null;
      currentSrc = "";
      emit();
    });
  }
  return audioElement;
}

export function subscribeAudioState(listener) {
  listeners.add(listener);
  listener(getAudioState());
  return () => listeners.delete(listener);
}

export function getAudioState() {
  const audio = audioElement;
  return {
    isPlaying: !!audio && !audio.paused && !audio.ended,
    currentSrc,
    currentItemId,
  };
}

export async function toggleGlobalAudio({ itemId, src }) {
  const audio = ensureAudio();
  if (!audio || !src) return false;

  if (currentItemId === itemId && !audio.paused) {
    audio.pause();
    emit();
    return false;
  }

  if (currentSrc !== src) {
    currentSrc = src;
    currentItemId = itemId;
    audio.src = src;
  } else {
    currentItemId = itemId;
  }

  try {
    playPromise = audio.play();
    await playPromise;
  } catch {
    // noop
  } finally {
    playPromise = null;
    emit();
  }

  return !audio.paused;
}

export function stopGlobalAudio() {
  if (!audioElement) return;
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
  audioElement.pause();
  audioElement.currentTime = 0;
  currentSrc = "";
  currentItemId = null;
  emit();
}
