function buildQuery(body) {
  const params = new URLSearchParams();
  if (!body || typeof body !== "object") {
    return "";
  }
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    params.set(key, Array.isArray(value) ? value[0] : String(value));
  }
  return params.toString();
}

export default function handler(req, res) {
  if (req.method === "POST") {
    const query = buildQuery(req.body);
    const location = query ? `/payment-failure?${query}` : "/payment-failure";
    res.writeHead(303, { Location: location });
    res.end();
    return;
  }

  res.writeHead(302, { Location: "/payment-failure" });
  res.end();
}
