import type { Plugin, Connect } from "vite";

const PAYU_CALLBACK_PATHS = new Set([
  "/payment-success",
  "/payment-failure",
  "/api/payu-success",
  "/api/payu-failure",
]);

const REDIRECT_TARGETS: Record<string, string> = {
  "/api/payu-success": "/payment-success",
  "/api/payu-failure": "/payment-failure",
};

function payuPostRedirectMiddleware(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  next: Connect.NextFunction
) {
  const [pathname] = (req.url ?? "").split("?");
  if (req.method !== "POST" || !PAYU_CALLBACK_PATHS.has(pathname)) {
    return next();
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const target = REDIRECT_TARGETS[pathname] ?? pathname;
    const location = body ? `${target}?${body}` : target;
    res.statusCode = 303;
    res.setHeader("Location", location);
    res.end();
  });
}

export function payuPostRedirectPlugin(): Plugin {
  return {
    name: "payu-post-redirect",
    configureServer(server) {
      server.middlewares.use(payuPostRedirectMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(payuPostRedirectMiddleware);
    },
  };
}
