"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Photo = { id?: string; url: string; altText: string; position?: number };
type Profile = {
  displayName: string;
  bio: string;
  city: string;
  relationshipIntent: "MARRIAGE" | "LONG_TERM";
  identityText: string | null;
  culturalBackground: string | null;
  traditionPrompt: string;
  futurePrompt: string;
};
type Viewer = {
  id: string;
  email: string;
  role: "MEMBER" | "MODERATOR";
  profile: Profile | null;
};
type Person = {
  id?: string;
  userId?: string;
  displayName?: string;
  age?: number;
  city?: string;
  relationshipIntent?: Profile["relationshipIntent"];
  bio?: string;
  identityText?: string | null;
  culturalBackground?: string | null;
  traditionPrompt?: string;
  futurePrompt?: string;
  photos?: Photo[];
  profile?: Profile | null;
};
type Message = { id: string; body: string; sender: { id: string }; createdAt: string };
type MatchItem = {
  id: string;
  createdAt: string;
  otherUser: Person & { id: string; profile: Profile | null };
  lastMessage: { body: string; createdAt: string } | null;
};
type Introduction = {
  id: string;
  promptKey: "traditionPrompt" | "futurePrompt";
  message: string;
  createdAt: string;
  fromUser: { id: string; age: number; profile: Profile | null; photos: Photo[] };
};
type Report = {
  id: string;
  reason: string;
  details: string;
  status: "OPEN" | "REVIEWING" | "RESOLVED";
  createdAt: string;
  reporter: { profile: { displayName: string } | null };
  subject: { profile: { displayName: string } | null };
  moderator: { profile: { displayName: string } | null } | null;
};
type Tab = "Discover" | "Introductions" | "Matches" | "My profile" | "Safety" | "Reports";

