import assert from "node:assert/strict";
import test from "node:test";
import { readApiResponse } from "../lib/api-response.mjs";

test("empty or HTML errors display a retry message instead of a JSON exception", async () => {
  for (const body of [null, "<html>Proxy error</html>"]) {
    const response = new Response(body, { status: 502 });
    await assert.rejects(readApiResponse(response), /Try again in a moment/);
  }
});

test("meaningful API errors are preserved", async () => {
  const response = Response.json({ error: "This link has expired." }, { status: 400 });
  await assert.rejects(readApiResponse(response), /This link has expired/);
});

test("an empty success response never marks the request as completed", async () => {
  await assert.rejects(readApiResponse(new Response(null, { status: 200 })), /incomplete response/);
  assert.deepEqual(await readApiResponse(Response.json({ ok: true })), { ok: true });
});
