// 의존성 없음 - Netlify Blobs HTTP API를 직접 호출
const STORE = "growth-app";
const KEY = "family-data";

const getBlobContext = () => {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext;
  if (!raw) throw new Error("NETLIFY_BLOBS_CONTEXT not set");
  const json = Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(json);
};

const buildBlobURL = (ctx, useUncached = true) => {
  // 강한 일관성을 위해 uncachedEdgeURL 사용
  const base = useUncached && ctx.uncachedEdgeURL ? ctx.uncachedEdgeURL : ctx.edgeURL;
  if (!base) throw new Error("No edge URL available");
  return `${base}/${ctx.siteID}/${STORE}/${KEY}`;
};

export default async (req) => {
  try {
    const ctx = getBlobContext();
    const blobURL = buildBlobURL(ctx, true);
    const authHeader = { authorization: `Bearer ${ctx.token}` };

    if (req.method === "GET") {
      const res = await fetch(blobURL, { headers: authHeader });
      if (res.status === 404) {
        return new Response("{}", {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `Blob GET failed: ${res.status}`, details: text }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      const data = await res.text();
      return new Response(data, {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.json();
      const payload = { data: body, updatedAt: Date.now() };
      const res = await fetch(blobURL, {
        method: "PUT",
        headers: {
          ...authHeader,
          "content-type": "application/json",
          "cache-control": "max-age=0, stale-while-revalidate=60",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `Blob PUT failed: ${res.status}`, details: text }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ ok: true, savedAt: payload.updatedAt }),
        { headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message, stack: e.stack }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/sync",
};
