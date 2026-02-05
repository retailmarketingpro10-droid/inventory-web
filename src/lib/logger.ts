const isDev = import.meta.env.DEV;

export const logger = {
  error(message: string, error?: unknown) {
    if (isDev) {
      console.error(message, error ?? "");
    }
  },
  warn(message: string, data?: unknown) {
    if (isDev) {
      console.warn(message, data ?? "");
    }
  },
};