const demoAccounts = [
  { email: "amara@example.test", label: "Amara" },
  { email: "daniel@example.test", label: "Daniel" },
  { email: "moderator@example.test", label: "Moderator" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

function initials(name?: string | null) {
  return (name ?? "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function intentLabel(intent?: Profile["relationshipIntent"]) {
  return intent === "LONG_TERM" ? "Long-term relationship" : "Marriage-minded";
}

function fieldValue(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export default function AppPage() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [tab, setTab] = useState<Tab>("Discover");
  const [profiles, setProfiles] = useState<Person[]>([]);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [photosDraft, setPhotosDraft] = useState<Photo[]>([]);
  const [introTarget, setIntroTarget] = useState<Person | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<Person | null>(null);
  const [reportReason, setReportReason] = useState("HARASSMENT");
  const [reportDetails, setReportDetails] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const loadViewer = useCallback(async () => {
    const data = await api<{ user: Viewer | null; demoAvailable: boolean; inviteRequired: boolean }>("/api/auth");
    setViewer(data.user);
    setDemoAvailable(data.demoAvailable);
    setInviteRequired(data.inviteRequired);
    setProfileDraft(data.user?.profile ?? null);
    setPhotosDraft([]);
    setLoading(false);
    if (new URLSearchParams(window.location.search).get("signup") === "1") {
      setAuthMode("signup");
    }
  }, []);

  const loadTab = useCallback(async (nextTab: Tab) => {
    setError("");
    try {
      if (nextTab === "Discover") {
        const data = await api<{ profiles: Person[] }>("/api/discovery");
        setProfiles(data.profiles);
      } else if (nextTab === "Introductions") {
        const data = await api<{ introductions: Introduction[] }>("/api/introductions");
        setIntroductions(data.introductions);
      } else if (nextTab === "Matches") {
        const data = await api<{ matches: MatchItem[] }>("/api/matches");
        setMatches(data.matches);
        if (selectedMatch && !data.matches.some((match) => match.id === selectedMatch.id)) {
          setSelectedMatch(null);
          setMessages([]);
        }
      } else if (nextTab === "My profile") {
        const data = await api<{ profile: Profile; photos: Photo[] }>("/api/profile");
        setProfileDraft(data.profile);
        setPhotosDraft(data.photos);
      } else if (nextTab === "Reports") {
        const data = await api<{ reports: Report[] }>("/api/moderation");
        setReports(data.reports);
      }
      setTab(nextTab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this section.");
    }
  }, [selectedMatch]);

  useEffect(() => {
    loadViewer().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Could not load your account.");
      setLoading(false);
    });
  }, [loadViewer]);

  useEffect(() => {
    if (viewer) loadTab(tab);
    // Load the selected section after authentication; later tab changes are handled by selectTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.id]);

  const selectTab = (next: Tab) => {
    setTab(next);
    void loadTab(next);
  };

  const signInDemo = async (email: string) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "demo", email }) });
      await loadViewer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify(
          authMode === "signup"
            ? {
                action: "signup",
                email: fieldValue(form, "email"),
                password: fieldValue(form, "password"),
                displayName: fieldValue(form, "displayName"),
                dateOfBirth: fieldValue(form, "dateOfBirth"),
                invitationCode: fieldValue(form, "invitationCode"),
                ageConfirmed: form.get("ageConfirmed") === "on",
              }
            : {
                action: "login",
                email: fieldValue(form, "email"),
                password: fieldValue(form, "password"),
              },
        ),
      });
      await loadViewer();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    setViewer(null);
    setSelectedMatch(null);
    setMessages([]);
  };

  const submitIntroduction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!introTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/discovery", {
        method: "POST",
        body: JSON.stringify({
          toUserId: introTarget.userId,
          promptKey: fieldValue(form, "promptKey"),
          message: fieldValue(form, "message"),
        }),
      });
      setIntroTarget(null);
      notify("Your introduction is on its way.");
      await loadTab("Discover");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send this introduction.");
    } finally {
      setBusy(false);
    }
  };

  const respondToIntroduction = async (id: string, action: "accept" | "decline") => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/introductions/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      if (action === "accept") {
        notify("You have a new match. Say hello when you’re ready.");
        await loadTab("Matches");
      } else {
        notify("Introduction declined.");
        await loadTab("Introductions");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not respond to that introduction.");
    } finally {
      setBusy(false);
    }
  };

  const openConversation = async (match: MatchItem) => {
    setSelectedMatch(match);
    setError("");
    try {
      const data = await api<{ messages: Message[] }>(`/api/matches/${match.id}`);
      setMessages(data.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this conversation.");
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMatch || !messageDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ message: Message }>(`/api/matches/${selectedMatch.id}`, {
        method: "POST",
        body: JSON.stringify({ body: messageDraft }),
      });
      setMessages((current) => [...current, data.message]);
      setMessageDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileDraft) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ profile: Profile; photos: Photo[] }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ ...profileDraft, photos: photosDraft }),
      });
      setProfileDraft(saved.profile);
      setPhotosDraft(saved.photos);
      setViewer((current) => current ? { ...current, profile: saved.profile } : current);
      notify("Your profile has been saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const sendSafetyAction = async (action: "block" | "report", target: Person) => {
    const subjectId = target.id ?? target.userId;
    if (!subjectId) return;
    setBusy(true);
    setError("");
    try {
      if (action === "block") {
        await api("/api/safety", { method: "POST", body: JSON.stringify({ action, subjectId }) });
        setSafetyTarget(null);
        setSelectedMatch(null);
        setMessages([]);
        notify("This member is blocked. Their profile and conversation are no longer available.");
        await loadTab(tab === "Matches" ? "Matches" : "Discover");
      } else {
        await api("/api/safety", {
          method: "POST",
          body: JSON.stringify({
            action,
            subjectId,
            reason: reportReason,
            details: reportDetails,
          }),
        });
        setSafetyTarget(null);
        setReportDetails("");
        notify("Your private report has been sent to the moderation team.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Safety action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const unmatch = async (matchId: string) => {
    if (!window.confirm("Unmatch and end this conversation? You will no longer be able to message each other.")) return;
    setBusy(true);
    try {
      await api(`/api/matches/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "unmatch" }),
      });
      setSelectedMatch(null);
      setMessages([]);
      notify("The match has ended.");
      await loadTab("Matches");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not end this match.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true);
    try {
      await api("/api/account", { method: "DELETE", body: JSON.stringify({ password }) });
      setViewer(null);
      setDeleteOpen(false);
      notify("Your account and associated data have been deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
  };

  const reviewReport = async (report: Report, status: "REVIEWING" | "RESOLVED") => {
    setBusy(true);
    try {
      await api("/api/moderation", {
        method: "PATCH",
        body: JSON.stringify({ id: report.id, status }),
      });
      await loadTab("Reports");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this report.");
    } finally {
      setBusy(false);
    }
  };

  const visibleTabs = useMemo<Tab[]>(() => {
    const items: Tab[] = ["Discover", "Introductions", "Matches", "My profile", "Safety"];
    if (viewer?.role === "MODERATOR") items.push("Reports");
    return items;
  }, [viewer?.role]);

  if (loading) {
    return <main className="auth-wrap"><div className="auth-card">Opening your space…</div></main>;
  }

  if (!viewer) {
    return (
      <main className="auth-wrap">
        <section className="auth-card" aria-labelledby="auth-title">
          <a className="brand" href="/"><span aria-hidden="true" className="brand-mark"><span>♥</span></span> AfroIE Meet</a>
          <h1 className="serif" id="auth-title">{authMode === "signup" ? "Start with your story." : "Welcome back."}</h1>
          <p>{authMode === "signup" ? "Create your account and meet people who are ready for something real." : "Sign in to pick up where your next chapter begins."}</p>
          <form className="form-grid" onSubmit={submitAuth}>
            {authMode === "signup" && (
              <>
                <div className="field">
                  <label htmlFor="displayName">What should we call you?</label>
                  <input id="displayName" name="displayName" autoComplete="nickname" minLength={2} maxLength={40} required />
                </div>
                <div className="field">
                  <label htmlFor="dateOfBirth">Date of birth</label>
                  <input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" required />
                </div>
                {inviteRequired && (
                  <div className="field">
                    <label htmlFor="invitationCode">Invitation code</label>
                    <input id="invitationCode" name="invitationCode" autoComplete="off" maxLength={64} required />
                  </div>
                )}
              </>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={authMode === "signup" ? 12 : 1} maxLength={72} required />
            </div>
            {authMode === "signup" && (
              <label className="check-row">
                <input type="checkbox" name="ageConfirmed" required />
                <span>I confirm that I am 18 or older and agree to the community guidelines.</span>
              </label>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Please wait…" : authMode === "signup" ? "Create my profile" : "Sign in"}</button>
          </form>
          <p className="small-muted" style={{ marginTop: 16 }}>
            {authMode === "signup" ? "Already a member? " : "New to AfroIE Meet? "}
            <button className="text-button" type="button" onClick={() => { setError(""); setAuthMode(authMode === "signup" ? "login" : "signup"); }}>
              {authMode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
          {demoAvailable && (
            <div className="demo-box">
              <p>Local development only · clearly fictional accounts</p>
              <div className="demo-buttons">
                {demoAccounts.map((account) => (
                  <button className="demo-button" key={account.email} onClick={() => signInDemo(account.email)} disabled={busy}>
                    Continue as {account.label}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: 10 }}>Demo password for regular sign-in: <strong>LocalOnly!2026</strong></p>
            </div>
          )}
          {error && !demoAvailable && <div className="form-error" role="alert">{error}</div>}
          <p className="small-muted" style={{ marginTop: 18 }}>By continuing, you confirm that you are 18 or older. Be kind, stay curious and keep your exact location private.</p>
        </section>
      </main>
    );
  }

  const setDraft = (key: keyof Profile, value: string) => {
    setProfileDraft((current) => current ? {
      ...current,
      [key]: key === "identityText" || key === "culturalBackground" ? (value || null) : value,
    } : current);
  };

  const renderPerson = (person: Person, key: string) => {
    const name = person.displayName ?? person.profile?.displayName ?? "Member";
    const photo = person.photos?.[0];
    return (
      <div className="profile-photo" key={key}>
        {photo ? <img src={photo.url} alt={photo.altText || `A photo shared by ${name}`} /> : <span className="avatar avatar-large" aria-label={`${name}’s initials`}>{initials(name)}</span>}
      </div>
    );
  };

  const renderProfileCard = (person: Person, source: "discovery" | "match") => {
    const profile = person as Person & { profile?: Profile | null };
    const display = source === "discovery" ? person : profile.profile ?? {};
    const name = display.displayName ?? "Member";
    const age = person.age;
    const id = person.userId ?? person.id;
    const currentProfile = viewer.profile;
    return (
      <article className="profile-card" key={id ?? name}>
        {renderPerson({ ...person, displayName: name }, String(id ?? name))}
        <div className="profile-content">
          <h2 className="serif">{name}{age ? `, ${age}` : ""}</h2>
          <div className="profile-meta">{display.city ?? "Ireland"} · {intentLabel(display.relationshipIntent)}</div>
          {display.identityText && <p className="small-muted">Identity, in their words: {display.identityText}</p>}
          {display.culturalBackground && <p className="small-muted">Culture, in their words: {display.culturalBackground}</p>}
          {display.bio && <p>{display.bio}</p>}
          {display.traditionPrompt && <div className="prompt"><strong>A tradition I’d love to share is…</strong><p>{display.traditionPrompt}</p></div>}
          {display.futurePrompt && <div className="prompt"><strong>The future I’m working towards looks like…</strong><p>{display.futurePrompt}</p></div>}
          {source === "discovery" ? (
            <div className="profile-actions">
              <button className="button button-primary button-small" onClick={() => setIntroTarget(person)}>Send an introduction</button>
              <button className="text-button" onClick={() => setSafetyTarget({ ...person, id: person.userId })}>Safety options</button>
            </div>
          ) : (
            <div className="profile-actions">
              <button className="button button-primary button-small" onClick={() => {
                const match = matches.find((item) => item.otherUser.id === id);
                if (match) void openConversation(match);
              }}>Open conversation</button>
              <button className="text-button danger-button" onClick={() => {
                const match = matches.find((item) => item.otherUser.id === id);
                if (match) void unmatch(match.id);
              }}>Unmatch</button>
              <button className="text-button" onClick={() => setSafetyTarget({ ...person, id })}>Safety options</button>
            </div>
          )}
          {source === "discovery" && currentProfile && !currentProfile.city && <p className="small-muted">Complete your profile to improve your introductions.</p>}
        </div>
      </article>
    );
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/"><span aria-hidden="true" className="brand-mark"><span>♥</span></span> AfroIE Meet</a>
        <div className="app-header-right">
          <span className="avatar">{initials(viewer.profile?.displayName)}</span>
          <span>{viewer.profile?.displayName ?? viewer.email}</span>
          <button className="button button-secondary button-small" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <nav className="tabs" aria-label="Member navigation">
        {visibleTabs.map((item) => <button key={item} className={`tab${tab === item ? " active" : ""}`} onClick={() => selectTab(item)}>{item}</button>)}
      </nav>

      {error && <div className="form-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}

      <section className="dashboard">
        {tab === "Discover" && (
          <>
            <div className="dashboard-head">
              <div><span className="eyebrow">A thoughtful first look</span><h1 className="serif">People building a future in {viewer.profile?.city ?? "Dublin"}.</h1><p>Broad location and shared relationship intentions. No exact location or ethnicity-based ranking.</p></div>
            </div>
            {profiles.length ? (
              <div className="profile-grid">
                <div>{renderProfileCard(profiles[0], "discovery")}</div>
                <aside className="side-note"><strong>Start with what caught your attention.</strong>Respond to a prompt with a genuine note. You stay in control of what you share about your identity and cultural background.</aside>
              </div>
            ) : (
              <div className="empty-state"><strong>You’re all caught up for now.</strong>New people will appear here as they join with similar relationship intentions. You can edit your profile or come back soon.</div>
            )}
            {profiles.length > 1 && <div className="cards-list" style={{ marginTop: 24 }}>{profiles.slice(1).map((person) => renderProfileCard(person, "discovery"))}</div>}
          </>
        )}

        {tab === "Introductions" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">A note that means something</span><h1 className="serif">Your introductions</h1><p>Accept an introduction to create one match and one private conversation.</p></div></div>
            {introductions.length ? <div className="cards-list">{introductions.map((intro) => {
              const profile = intro.fromUser.profile;
              const person: Person = { ...profile, id: intro.fromUser.id, userId: intro.fromUser.id, displayName: profile?.displayName, age: intro.fromUser.age, city: profile?.city, photos: intro.fromUser.photos };
              return <article className="data-card" key={intro.id}>
                <div className="data-card-top"><span className="avatar">{initials(profile?.displayName)}</span><div><h3>{profile?.displayName ?? "Member"}{intro.fromUser.age ? `, ${intro.fromUser.age}` : ""}</h3><div className="item-meta">{profile?.city ?? "Ireland"} · {intentLabel(profile?.relationshipIntent)}</div></div></div>
                <div className="prompt"><strong>{intro.promptKey === "traditionPrompt" ? "A tradition I’d love to share is…" : "The future I’m working towards looks like…"}</strong><p>{intro.promptKey === "traditionPrompt" ? profile?.traditionPrompt : profile?.futurePrompt}</p></div>
                <div className="intro-message">“{intro.message}”</div>
                <div className="profile-actions"><button className="button button-primary button-small" disabled={busy} onClick={() => respondToIntroduction(intro.id, "accept")}>Accept introduction</button><button className="button button-secondary button-small" disabled={busy} onClick={() => respondToIntroduction(intro.id, "decline")}>Not for me</button><button className="text-button" onClick={() => setSafetyTarget(person)}>Safety options</button></div>
              </article>;
            })}</div> : <div className="empty-state"><strong>No introductions waiting.</strong>When someone sends a thoughtful note, it will appear here.</div>}
          </>
        )}

        {tab === "Matches" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">A conversation, when you’re ready</span><h1 className="serif">Your matches</h1><p>Every match starts with an accepted introduction.</p></div></div>
            {matches.length ? (
              <div className="conversation-layout">
                <div className="conversation-list">{matches.map((match) => (
                  <button className={`conversation-item${selectedMatch?.id === match.id ? " selected" : ""}`} key={match.id} onClick={() => void openConversation(match)}>
                    <span className="avatar">{initials(match.otherUser.profile?.displayName)}</span>
                    <span><strong>{match.otherUser.profile?.displayName}</strong><small className="item-meta" style={{ display: "block" }}>{match.lastMessage?.body ?? "Say hello to start chatting"}</small></span>
                  </button>
                ))}</div>
                {selectedMatch ? (
                  <div className="chat-panel">
                    <div className="data-card-top"><span className="avatar">{initials(selectedMatch.otherUser.profile?.displayName)}</span><div><strong>{selectedMatch.otherUser.profile?.displayName}</strong><div className="item-meta">{selectedMatch.otherUser.profile?.city ?? "Ireland"}</div></div></div>
                    <div className="chat-messages" aria-live="polite">
                      {messages.length ? messages.map((message) => <div key={message.id} className={`message${message.sender.id === viewer.id ? " mine" : ""}`}>{message.body}<small>{new Date(message.createdAt).toLocaleString()}</small></div>) : <div className="empty-state" style={{ margin: "auto 0" }}>Your match accepted your introduction. Say hello when you’re ready.</div>}
                    </div>
                    <form className="chat-form" onSubmit={sendMessage}><input aria-label="Write a message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={2000} placeholder="Write a kind first message…" /><button className="button button-primary button-small" disabled={busy || !messageDraft.trim()}>Send</button></form>
                    <div className="safety-actions"><button className="text-button danger-button" onClick={() => void unmatch(selectedMatch.id)}>Unmatch</button><button className="text-button" onClick={() => setSafetyTarget({ id: selectedMatch.otherUser.id, displayName: selectedMatch.otherUser.profile?.displayName })}>Block or report</button></div>
                  </div>
                ) : <div className="empty-state">Choose a match to open your conversation.</div>}
              </div>
            ) : <div className="empty-state"><strong>Your next conversation could start here.</strong>When someone accepts one of your introductions, your match and chat will appear here.</div>}
          </>
        )}

        {tab === "My profile" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">Your words, your choices</span><h1 className="serif">Your profile</h1><p>Identity and cultural background are optional, and always described in your own words.</p></div></div>
            {profileDraft && <form className="profile-editor" onSubmit={saveProfile}>
              <div className="editor-grid">
                <div className="field"><label htmlFor="profile-name">Display name</label><input id="profile-name" value={profileDraft.displayName} maxLength={40} onChange={(event) => setDraft("displayName", event.target.value)} required /></div>
                <div className="field"><label htmlFor="profile-city">City or broad area</label><input id="profile-city" value={profileDraft.city} maxLength={80} onChange={(event) => setDraft("city", event.target.value)} required /></div>
                <div className="field"><label htmlFor="intent">Relationship intention</label><select id="intent" value={profileDraft.relationshipIntent} onChange={(event) => setDraft("relationshipIntent", event.target.value)}><option value="MARRIAGE">Marriage-minded</option><option value="LONG_TERM">Long-term relationship</option></select></div>
                <div className="field"><label htmlFor="identity">How do you describe yourself? (optional)</label><input id="identity" value={profileDraft.identityText ?? ""} maxLength={160} onChange={(event) => setDraft("identityText", event.target.value)} /></div>
                <div className="field full"><label htmlFor="culture">Cultural background, in your own words (optional)</label><input id="culture" value={profileDraft.culturalBackground ?? ""} maxLength={160} onChange={(event) => setDraft("culturalBackground", event.target.value)} /></div>
                <div className="field full"><label htmlFor="bio">A little about you</label><textarea id="bio" value={profileDraft.bio} maxLength={800} onChange={(event) => setDraft("bio", event.target.value)} /></div>
                <div className="field full"><label htmlFor="tradition">A tradition I’d love to share is…</label><textarea id="tradition" value={profileDraft.traditionPrompt} maxLength={280} onChange={(event) => setDraft("traditionPrompt", event.target.value)} /></div>
                <div className="field full"><label htmlFor="future">The future I’m working towards looks like…</label><textarea id="future" value={profileDraft.futurePrompt} maxLength={280} onChange={(event) => setDraft("futurePrompt", event.target.value)} /></div>
                <div className="field full">
                  <label htmlFor="photo-file">Profile photo (optional)</label>
                  <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
                      setError("Choose a JPEG, PNG, or WebP photo that is 2 MB or smaller.");
                      event.currentTarget.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setPhotosDraft([{ url: reader.result, altText: photosDraft[0]?.altText ?? "" }]);
                        setError("");
                      }
                    };
                    reader.onerror = () => setError("The selected photo could not be read.");
                    reader.readAsDataURL(file);
                  }} />
                  <span className="small-muted">Only upload a photo you own or have permission to share. JPEG, PNG, or WebP; up to 2 MB each. Photos are visible only to you and people who can currently discover or match with you.</span>
                </div>
                {photosDraft[0] && <div className="field full"><label htmlFor="photo-alt">Photo description for screen readers</label><input id="photo-alt" value={photosDraft[0].altText} maxLength={160} onChange={(event) => setPhotosDraft([{ ...photosDraft[0], altText: event.target.value }])} required /><span className="small-muted">Describe what someone should know from the image, not just “profile picture.”</span></div>}
              </div>
              {photosDraft[0]?.url && <div className="photo-preview" style={{ marginTop: 14 }}><img src={photosDraft[0].url} alt={photosDraft[0].altText} /><span className="small-muted">Profile photo preview</span></div>}
              <div className="profile-actions"><button className="button button-primary" disabled={busy}>Save profile</button><button className="button button-secondary" type="button" onClick={() => setDeleteOpen(true)}>Delete account</button></div>
            </form>}
          </>
        )}

        {tab === "Safety" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">You are in control</span><h1 className="serif">Safety and privacy</h1><p>Report an account for moderator review, block someone to end contact, or unmatch from a conversation.</p></div></div>
            <div className="cards-list">
              <article className="data-card"><h3>Keep your location broad</h3><p>Profiles show a city or area, not precise coordinates. Never share your home address or private contact details before you feel ready.</p></article>
              <article className="data-card"><h3>Block</h3><p>Blocking removes each other from discovery and closes any active match. Neither account can send further messages.</p></article>
              <article className="data-card"><h3>Report</h3><p>Reports are private and visible to authorised moderators only. Add a reason and context so the community team can review it.</p></article>
            </div>
            <div className="profile-editor" style={{ marginTop: 20 }}>
              <h3>Delete your account</h3><p className="small-muted">Account deletion removes your profile and associated data. Confirm your password before the action is completed.</p>
              <button className="button button-secondary" onClick={() => setDeleteOpen(true)}>Delete account</button>
            </div>
          </>
        )}

        {tab === "Reports" && viewer.role === "MODERATOR" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">Authorised moderator access</span><h1 className="serif">Community reports</h1><p>Reports are visible to moderators only. Review and update each item.</p></div></div>
            {reports.length ? <div className="cards-list">{reports.map((report) => <article className="data-card" key={report.id}>
              <div className="data-card-top"><span className="avatar">{report.status === "OPEN" ? "!" : "✓"}</span><div><h3>{report.reason.replaceAll("_", " ")}</h3><div className="item-meta">{new Date(report.createdAt).toLocaleString()} · {report.status}</div></div></div>
              <p>Reported member: <strong>{report.subject.profile?.displayName ?? "Deleted account"}</strong></p>
              <p>Submitted by: {report.reporter.profile?.displayName ?? "Deleted account"}</p>
              {report.details && <div className="intro-message">{report.details}</div>}
              <div className="profile-actions"><button className="button button-secondary button-small" disabled={busy || report.status === "REVIEWING"} onClick={() => void reviewReport(report, "REVIEWING")}>Mark reviewing</button><button className="button button-primary button-small" disabled={busy || report.status === "RESOLVED"} onClick={() => void reviewReport(report, "RESOLVED")}>Resolve report</button></div>
            </article>)}</div> : <div className="empty-state"><strong>No reports yet.</strong>Member reports will appear here when submitted.</div>}
          </>
        )}
      </section>

      {introTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIntroTarget(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="intro-title">
            <h2 id="intro-title">Start with something you noticed.</h2>
            <p>Choose one of {introTarget.displayName ?? "their"}’s prompts and add a thoughtful note. Keep it kind and under 500 characters.</p>
            <form onSubmit={submitIntroduction}>
              <div className="form-grid">
                <div className="field"><label htmlFor="promptKey">Respond to</label><select name="promptKey" id="promptKey"><option value="traditionPrompt">A tradition I’d love to share is…</option><option value="futurePrompt">The future I’m working towards looks like…</option></select></div>
                <div className="field"><label htmlFor="intro-message">Your introduction</label><textarea id="intro-message" name="message" minLength={8} maxLength={500} required placeholder="I’d love to hear more about…" /></div>
              </div>
              <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setIntroTarget(null)}>Cancel</button><button className="button button-primary" disabled={busy}>Send introduction</button></div>
            </form>
          </section>
        </div>
      )}

      {safetyTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSafetyTarget(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="safety-title">
            <h2 id="safety-title">Safety options for {safetyTarget.displayName ?? "this member"}</h2>
            <p>Reports are private. Blocking immediately removes this person from discovery and closes any active conversation.</p>
            <div className="field"><label htmlFor="report-reason">Report reason</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="HARASSMENT">Harassment or unwanted contact</option><option value="FAKE_PROFILE">Fake or misleading profile</option><option value="INAPPROPRIATE_CONTENT">Inappropriate content</option><option value="SCAM_OR_SPAM">Scam or spam</option><option value="OTHER">Something else</option></select></div>
            <div className="field" style={{ marginTop: 12 }}><label htmlFor="report-details">Additional context (optional)</label><textarea id="report-details" value={reportDetails} maxLength={2000} onChange={(event) => setReportDetails(event.target.value)} placeholder="Share anything that may help a moderator review this report." /></div>
            <div className="modal-actions"><button className="button button-secondary" onClick={() => setSafetyTarget(null)}>Cancel</button><button className="button button-secondary" disabled={busy} onClick={() => void sendSafetyAction("report", safetyTarget)}>Submit report</button><button className="button button-primary" disabled={busy} onClick={() => { if (window.confirm("Block this member? You will no longer see each other or be able to message.")) void sendSafetyAction("block", safetyTarget); }}>Block member</button></div>
          </section>
        </div>
      )}

      {deleteOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">Delete your account?</h2>
            <p>This permanently removes your account, profile, photos and associated introductions, messages, blocks and reports. This cannot be undone.</p>
            <form onSubmit={deleteAccount}>
              <div className="field"><label htmlFor="confirm-password">Confirm your password</label><input id="confirm-password" type="password" name="password" autoComplete="current-password" required /></div>
              <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setDeleteOpen(false)}>Keep my account</button><button className="button button-primary" disabled={busy}>Delete permanently</button></div>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
