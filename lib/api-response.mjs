export async function readApiResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim()
      ? data.error
      : response.status >= 500
        ? "The app couldn’t complete this request. Try again in a moment."
        : "This request couldn’t be completed. Refresh the page and try again.";
    throw new Error(message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The app returned an incomplete response. Refresh the page and try again.");
  }
  return data;
}
