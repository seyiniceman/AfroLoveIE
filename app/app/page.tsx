"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api-response.mjs";
import { counties, intentNames, interestOptions, memberIntents, profileIntents, promptKeys, promptOptions, visibleProfile, type EditableProfile as Profile, type PromptKey, type VisibleProfile } from "@/lib/profile-options";

import { preparePhoto } from "@/lib/photo-upload";

type Photo = { id?: string; url: string; altText: string; position?: number };
type Viewer = {
  id: string;
  email: string;
  username: string;
  age: number;
  emailVerifiedAt: string | null;
  mainPhoto?: Photo | null;
  role: "MEMBER" | "MODERATOR";
  profile: Profile | null;
};
type Person = Partial<VisibleProfile> & {
  id?: string;
  userId?: string;
  age?: number;
  photos?: Photo[];
  profile?: VisibleProfile | null;
};
type Message = { id: string; body: string; sender: { id: string }; createdAt: string; unread?: boolean };
type Alerts = { unreadMessages: number; pendingIntroductions: number };
type SafetyTarget = Person & { evidenceKind?: "PHOTO" | "MESSAGE"; evidenceRef?: string };
type MatchItem = {
  id: string;
  createdAt: string;
  otherUser: Person & { id: string; profile: VisibleProfile | null };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};
type Introduction = {
  id: string;
  promptKey: PromptKey;
  message: string;
  createdAt: string;
  fromUser: { id: string; age: number; profile: VisibleProfile | null; photos: Photo[] };
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
  moderatorId: string | null;
  evidenceKind: "PROFILE" | "PHOTO" | "MESSAGE";
  messageEvidence: string | null;
  photoEvidenceUrl: string | null;
  outcome: string | null;
  reviews: { id: string; status: string; note: string; createdAt: string; moderator: { profile: { displayName: string } | null } | null }[];
};
type Tab = "Discover" | "Introductions" | "Matches" | "My profile" | "Safety" | "Reports";

function MemberAvatar({ name, photo }: { name?: string | null; photo?: Photo | null }) {
  return <span className="avatar" aria-hidden="true">{photo ? <img src={photo.url} alt="" /> : initials(name)}</span>;
}

function ProfileGallery({ photos = [], name, onReport }: { photos?: Photo[]; name: string; onReport?: (photo: Photo) => void }) {
  const [active, setActive] = useState(0);
  const index = Math.min(active, Math.max(0, photos.length - 1));
  const photo = photos[index];
  return (
    <div className="profile-photo">
      {photo ? <img src={photo.url} alt={photo.altText || `Photo shared by ${name}`} /> : <span className="avatar avatar-large" aria-label={`${name}’s initials`}>{initials(name)}</span>}
      {photo?.id && onReport && <button className="button button-secondary button-small photo-report" type="button" onClick={() => onReport(photo)}>Report photo</button>}
      {photos.length > 1 && <div className="photo-gallery-controls" aria-label={`${name}’s photo gallery`}>
        <button type="button" disabled={index === 0} onClick={() => setActive(index - 1)} aria-label="Previous photo">‹</button>
        <span aria-live="polite">{index + 1} / {photos.length}</span>
        <button type="button" disabled={index === photos.length - 1} onClick={() => setActive(index + 1)} aria-label="Next photo">›</button>
      </div>}
    </div>
  );
}


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
  return await readApiResponse(response) as T;
}

