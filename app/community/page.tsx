"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { counties } from "@/lib/profile-options";
import { eventCategories } from "@/lib/community-events";

type Listing = { id: string; title: string; category: string; county: string; venue: string; startsAt: string; url: string };
const eventDate = new Intl.DateTimeFormat("en-IE", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Dublin" });

export default function CommunityEvents() {
  const [events, setEvents] = useState<Listing[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [county, setCounty] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/community-events", { signal, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in with a verified email to see community events." : "Events couldn’t be loaded.");
    const data = await response.json();
    setEvents(data.events);
    setCanManage(data.canManage);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause: Error) => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [load]);

  async function change(method: "POST" | "DELETE", body?: Record<string, unknown>, id?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(id ? "/api/community-events?id=" + encodeURIComponent(id) : "/api/community-events", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The event could not be updated.");
      }
      setNotice(method === "POST" ? "Event published." : "Event removed.");
      await load().catch(() => setError("The board could not be refreshed. Reload this page to see the change."));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The event could not be updated.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const startsAt = new Date(String(fields.startsAt));
    if (!Number.isFinite(startsAt.valueOf())) {
      setError("Enter a valid start date and time.");
      return;
    }
    if (await change("POST", { ...fields, startsAt: startsAt.toISOString() })) form.reset();
  }

  const visible = events?.filter((event) => !county || event.county === county);
  return <main className="site-shell">
    <Link href="/app" className="text-button">Back to AfroIE Meet</Link>
    <section className="dashboard">
      <div className="dashboard-head"><div><h1 className="serif">Community events</h1><p>Find Afrobeats nights, brunches, faith gatherings and other ways to meet in Ireland.</p></div></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <p role="status">{notice}</p>
      {events && <div className="field"><label htmlFor="event-filter">Filter by county</label><select id="event-filter" value={county} onChange={(event) => setCounty(event.target.value)}><option value="">All counties</option>{counties.map((item) => <option key={item}>{item}</option>)}</select></div>}
      {!events && !error && <p role="status">Loading events…</p>}
      {visible?.length === 0 && <p className="empty-state">No upcoming events {county ? "in County " + county : "are listed yet"}.</p>}
      <div className="cards-list">{visible?.map((event) => <article key={event.id} className="data-card">
        <h2 className="serif">{event.title}</h2>
        <p>{event.category} · {event.venue}, Co. {event.county}</p>
        <p><time dateTime={event.startsAt}>{eventDate.format(new Date(event.startsAt))}</time></p>
        <a href={event.url} rel="noreferrer">View organiser details</a>
        {canManage && <button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm("Remove this event from the board?")) void change("DELETE", undefined, event.id); }}>Remove event</button>}
      </article>)}</div>
      {canManage && <form onSubmit={publish} className="data-card">
        <h2 className="serif">Publish a community event</h2>
        <div className="field"><label htmlFor="event-title">Event name</label><input id="event-title" name="title" minLength={3} maxLength={120} required /></div>
        <div className="field"><label htmlFor="event-category">Category</label><select id="event-category" name="category">{eventCategories.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label htmlFor="event-county">County</label><select id="event-county" name="county" required><option value="">Select a county</option>{counties.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label htmlFor="event-venue">Venue or broad area</label><input id="event-venue" name="venue" minLength={2} maxLength={120} required /></div>
        <div className="field"><label htmlFor="event-start">Starts at (your device’s time zone)</label><input id="event-start" name="startsAt" type="datetime-local" required /></div>
        <div className="field"><label htmlFor="event-link">Organiser’s HTTPS link</label><input id="event-link" name="url" type="url" maxLength={500} required /></div>
        <button className="button button-primary" disabled={busy}>Publish event</button>
      </form>}
    </section>
  </main>;
}
