export function logDev(message, meta) {
  if (import.meta.env.DEV) {
    if (meta === undefined) {
      console.debug(message);
    } else {
      console.debug(message, meta);
    }
  }
}

export function logError(message) {
  if (import.meta.env.DEV) {
    console.error(message);
  }
}