function initials(name?: string | null) {
  return (name ?? "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

const onboardingSteps = ["Basics", "About me", "Photos", "What I’m looking for", "Preview"];

function intentLabel(profile?: Partial<VisibleProfile> | null) {
  const intents = profile?.relationshipIntents?.length
    ? profile.relationshipIntents
    : profile?.relationshipIntent ? [profile.relationshipIntent] : [];
  return intents.length ? intents.map((intent) => intentNames[intent]).join(" · ") : "Open to meeting people";
}

function parseLanguages(value: string) {
  return [...new Set(value.split(",").map((language) => language.trim()).filter(Boolean))];
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
  const [reportFilter, setReportFilter] = useState("");
  const [alerts, setAlerts] = useState<Alerts>({ unreadMessages: 0, pendingIntroductions: 0 });
  const [discoveryCity, setDiscoveryCity] = useState("");
  const [discoveryIntent, setDiscoveryIntent] = useState("");
  const [discoveryOrigin, setDiscoveryOrigin] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [photosTarget, setPhotosTarget] = useState<Person | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const sendingMessage = useRef(false);
  const messageRevision = useRef(0);
  const [selectedMatch, setSelectedMatch] = useState<MatchItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [photosDraft, setPhotosDraft] = useState<Photo[]>([]);
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [previewProfile, setPreviewProfile] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [languagesDraft, setLanguagesDraft] = useState("");
  const [chosenPrompts, setChosenPrompts] = useState<PromptKey[]>([]);
  const [introTarget, setIntroTarget] = useState<Person | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null);
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
    setAlerts({ unreadMessages: 0, pendingIntroductions: 0 });
    setNotificationsOpen(false);
    setDemoAvailable(data.demoAvailable);
    setInviteRequired(data.inviteRequired);
    setProfileDraft(data.user?.profile ?? null);
    setPhotosDraft([]);
    setPreviewProfile(false);
    if (data.user?.profile?.published === false) setTab("My profile");
    setLoading(false);
    if (new URLSearchParams(window.location.search).get("signup") === "1") {
      setAuthMode("signup");
    }
  }, []);

  const loadTab = useCallback(async (nextTab: Tab, queue = reportFilter) => {
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
        setProfileDraft({ ...data.profile, relationshipIntents: data.profile.published ? [...memberIntents(data.profile)] : data.profile.relationshipIntents });
        setProfileStep(data.profile.onboardingStep);
        setLanguagesDraft(data.profile.languages.join(", "));
        const answered = promptKeys.filter((key) => data.profile[key]);
        setChosenPrompts(answered.length ? answered : ["saturdayPrompt", "traditionPrompt"]);
        setPreviewProfile(false);
        setPhotosDraft(data.photos);
      } else if (nextTab === "Reports") {
        const data = await api<{ reports: Report[] }>(`/api/moderation${queue ? `?status=${encodeURIComponent(queue)}` : ""}`);
        setReports(data.reports);
      }
      setTab(nextTab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this section.");
    }
  }, [selectedMatch, reportFilter]);

  useEffect(() => {
    loadViewer().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Could not load your account.");
      setLoading(false);
    });
  }, [loadViewer]);

  useEffect(() => {
    if (viewer?.emailVerifiedAt) void loadTab(viewer.profile?.published === false ? "My profile" : tab);
    // Load the selected section after authentication; later tab changes are handled by selectTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.id]);

  const refreshAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api<Alerts>("/api/notifications", { signal });
      if (!signal?.aborted) setAlerts(result);
    } catch {
      // Keep the last successful counts if the connection drops.
    }
  }, []);

  useEffect(() => {
    if (!viewer?.emailVerifiedAt) return;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden || controller.signal.aborted) return;
      await refreshAlerts(controller.signal);
      if (tab === "Matches" && !controller.signal.aborted) {
        try {
          const data = await api<{ matches: MatchItem[] }>("/api/matches", { signal: controller.signal });
          if (!controller.signal.aborted) setMatches(data.matches);
        } catch {
          // The manual tab load supplies the accessible error message.
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [viewer?.id, viewer?.emailVerifiedAt, tab, refreshAlerts]);

  useEffect(() => {
    if (tab !== "Matches" || !selectedMatch) return;
    const id = selectedMatch.id;
    const controller = new AbortController();
    let pending = false;
    async function refreshConversation() {
      if (document.hidden || controller.signal.aborted || pending || sendingMessage.current) return;
      pending = true;
      const revision = messageRevision.current;
      try {
        const response = await fetch(`/api/matches/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 403 || response.status === 404) {
          setSelectedMatch(null);
          setMessages([]);
          setMatches((current) => current.filter((item) => item.id !== id));
          setError("This conversation is no longer available.");
          void refreshAlerts();
          return;
        }
        const result = await readApiResponse(response) as { messages: Message[] };
        if (controller.signal.aborted || sendingMessage.current || revision !== messageRevision.current) return;
        setMessages(result.messages);
        const messageIds = result.messages.filter((message) => message.unread).slice(0, 200).map((message) => message.id);
        if (!messageIds.length) return;
        await api(`/api/matches/${id}`, {
          method: "PATCH", body: JSON.stringify({ action: "mark-read", messageIds }), signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setMatches((current) => current.map((item) => item.id === id
          ? { ...item, unreadCount: Math.max(0, result.messages.filter((message) => message.unread).length - messageIds.length) }
          : item));
        void refreshAlerts();
      } catch {
        if (!controller.signal.aborted) setError("Could not update this conversation. Retrying shortly.");
      } finally {
        pending = false;
      }
    }
    void refreshConversation();
    const interval = window.setInterval(() => void refreshConversation(), 5000);
    document.addEventListener("visibilitychange", refreshConversation);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshConversation);
    };
  }, [selectedMatch?.id, tab, refreshAlerts]);

  const selectTab = (next: Tab) => {
    setNotificationsOpen(false);
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
    if (authMode === "signup" && fieldValue(form, "password") !== fieldValue(form, "confirmPassword")) {
      setError("The passwords don’t match.");
      setBusy(false);
      return;
    }
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify(
          authMode === "signup"
            ? {
                action: "signup",
                username: fieldValue(form, "username"),
                email: fieldValue(form, "email"),
                password: fieldValue(form, "password"),
                displayName: fieldValue(form, "displayName"),
                dateOfBirth: fieldValue(form, "dateOfBirth"),
                invitationCode: fieldValue(form, "invitationCode"),
                ageConfirmed: form.get("ageConfirmed") === "on",
              }
            : {
                action: "login",
                username: fieldValue(form, "username"),
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
      void refreshAlerts();
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
      void refreshAlerts();
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

  const openConversation = (match: MatchItem) => {
    if (selectedMatch?.id === match.id) return;
    messageRevision.current++;
    setSelectedMatch(match);
    setMessages([]);
    setMessageDraft("");
    setError("");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMatch || !messageDraft.trim() || sendingMessage.current) return;
    sendingMessage.current = true;
    const revision = ++messageRevision.current;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ message: Message }>(`/api/matches/${selectedMatch.id}`, {
        method: "POST",
        body: JSON.stringify({ body: messageDraft }),
      });
      if (messageRevision.current === revision) {
        setMessages((current) => [...current, data.message]);
        setMessageDraft("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send your message.");
    } finally {
      sendingMessage.current = false;
      setBusy(false);
    }
  };

  const addPhotos = async (files: File[]) => {
    setError("");
    if (photosDraft.length + files.length > 6) {
      setError("Choose up to six photos in total.");
      return;
    }
    const savedBytes = photosDraft.reduce((size, photo) => {
      const encoded = photo.url.split(",")[1] ?? "";
      return size + Math.floor(encoded.length * 3 / 4) - (encoded.match(/=+$/)?.[0].length ?? 0);
    }, 0);
    setReadingPhotos(true);
    try {
      const added: Photo[] = [];
      let total = savedBytes;
      for (const file of files) {
        const photo = await preparePhoto(file);
        total += photo.size;
        if (total > 6 * 1024 * 1024) throw new Error("Your gallery is full. Remove an existing photo before adding more.");
        added.push({ url: photo.url, altText: "" });
      }
      setPhotosDraft((current) => [...current, ...added]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A selected photo could not be read.");
    } finally {
      setReadingPhotos(false);
    }
  };

  const movePhoto = (from: number, to: number) => {
    setPhotosDraft((current) => {
      const reordered = [...current];
      const [photo] = reordered.splice(from, 1);
      reordered.splice(to, 0, photo);
      return reordered;
    });
  };


  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileDraft || readingPhotos || busy) return;
    const onboarding = !profileDraft.published;
    const saveDraft = onboarding && profileStep < 4;
    if ((profileStep === 1 || !saveDraft) && profileDraft.bio.trim().length < 20) {
      setError("Write at least 20 characters in your bio.");
      if (onboarding) setProfileStep(1);
      return;
    }
    if ((profileStep === 1 || !saveDraft) && chosenPrompts.filter((key) => profileDraft[key].trim()).length < 2) {
      setError("Answer at least two of your chosen conversation prompts.");
      if (onboarding) setProfileStep(1);
      return;
    }
    if ((profileStep === 3 || !saveDraft) && !profileDraft.relationshipIntents.length) {
      setError("Choose at least one relationship intention.");
      if (onboarding) setProfileStep(3);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ profile: Profile; photos: Photo[] }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...profileDraft,
          photos: photosDraft,
          languages: parseLanguages(languagesDraft),
          onboardingStep: saveDraft ? profileStep + 1 : 4,
          saveMode: saveDraft ? "draft" : "publish",
        }),
      });
      setProfileDraft(saved.profile);
      setPhotosDraft(saved.photos);
      const cover = saved.photos[0];
      setViewer((current) => current ? {
        ...current,
        profile: saved.profile,
        mainPhoto: cover?.id ? { ...cover, url: `/api/media/${cover.id}` } : null,
      } : current);
      if (saveDraft) {
        setProfileStep(saved.profile.onboardingStep);
        return;
      }
      setPreviewProfile(false);
      if (onboarding) void loadTab("Discover");
      notify(onboarding ? "Your profile has been published." : "Your profile has been saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const changeDiscoveryVisibility = async (paused: boolean) => {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ discoveryPaused: boolean }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ discoveryPaused: paused }),
      });
      setViewer((current) => current?.profile ? { ...current, profile: { ...current.profile, discoveryPaused: data.discoveryPaused } } : current);
      setProfileDraft((current) => current ? { ...current, discoveryPaused: data.discoveryPaused } : current);
      notify(paused ? "Discovery paused. Existing matches are still available." : "Discovery is active.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update discovery.");
    } finally {
      setBusy(false);
    }
  };

  const sendSafetyAction = async (action: "block" | "report", target: SafetyTarget) => {
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
            evidenceKind: target.evidenceKind,
            evidenceRef: target.evidenceRef,
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

  const reviewReport = async (report: Report, status: "REVIEWING" | "RESOLVED", note = "", outcome = "") => {
    setBusy(true);
    try {
      await api("/api/moderation", {
        method: "PATCH",
        body: JSON.stringify({ id: report.id, status, note, outcome }),
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

  if (viewer && !viewer.emailVerifiedAt) {
    return (
      <main className="auth-wrap">
        <section className="auth-card" aria-labelledby="verification-title">
          <a className="brand" href="/"><span aria-hidden="true" className="brand-mark"><span>♥</span></span> AfroIE Meet</a>
          <h1 className="serif" id="verification-title">Check your email</h1>
          <p>Confirm the address <strong>{viewer.email}</strong> before you set up your profile. Open the verification link in this browser.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {toast && <p role="status">{toast}</p>}
          <div className="profile-actions">
            <button type="button" className="button button-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/api/account-email", { method: "POST", body: JSON.stringify({ action: "resend" }) });
                notify("Check your inbox. A new email can be sent once a minute.");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not resend the email.");
              } finally {
                setBusy(false);
              }
            }}>Resend email</button>
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => void logout()}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }


  if (!viewer) {
    return (
      <main className="auth-wrap">
        <section className="auth-card" aria-labelledby="auth-title">
          <a className="brand" href="/"><span aria-hidden="true" className="brand-mark"><span>♥</span></span> AfroIE Meet</a>
          <h1 className="serif" id="auth-title">{authMode === "signup" ? "Start with your story." : "Welcome back."}</h1>
          <p>{authMode === "signup" ? "Create your account and meet people who are ready for something real." : "Sign in to pick up where your next chapter begins."}</p>
          {authMode === "signup" && <ol className="onboarding-steps" aria-label="Registration progress"><li aria-current="step">Account</li><li>Email verification</li><li>Profile setup</li></ol>}
          <form className="form-grid" onSubmit={submitAuth}>
            {authMode === "signup" && (
              <>
                <div className="field">
                  <label htmlFor="displayName">What should we call you?</label>
                  <input id="displayName" name="displayName" autoComplete="nickname" minLength={2} maxLength={40} required />
                </div>
                <div className="field">
                  <label htmlFor="dateOfBirth">Date of birth</label>
                  <input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" aria-describedby="birthdate-hint" required />
                  <p id="birthdate-hint" className="small-muted">Members see your age. Your exact birth date stays private.</p>
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
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" maxLength={30} autoCapitalize="none" spellCheck={false} required
                pattern={authMode === "signup" ? "[A-Za-z0-9][A-Za-z0-9_]{2,29}" : undefined}
                aria-describedby={authMode === "signup" ? "username-hint" : undefined} />
              {authMode === "signup" && <p id="username-hint" className="small-muted">Choose 3–30 letters, numbers, or underscores, starting with a letter or number. Your username is for sign-in. Members see your display name.</p>}
            </div>
            {authMode === "signup" && <div className="field">
              <label htmlFor="email">Email for verification and recovery</label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
            </div>}
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={authMode === "signup" ? 12 : 1} maxLength={72} required />
              <button type="button" className="text-button" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide password" : "Show password"}</button>
              {authMode === "signup" && <p className="small-muted">Use at least 12 characters. A password manager can generate and save one for you.</p>}
              {authMode === "login" && <a className="text-button" href="/account-email">Forgot username or password?</a>}
            </div>
            {authMode === "signup" && <div className="field"><label htmlFor="signup-confirm-password">Confirm password</label><input id="signup-confirm-password" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={72} required /></div>}
            {authMode === "signup" && (
              <label className="check-row">
                <input type="checkbox" name="ageConfirmed" required />
                <span>I confirm that I am 18 or older and agree to the <a href="/community-guidelines" target="_blank" rel="noreferrer">community guidelines</a>.</span>
              </label>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          <p className="small-muted" style={{ marginTop: 16 }}>
            {authMode === "signup" ? "Already a member? " : "New to AfroIE Meet? "}
            <button className="text-button" type="button" onClick={() => { setError(""); setAuthMode(authMode === "signup" ? "login" : "signup"); }}>
              {authMode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
          {authMode === "signup" && <p className="small-muted"><a href="/account-email">Find your username or reset your password</a></p>}
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
              <p style={{ marginTop: 10 }}>Demo usernames: <strong>demo_amara</strong>, <strong>demo_daniel</strong>, <strong>demo_moderator</strong>. Password: <strong>LocalOnly!2026</strong></p>
            </div>
          )}
          {error && !demoAvailable && <div className="form-error" role="alert">{error}</div>}
          <p className="small-muted" style={{ marginTop: 18 }}>By continuing, you confirm that you are 18 or older. Be kind, stay curious and keep your exact location private.</p>
        </section>
      </main>
    );
  }

  const updateProfile = (patch: Partial<Profile>) => {
    setProfileDraft((current) => current ? { ...current, ...patch } : current);
  };

  const onboarding = profileDraft?.published === false;
  const showStep = (step: number) => !onboarding || profileStep === step;

  const setDraft = (key: keyof Profile, value: string) => {
    setProfileDraft((current) => current ? {
      ...current,
      [key]: key === "identityText" || key === "culturalBackground" ? (value || null) : value,
    } : current);
  };

  const renderProfileCard = (person: Person, source: "discovery" | "match" | "preview") => {
    const profile = person as Person & { profile?: Profile | null };
    const display = source === "match" ? profile.profile ?? {} : person;
    const name = display.displayName ?? "Member";
    const age = person.age;
    const id = person.userId ?? person.id;
    const currentProfile = viewer.profile;
    return (
      <article className="profile-card" key={id ?? name}>
        <ProfileGallery photos={person.photos} name={name} onReport={source === "preview" ? undefined : (photo) => {
          setSafetyTarget({ ...person, id, displayName: name, evidenceKind: "PHOTO", evidenceRef: photo.id });
        }} />
        <div className="profile-content">
          <h2 className="serif">{name}{age ? `, ${age}` : ""}</h2>
          <div className="profile-meta">{[display.city, display.county && display.county !== display.city ? `Co. ${display.county}` : null].filter(Boolean).join(", ") || "Ireland"} · {intentLabel(display)}</div>
          {display.identityText && <p className="small-muted">Identity, in their words: {display.identityText}</p>}
          {display.culturalBackground && <p className="small-muted">Culture, in their words: {display.culturalBackground}</p>}
          {[display.gender, display.ethnicity, display.occupation].some(Boolean) && <p className="small-muted">{[display.gender, display.ethnicity, display.occupation].filter(Boolean).join(" · ")}</p>}
          {display.bio && <p>{display.bio}</p>}
          {!!display.languages?.length && <p><strong>Languages</strong> · {display.languages.join(", ")}</p>}
          {!!display.interests?.length && <ul className="profile-interests" aria-label="Interests">{display.interests.map((interest) => <li key={interest}>{interest}</li>)}</ul>}
          {display.lookingFor && <div className="prompt"><strong>What I’m looking for</strong><p>{display.lookingFor}</p></div>}
          {promptKeys.filter((key) => display[key]).map((key) => <div className="prompt" key={key}><strong>{promptOptions[key]}</strong><p>{display[key]}</p></div>)}
          {source === "discovery" ? (
            <div className="profile-actions">
              {promptKeys.some((key) => display[key]) && <button className="button button-primary button-small" onClick={() => setIntroTarget(person)}>Send an introduction</button>}
              <button className="text-button" onClick={() => setSafetyTarget({ ...person, id: person.userId })}>Safety options</button>
            </div>
          ) : source === "match" ? (
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
          ) : null}
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
          <MemberAvatar name={viewer.profile?.displayName} photo={viewer.mainPhoto} />
          <span>{viewer.profile?.displayName ?? viewer.username}</span>
          {!!viewer.profile?.published && <button type="button" className="button button-secondary button-small" aria-expanded={notificationsOpen} aria-controls="member-notifications" onClick={() => {
            setNotificationsOpen((open) => !open);
            void refreshAlerts();
          }}>Notifications {alerts.unreadMessages + alerts.pendingIntroductions > 0 && <span className="notification-badge">{alerts.unreadMessages + alerts.pendingIntroductions}</span>}</button>}
          <button className="button button-secondary button-small" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <a className="text-button" href="/community">Community events</a>
      {notificationsOpen && <section className="notification-panel" id="member-notifications" aria-label="Notifications">
        <button className="text-button" onClick={() => selectTab("Introductions")}>Introductions · {alerts.pendingIntroductions} pending</button>
        <button className="text-button" onClick={() => selectTab("Matches")}>Messages · {alerts.unreadMessages} unread</button>
      </section>}
      <nav className="tabs" aria-label="Member navigation">
        {(viewer.profile?.published === false ? visibleTabs.filter((item) => ["My profile", "Safety"].includes(item)) : visibleTabs).map((item) => <button key={item} className={`tab${tab === item ? " active" : ""}`} onClick={() => selectTab(item)}>{item}{item === "Matches" && alerts.unreadMessages > 0 && <span className="notification-badge" aria-label={`${alerts.unreadMessages} unread messages`}>{alerts.unreadMessages}</span>}{item === "Introductions" && alerts.pendingIntroductions > 0 && <span className="notification-badge" aria-label={`${alerts.pendingIntroductions} pending introductions`}>{alerts.pendingIntroductions}</span>}</button>)}
      </nav>

      {error && <div className="form-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}

      <section className="dashboard">
        {tab === "Discover" && (() => {
          const origin = discoveryOrigin.trim().toLowerCase();
          const filteredProfiles = profiles.filter((profile) =>
            (!discoveryCity || profile.city?.toLowerCase() === discoveryCity) &&
            (!discoveryIntent || profile.relationshipIntents?.some((intent) => intent === discoveryIntent)) &&
            (!origin || profile.ethnicity?.toLowerCase().includes(origin)));
          return (
          <>
            <div className="dashboard-head">
              <div><h1 className="serif">Meet people in {viewer.profile?.county ? `County ${viewer.profile.county}` : viewer.profile?.city ?? "your area"}.</h1><p>Find people nearby who are open to the same kinds of connection.</p></div>
            </div>
            {!viewer.profile?.discoveryPaused && <div className="data-card">
              <div className="field"><label htmlFor="discover-city">City or area</label>
                <select id="discover-city" value={discoveryCity} onChange={(event) => setDiscoveryCity(event.target.value)}>
                  <option value="">All areas nearby</option>
                  {Array.from(new Map(profiles.flatMap((person) => person.city ? [[person.city.toLowerCase(), person.city] as const] : [])).entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select></div>
              <div className="field"><label htmlFor="discover-intent">Intention</label>
                <select id="discover-intent" value={discoveryIntent} onChange={(event) => setDiscoveryIntent(event.target.value)}>
                  <option value="">All shared intentions</option>
                  {profileIntents.map((intent) => <option key={intent} value={intent}>{intentNames[intent]}</option>)}
                </select></div>
              <div className="field"><label htmlFor="discover-origin">Self-described origin or ethnicity</label>
                <input id="discover-origin" value={discoveryOrigin} maxLength={120} onChange={(event) => setDiscoveryOrigin(event.target.value)} aria-describedby="origin-hint" />
                <p id="origin-hint" className="small-muted">Search only what members have chosen to share.</p></div>
              <button type="button" className="button button-secondary button-small" onClick={() => { setDiscoveryCity(""); setDiscoveryIntent(""); setDiscoveryOrigin(""); }}>Clear filters</button>
            </div>}
            {viewer.profile?.discoveryPaused ? (
              <div className="empty-state"><strong>Discovery is paused.</strong>You can turn it back on in Safety and privacy.</div>
            ) : filteredProfiles.length ? (
              <div className="profile-grid">
                <div>{renderProfileCard(filteredProfiles[0], "discovery")}</div>
                <aside className="side-note"><strong>Start with what caught your attention.</strong>Respond to a prompt with a genuine note. You stay in control of what you share about your identity and cultural background.</aside>
              </div>
            ) : (
              <div className="empty-state"><strong>{discoveryCity || discoveryIntent || origin ? "No profiles match these filters." : "You’re all caught up for now."}</strong>{discoveryCity || discoveryIntent || origin ? "Clear a filter to see more people nearby." : "New people will appear here as they join with similar intentions."}</div>
            )}
            {!viewer.profile?.discoveryPaused && filteredProfiles.length > 1 && <div className="cards-list" style={{ marginTop: 24 }}>{filteredProfiles.slice(1).map((person) => renderProfileCard(person, "discovery"))}</div>}
          </>
          );
        })()}

        {tab === "Introductions" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">A note that means something</span><h1 className="serif">Your introductions</h1><p>Accept an introduction to create one match and one private conversation.</p></div></div>
            {introductions.length ? <div className="cards-list">{introductions.map((intro) => {
              const profile = intro.fromUser.profile;
              const person: Person = { ...profile, id: intro.fromUser.id, userId: intro.fromUser.id, displayName: profile?.displayName, age: intro.fromUser.age, city: profile?.city, photos: intro.fromUser.photos };
              return <article className="data-card" key={intro.id}>
                <div className="data-card-top"><MemberAvatar name={profile?.displayName} photo={intro.fromUser.photos[0]} /><div><h3>{profile?.displayName ?? "Member"}{intro.fromUser.age ? `, ${intro.fromUser.age}` : ""}</h3><div className="item-meta">{profile?.city ?? "Ireland"} · {intentLabel(profile)}</div></div></div>
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
                    <MemberAvatar name={match.otherUser.profile?.displayName} photo={match.otherUser.photos?.[0]} />
                    <span><strong>{match.otherUser.profile?.displayName}</strong>{match.unreadCount > 0 && <span className="notification-badge" aria-label={`${match.unreadCount} unread messages`}>{match.unreadCount}</span>}<small className="item-meta" style={{ display: "block" }}>{match.lastMessage?.body ?? "Say hello to start chatting"}</small></span>
                  </button>
                ))}</div>
                {selectedMatch ? (
                  <div className="chat-panel">
                    <div className="data-card-top"><MemberAvatar name={selectedMatch.otherUser.profile?.displayName} photo={selectedMatch.otherUser.photos?.[0]} /><div><strong>{selectedMatch.otherUser.profile?.displayName}</strong><div className="item-meta">{selectedMatch.otherUser.profile?.city ?? "Ireland"}</div></div></div>
                    <div className="chat-messages" aria-live="polite">
                      {messages.length ? messages.map((message) => <div key={message.id} className={`message${message.sender.id === viewer.id ? " mine" : ""}`}>{message.body}<small>{new Date(message.createdAt).toLocaleString()}</small>{message.sender.id !== viewer.id && <button type="button" className="text-button" onClick={() => setSafetyTarget({ id: message.sender.id, displayName: selectedMatch.otherUser.profile?.displayName, evidenceKind: "MESSAGE", evidenceRef: message.id })}>Report message</button>}</div>) : <div className="empty-state" style={{ margin: "auto 0" }}>Your match accepted your introduction. Say hello when you’re ready.</div>}
                    </div>
                    <form className="chat-form" onSubmit={sendMessage}><input aria-label="Write a message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={2000} placeholder="Write a kind first message…" /><button className="button button-primary button-small" disabled={busy || !messageDraft.trim()}>Send</button></form>
                    <div className="safety-actions">{!!selectedMatch.otherUser.photos?.length && <button type="button" className="text-button" onClick={() => setPhotosTarget({ ...selectedMatch.otherUser, displayName: selectedMatch.otherUser.profile?.displayName })}>View profile photos</button>}<button className="text-button danger-button" onClick={() => void unmatch(selectedMatch.id)}>Unmatch</button><button className="text-button" onClick={() => setSafetyTarget({ id: selectedMatch.otherUser.id, displayName: selectedMatch.otherUser.profile?.displayName })}>Block or report</button></div>
                  </div>
                ) : <div className="empty-state">Choose a match to open your conversation.</div>}
              </div>
            ) : <div className="empty-state"><strong>Your next conversation could start here.</strong>When someone accepts one of your introductions, your match and chat will appear here.</div>}
          </>
        )}

        {tab === "My profile" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">Your words, your choices</span><h1 className="serif">{viewer.profile?.published === false ? "Set up your profile" : "Your profile"}</h1><p>{viewer.profile?.published === false ? "Add your details and preview your profile before people can find you." : "Update what other members see on your profile."}</p></div></div>
            <p className="small-muted">Sign-in username: <strong>{viewer.username}</strong> · Only visible to you.</p>
            {onboarding && <ol className="onboarding-steps" aria-label="Profile setup progress">{onboardingSteps.map((step, index) => (
              <li key={step} aria-current={profileStep === index ? "step" : undefined}>{step}</li>
            ))}</ol>}
            {profileDraft && <form className="profile-editor" onSubmit={saveProfile}>
              <fieldset className="editor-section" hidden={!showStep(0)} disabled={!showStep(0)}>
                <legend className="serif">Basics</legend>
                <div className="editor-grid">
                  <div className="field"><label htmlFor="profile-name">Display name</label><input id="profile-name" value={profileDraft.displayName} maxLength={40} minLength={2} onChange={(event) => setDraft("displayName", event.target.value)} required /></div>
                  <div className="field"><label htmlFor="profile-county">County (optional)</label><select id="profile-county" value={profileDraft.county ?? ""} onChange={(event) => updateProfile({ county: event.target.value || null })}><option value="">Select a county</option>{counties.map((county) => <option key={county}>{county}</option>)}</select><p className="small-muted">Share your county to meet people in nearby towns and areas.</p></div>
                  <div className="field"><label htmlFor="profile-city">City or broad area</label><input id="profile-city" value={profileDraft.city} maxLength={80} minLength={2} onChange={(event) => setDraft("city", event.target.value)} required /></div>
                  <div className="field"><label htmlFor="profile-sex">Sex (optional, private)</label><select id="profile-sex" value={profileDraft.sex ?? ""} onChange={(event) => updateProfile({ sex: event.target.value || null })}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Intersex</option></select></div>
                  <div className="field"><label htmlFor="profile-gender">Gender (optional)</label><input id="profile-gender" value={profileDraft.gender ?? ""} maxLength={80} placeholder="Describe in your own words" onChange={(event) => updateProfile({ gender: event.target.value || null })} /><label className="check-row"><input type="checkbox" checked={profileDraft.showGender} onChange={(event) => updateProfile({ showGender: event.target.checked })} />Show my gender on my profile</label></div>
                  <div className="field"><label htmlFor="profile-ethnicity">Origin or ethnicity (optional)</label><input id="profile-ethnicity" value={profileDraft.ethnicity ?? ""} maxLength={120} onChange={(event) => updateProfile({ ethnicity: event.target.value || null })} /><label className="check-row"><input type="checkbox" checked={profileDraft.showEthnicity} onChange={(event) => updateProfile({ showEthnicity: event.target.checked })} />Share my origin or ethnicity on my profile and in discovery filters</label></div>
                  <div className="field"><label htmlFor="profile-occupation">Occupation (optional)</label><input id="profile-occupation" value={profileDraft.occupation ?? ""} maxLength={100} placeholder="For example, nurse or student" onChange={(event) => updateProfile({ occupation: event.target.value || null })} /></div>
                  <div className="field full"><label htmlFor="culture">Cultural background (optional)</label><input id="culture" value={profileDraft.culturalBackground ?? ""} maxLength={160} onChange={(event) => setDraft("culturalBackground", event.target.value)} /><p className="small-muted">Anything you add here is shown on your profile. People of all backgrounds are welcome.</p></div>
                </div>
              </fieldset>
              <fieldset className="editor-section" hidden={!showStep(1)} disabled={!showStep(1)}>
                <legend className="serif">About me</legend>
                <div className="editor-grid">
                  <div className="field full"><label htmlFor="bio">Your bio</label><textarea id="bio" value={profileDraft.bio} maxLength={800} placeholder="I’m happiest cooking with friends, finding live music, or walking by the canal." onChange={(event) => setDraft("bio", event.target.value)} /><p className="small-muted">Share something you enjoy that gives someone a reason to start a conversation. {profileDraft.bio.length} / 800 characters</p></div>
                  <div className="field full"><label htmlFor="identity">How do you describe yourself? (optional)</label><input id="identity" value={profileDraft.identityText ?? ""} maxLength={160} onChange={(event) => setDraft("identityText", event.target.value)} /></div>
                  <div className="field full"><label htmlFor="profile-languages">Languages (optional)</label><input id="profile-languages" value={languagesDraft} maxLength={245} placeholder="English, Yoruba, French" onChange={(event) => setLanguagesDraft(event.target.value)} /><p className="small-muted">Separate up to six languages with commas.</p></div>
                  <div className="field full">
                    <span id="interests-label">Interests (optional)</span>
                    <div className="choice-list" role="group" aria-labelledby="interests-label">{interestOptions.map((interest) => (
                      <label key={interest} className="check-row"><input type="checkbox" checked={profileDraft.interests.includes(interest)} disabled={!profileDraft.interests.includes(interest) && profileDraft.interests.length >= 8} onChange={(event) => updateProfile({ interests: event.target.checked ? [...profileDraft.interests, interest] : profileDraft.interests.filter((item) => item !== interest) })} />{interest}</label>
                    ))}</div>
                  </div>
                  <div className="field full">
                    <span id="prompts-label">Choose two or three conversation prompts</span>
                    <div className="prompt-editor" role="group" aria-labelledby="prompts-label">{promptKeys.map((key) => (
                      <div className="field" key={key}><label className="check-row"><input type="checkbox" checked={chosenPrompts.includes(key)} disabled={!chosenPrompts.includes(key) && chosenPrompts.length >= 3} onChange={(event) => {
                        if (event.target.checked) setChosenPrompts((current) => [...current, key]);
                        else {
                          setChosenPrompts((current) => current.filter((item) => item !== key));
                          setDraft(key, "");
                        }
                      }} />{promptOptions[key]}</label>
                      {chosenPrompts.includes(key) && <textarea aria-label={`Answer: ${promptOptions[key]}`} value={profileDraft[key]} maxLength={280} onChange={(event) => setDraft(key, event.target.value)} />}</div>
                    ))}</div>
                  </div>
                </div>
              </fieldset>
              <fieldset className="editor-section" hidden={!showStep(2)} disabled={!showStep(2)}>
                <legend className="serif">Profile photos</legend>
                <p className="small-muted">Your first photo is your cover. Add up to six JPEG, PNG or WebP photos, up to 30 MB per original. Photos are resized before upload. HEIC works when your browser can open it.</p>
                <div className="field">
                  <label htmlFor="photo-file">Add photos</label>
                  <input id="photo-file" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={busy || readingPhotos || photosDraft.length >= 6} onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) void addPhotos(files);
                  }} />
                </div>
                {photosDraft.length > 0 && <ol className="photo-editor-list">{photosDraft.map((photo, index) => (
                  <li className="photo-editor-item" key={index}>
                    <img src={photo.url} alt={photo.altText || `Preview of photo ${index + 1}`} />
                    <div className="field">
                      <label htmlFor={`photo-alt-${index}`}>{index === 0 ? "Cover photo description" : `Photo ${index + 1} description`}</label>
                      <input id={`photo-alt-${index}`} value={photo.altText} minLength={5} maxLength={160} placeholder="Describe what the photo shows" required onChange={(event) => {
                        const altText = event.target.value;
                        setPhotosDraft((current) => current.map((item, position) => position === index ? { ...item, altText } : item));
                      }} />
                      <div className="photo-editor-actions">
                        {index > 0 && <button type="button" className="text-button" disabled={busy || readingPhotos} onClick={() => movePhoto(index, 0)} aria-label={`Make photo ${index + 1} the cover`}>Make cover</button>}
                        <button type="button" className="text-button" disabled={index === 0 || busy || readingPhotos} onClick={() => movePhoto(index, index - 1)} aria-label={`Move photo ${index + 1} earlier`}>Earlier</button>
                        <button type="button" className="text-button" disabled={index === photosDraft.length - 1 || busy || readingPhotos} onClick={() => movePhoto(index, index + 1)} aria-label={`Move photo ${index + 1} later`}>Later</button>
                        <button type="button" className="text-button" disabled={busy || readingPhotos} onClick={() => setPhotosDraft((current) => current.filter((_, position) => position !== index))} aria-label={`Remove photo ${index + 1}`}>Remove</button>
                      </div>
                    </div>
                  </li>
                ))}</ol>}
              </fieldset>
              <fieldset className="editor-section" hidden={!showStep(3)} disabled={!showStep(3)}>
                <legend className="serif">What I’m looking for</legend>
                <div className="field">
                  <span id="intent-label">Relationship intentions</span>
                  <p className="small-muted">Select everything you’re open to. Members can see these choices, and discovery uses shared intentions.</p>
                  <div className="choice-list" role="group" aria-labelledby="intent-label">{profileIntents.map((intent) => (
                    <label key={intent} className="check-row"><input type="checkbox" checked={profileDraft.relationshipIntents.includes(intent)} onChange={(event) => updateProfile({
                      relationshipIntents: event.target.checked ? [...profileDraft.relationshipIntents, intent] : profileDraft.relationshipIntents.filter((item) => item !== intent),
                    })} />{intentNames[intent]}</label>
                  ))}</div>
                </div>
                <div className="field"><label htmlFor="looking-for">What kind of connection would you enjoy? (optional)</label><textarea id="looking-for" value={profileDraft.lookingFor} maxLength={400} placeholder="Someone kind who enjoys live music and wants to explore Ireland together." onChange={(event) => setDraft("lookingFor", event.target.value)} /></div>
              </fieldset>
              {profileDraft && ((onboarding && profileStep === 4) || previewProfile) && (
                <section className="profile-preview" aria-labelledby="profile-preview-title">
                  <h2 id="profile-preview-title" className="serif">What other members will see</h2>
                  <p className="small-muted">Your email, birth date and private answers are excluded. Members see your age and the fields shown below.</p>
                  {renderProfileCard({ ...visibleProfile({ ...profileDraft, languages: parseLanguages(languagesDraft) }), age: viewer.age, photos: photosDraft }, "preview")}
                </section>
              )}
              <div className="profile-actions">
                {onboarding && profileStep > 0 && <button className="button button-secondary" type="button" disabled={busy || readingPhotos} onClick={() => setProfileStep((step) => step - 1)}>Back</button>}
                <button className="button button-primary" disabled={busy || readingPhotos}>{onboarding ? profileStep === 4 ? "Publish profile" : "Save and continue" : "Save profile"}</button>
                {!onboarding && <button className="button button-secondary" type="button" onClick={() => setPreviewProfile((shown) => !shown)} aria-expanded={previewProfile}>{previewProfile ? "Hide preview" : "Preview profile"}</button>}
                {onboarding && profileStep > 0 && <span className="small-muted">Your last completed step is saved.</span>}
                {!onboarding && <button className="text-button" type="button" onClick={() => setDeleteOpen(true)}>Delete account</button>}
              </div>
            </form>}
          </>
        )}

        {tab === "Safety" && (
          <>
            <div className="dashboard-head"><div><span className="eyebrow">You are in control</span><h1 className="serif">Safety and privacy</h1><p>Report an account for moderator review, block someone to end contact, or unmatch from a conversation.</p></div></div>
            {viewer.profile?.published && <section className="editor-section" aria-labelledby="discovery-settings-title">
              <h2 id="discovery-settings-title" className="serif">Discovery visibility</h2>
              <p>Pause discovery to hide your profile from new people. Your existing introductions and matches stay available.</p>
              <button className="button button-secondary" disabled={busy} onClick={() => void changeDiscoveryVisibility(!viewer.profile?.discoveryPaused)}>
                {viewer.profile.discoveryPaused ? "Resume discovery" : "Pause discovery"}
              </button>
            </section>}
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
            <div className="field report-filter"><label htmlFor="report-filter">Queue</label><select id="report-filter" value={reportFilter} onChange={(event) => {
              const status = event.target.value;
              setReportFilter(status);
              void loadTab("Reports", status);
            }}><option value="">All recent reports</option><option value="OPEN">Open</option><option value="REVIEWING">In review</option><option value="RESOLVED">Resolved</option></select></div>
            {reports.length ? <div className="cards-list">{reports.map((report) => (
              <article className="data-card" key={report.id}>
                <h3>{report.evidenceKind.toLowerCase()} report · {report.reason.replaceAll("_", " ").toLowerCase()}</h3>
                <p className="item-meta">{new Date(report.createdAt).toLocaleString()} · {report.status} · {report.moderator?.profile?.displayName ?? "Unassigned"}</p>
                <p>Reported member: <strong>{report.subject.profile?.displayName ?? "Deleted account"}</strong> · Submitted by: {report.reporter.profile?.displayName ?? "Deleted account"}</p>
                {report.details && <p className="intro-message">{report.details}</p>}
                {report.messageEvidence && <blockquote className="intro-message">{report.messageEvidence}</blockquote>}
                {report.photoEvidenceUrl && <details><summary>View reported photo</summary><img className="report-evidence" loading="lazy" src={report.photoEvidenceUrl} alt="Photo attached to this report" /></details>}
                {report.outcome && <p><strong>Outcome:</strong> {report.outcome.replaceAll("_", " ").toLowerCase()}</p>}
                {report.reviews.length > 0 && <details><summary>Review history</summary><ol>{report.reviews.map((review) => (
                  <li key={review.id}>{review.moderator?.profile?.displayName ?? "Former moderator"} · {new Date(review.createdAt).toLocaleString()} · {review.status}{review.note && <p>{review.note}</p>}</li>
                ))}</ol></details>}
                {report.status !== "RESOLVED" && !report.moderatorId && <button className="button button-secondary button-small" disabled={busy} onClick={() => void reviewReport(report, "REVIEWING")}>Claim report</button>}
                {report.status === "REVIEWING" && report.moderatorId === viewer.id && <form className="form-grid" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                  void reviewReport(report, submitter?.value === "RESOLVED" ? "RESOLVED" : "REVIEWING", fieldValue(form, "note"), fieldValue(form, "outcome"));
                }}>
                  <div className="field"><label htmlFor={`review-note-${report.id}`}>Private review note</label><textarea id={`review-note-${report.id}`} name="note" maxLength={1000} required /></div>
                  <div className="field"><label htmlFor={`review-outcome-${report.id}`}>Outcome (required to resolve)</label><select id={`review-outcome-${report.id}`} name="outcome"><option value="">Choose outcome</option><option value="POLICY_VIOLATION">Policy violation</option><option value="NO_VIOLATION">No violation</option><option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option></select></div>
                  <div className="profile-actions"><button className="button button-secondary button-small" disabled={busy} value="REVIEWING">Save note</button><button className="button button-primary button-small" disabled={busy} value="RESOLVED">Resolve report</button></div>
                </form>}
              </article>
            ))}</div> : <div className="empty-state"><strong>No reports in this queue.</strong></div>}
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
                <div className="field"><label htmlFor="promptKey">Respond to</label><select name="promptKey" id="promptKey">{promptKeys.filter((key) => introTarget[key]).map((key) => <option key={key} value={key}>{promptOptions[key]}</option>)}</select></div>
                <div className="field"><label htmlFor="intro-message">Your introduction</label><textarea id="intro-message" name="message" minLength={8} maxLength={500} required placeholder="I’d love to hear more about…" /></div>
              </div>
              <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setIntroTarget(null)}>Cancel</button><button className="button button-primary" disabled={busy}>Send introduction</button></div>
            </form>
          </section>
        </div>
      )}

      {photosTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="match-photos-title">
            <h2 id="match-photos-title">{photosTarget.displayName ?? "Member"}’s photos</h2>
            <ProfileGallery photos={photosTarget.photos} name={photosTarget.displayName ?? "Member"} onReport={(photo) => {
              setSafetyTarget({ ...photosTarget, evidenceKind: "PHOTO", evidenceRef: photo.id });
              setPhotosTarget(null);
            }} />
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setPhotosTarget(null)}>Close photos</button></div>
          </section>
        </div>
      )}

      {safetyTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSafetyTarget(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="safety-title">
            <h2 id="safety-title">{safetyTarget.evidenceKind ? `Report this ${safetyTarget.evidenceKind.toLowerCase()}` : `Safety options for ${safetyTarget.displayName ?? "this member"}`}</h2>
            {error && <p className="form-error" role="alert">{error}</p>}
            {safetyTarget.evidenceKind && <p>The moderation team will receive a copy of this item with your report.</p>}
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
