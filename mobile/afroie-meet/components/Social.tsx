import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { intents } from '../lib/profile';
import {
  defaults,
  includesPerson,
  rpc,
  type Entitlements,
  type Filters,
  type Intro,
  type Message,
  type Person,
  type Thread,
} from '../lib/social';
import { Photo, Voice } from './ProfileMedia';
import { Button, Card, Field, Text, usePalette } from './ui';

function Sheet({ title, close, children }: PropsWithChildren<{ title: string; close: () => void }>) {
  const c = usePalette();
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 16, width: '100%', maxWidth: 570, alignSelf: 'center', padding: 24 }}
          >
            <Text accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32, fontWeight: '700' }}>
              {title}
            </Text>
            {children}
            <Button secondary title="Close" onPress={close} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Choice({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  change: (v: string) => void;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '600' }}>{label}</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden' }}>
        <Picker
          accessibilityLabel={label}
          selectedValue={value}
          onValueChange={change}
          dropdownIconColor={c.text}
          style={{ color: c.text, backgroundColor: c.card, minHeight: 48 }}
        >
          {options.map((item) => (
            <Picker.Item key={item.value} {...item} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function CardView({
  person,
  introduce,
  pass,
  busy,
}: {
  person: Person;
  introduce: () => void;
  pass: () => void;
  busy: boolean;
}) {
  const [index, setIndex] = useState(0);
  const c = usePalette();
  const p = person.card;
  return (
    <Card>
      {p.boosted && (
        <View style={{ alignSelf: 'flex-start', backgroundColor: c.coral, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Boosted Profile</Text>
        </View>
      )}
      <Photo path={p.photos[index]} large />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Button secondary title="Previous photo" disabled={index === 0} onPress={() => setIndex(index - 1)} />
        <Text>
          {index + 1}/{p.photos.length}
        </Text>
        <Button secondary title="Next photo" disabled={index === p.photos.length - 1} onPress={() => setIndex(index + 1)} />
      </View>
      <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '700' }}>
        {p.name}, {p.age}
      </Text>
      <Text>{p.location}</Text>
      <View style={{ alignSelf: 'flex-start', backgroundColor: c.gold, borderRadius: 28, paddingHorizontal: 14, paddingVertical: 5 }}>
        <Text style={{ color: '#2B1A12', fontWeight: '600' }}>{p.intent}</Text>
      </View>
      <Text>Religion · {p.religion}</Text>
      <Text>Origin · {p.origin}</Text>
      {p.answers[0] && (
        <View>
          <Text style={{ fontWeight: '700' }}>{p.answers[0].prompt}</Text>
          <Text>{p.answers[0].answer}</Text>
        </View>
      )}
      {p.voice ? <Voice preview user={person.user_id} path={p.voice} /> : <Text>No voice intro shared.</Text>}
      <Button title="Send Introduction" disabled={busy} onPress={introduce} />
      <Button secondary title="Pass" disabled={busy} onPress={pass} />
    </Card>
  );
}

type Dialog = 'filters' | 'intro' | 'report' | 'block' | 'unmatch' | null;
type Props = {
  tab: 'Home' | 'Likes' | 'Matches' | 'Chat';
  user: string;
  location: string;
  thread: Thread | null;
  entitlements: Entitlements | null;
  paused: boolean;
  openPaywall: () => void;
  openSafety: () => void;
  open: (t: Thread) => void;
  close: () => void;
};

export function Social({
  tab,
  user,
  location,
  thread,
  entitlements,
  paused,
  openPaywall,
  openSafety,
  open,
  close,
}: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [likes, setLikes] = useState<Intro[]>([]);
  const [matches, setMatches] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [older, setOlder] = useState(false);
  const [limit, setLimit] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(defaults);
  const [draft, setDraft] = useState<Filters>(defaults);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [target, setTarget] = useState<Person | null>(null);
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [audio, setAudio] = useState<string>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const revision = useRef(0);
  const alive = useRef(true);
  const chatId = tab === 'Chat' ? thread?.id : undefined;
  const storageKey = 'discovery-filters:' + user;
  const c = usePalette();
  const isPremium = Boolean(entitlements?.is_premium) || (limit !== null && limit < 0);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(storageKey)
      .then((x) => {
        if (live && x) setFilters({ ...defaults, ...JSON.parse(x) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storageKey]);

  const load = useCallback(async () => {
    const seq = ++revision.current;
    const current = () => alive.current && seq === revision.current;
    if (tab === 'Home') {
      const [p, n] = await Promise.all([rpc<Person[]>('member_cards'), rpc<number>('intro_balance')]);
      if (current()) {
        setPeople(p);
        setLimit(n);
      }
    } else if (tab === 'Likes') {
      const r = await rpc<Intro[]>('intro_inbox');
      if (current()) setLikes(r);
    } else if (chatId) {
      const r = await rpc<Message[]>('chat_history', { thread_id: chatId });
      void rpc('mark_thread_read', { thread_id: chatId }).catch(() => {});
      if (current()) {
        setMessages((prev) => {
          if (!r.length) return [];
          const prior = prev.filter((m) => m.id < r[0].id);
          return [...prior, ...r];
        });
        if (r.length >= 100) setOlder(true);
      }
    } else {
      const r = await rpc<Thread[]>('my_threads');
      if (current()) setMatches(r);
    }
  }, [tab, chatId]);

  useEffect(() => {
    const rev = revision;
    alive.current = true;
    setLoading(true);
    setMessages([]);
    setOlder(false);
    setMessage('');
    setAudio(undefined);
    setError('');
    setNotice('');
    const run = () =>
      load()
        .catch((e) => {
          if (alive.current) {
            setError(e.message);
            if (chatId) setMessages([]);
          }
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        });
    void run();
    const timer = setInterval(run, chatId ? 4000 : 15000);
    return () => {
      alive.current = false;
      rev.current++;
      clearInterval(timer);
    };
  }, [load, chatId]);

  function dismiss() {
    if (!locked.current) {
      setDialog(null);
      setError('');
    }
  }

  async function act(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('DAILY_LIMIT')) {
        setLimit(0);
        setDialog(null);
        openPaywall();
      } else {
        setError(msg);
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function discover(p: Person, action: 'pass' | 'intro') {
    const kind = choice.startsWith('photo:') ? 'photo' : 'prompt';
    const remaining = await rpc<number>('discover_action', {
      peer: p.user_id,
      action,
      kind: action === 'intro' ? kind : null,
      choice: action === 'intro' ? choice.slice(choice.indexOf(':') + 1) : null,
      note: action === 'intro' ? note.trim() : null,
    });
    revision.current++;
    setLimit(remaining);
    setPeople((prev) => prev.filter((x) => x.user_id !== p.user_id));
    setDialog(null);
    if (action === 'intro' && remaining === 0) {
      openPaywall();
    }
    setNotice(action === 'intro' ? 'Introduction sent.' : 'Profile passed.');
  }

  async function post(format: 'text' | 'voice') {
    await rpc('post_chat', { thread_id: chatId, format, content: format === 'text' ? message.trim() : audio });
    if (format === 'text') setMessage('');
    else setAudio(undefined);
    await load();
  }

  const effectiveFilters: Filters = isPremium
    ? filters
    : { ...filters, religion: '', origin: '', verified: true };
  const visible = people.filter((p) => includesPerson(p, effectiveFilters, location));
  const choices = target
    ? [
        ...target.card.photos.map((p, i) => ({ value: 'photo:' + p, label: 'Photo ' + (i + 1) })),
        ...target.card.answers.map((a) => ({ value: 'prompt:' + a.prompt, label: a.prompt })),
      ]
    : [];
  const visibleLikes = isPremium ? likes : likes.slice(0, 1);
  const lockedLikesCount = isPremium ? 0 : Math.max(0, likes.length - 1);

  return (
    <View style={{ gap: 16 }}>
      {loading && <ActivityIndicator />}
      {!!error && !dialog && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={{ fontWeight: '600' }}>{notice}</Text>}

      {tab === 'Home' && (
        <>
          {paused && (
            <Card>
              <Text style={{ fontWeight: '700', color: c.coral }}>Your profile is paused</Text>
              <Text>Unpause your profile in Settings to browse Discovery and send introductions.</Text>
            </Card>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <Text style={{ fontWeight: '600' }}>
              {limit === null ? 'Checking introductions…' : limit < 0 ? 'Unlimited introductions (Premium)' : limit + '/5 left today'}
            </Text>
            <Button
              secondary
              title={isPremium ? 'Weekly Boost' : 'Upgrade'}
              onPress={openPaywall}
            />
          </View>
          <Button
            secondary
            title="Filters"
            onPress={() => {
              setDraft(filters);
              setDialog('filters');
            }}
          />
          {!loading && !visible.length && <Text>No profiles match your filters right now.</Text>}
          {visible.map((p) => (
            <CardView
              key={p.user_id}
              person={p}
              busy={busy}
              pass={() => void act(() => discover(p, 'pass'))}
              introduce={() => {
                setError('');
                if (limit === 0) {
                  openPaywall();
                  return;
                }
                setTarget(p);
                setNote('');
                setChoice('');
                setDialog('intro');
              }}
            />
          ))}
        </>
      )}

      {tab === 'Likes' && (
        <>
          {!loading && !likes.length && <Text>No introductions yet.</Text>}
          {visibleLikes.map((i) => (
            <Card key={i.id}>
              <Text style={{ fontWeight: '700', fontSize: 20 }}>{i.name}</Text>
              {i.kind === 'photo' ? <Photo path={i.choice} /> : <Text style={{ fontWeight: '600' }}>{i.choice}</Text>}
              <Text>{i.body}</Text>
              <Button
                title="Accept introduction"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    const id = await rpc<string>('respond_intro', { intro: i.id, accept: true });
                    open({ id, name: i.name });
                  })
                }
              />
              <Button
                secondary
                title="Decline"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await rpc('respond_intro', { intro: i.id, accept: false });
                    await load();
                  })
                }
              />
            </Card>
          ))}
          {lockedLikesCount > 0 && (
            <Card>
              <Text style={{ fontWeight: '700', fontSize: 18 }}>
                +{lockedLikesCount} more {lockedLikesCount === 1 ? 'person' : 'people'} liked you
              </Text>
              <Text>Upgrade to Premium (€14.99/month) to see everyone who sent you an introduction right away.</Text>
              <Button title="See Who Liked You · Upgrade" onPress={openPaywall} />
            </Card>
          )}
        </>
      )}

      {(tab === 'Matches' || (tab === 'Chat' && !thread)) && (
        <>
          {!loading && !matches.length && <Text>No matches yet.</Text>}
          {matches.map((t) => (
            <Card key={t.id}>
              <Text style={{ fontWeight: '700', fontSize: 19 }}>{t.name}</Text>
              <Button title={'Chat with ' + t.name} onPress={() => open(t)} />
            </Card>
          ))}
        </>
      )}

      {tab === 'Chat' && thread && (
        <>
          <Button secondary title="All conversations" onPress={close} />
          <Text style={{ fontSize: 23, fontWeight: '700' }}>{thread.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['report', 'block', 'unmatch'] as const).map((a) => (
              <Button
                secondary
                key={a}
                title={a[0].toUpperCase() + a.slice(1)}
                onPress={() => {
                  setReason('');
                  setDialog(a);
                }}
              />
            ))}
            <Button secondary title="Safety Centre" onPress={openSafety} />
          </View>
          {older && messages.length > 0 && (
            <Button
              title="Earlier messages"
              onPress={() =>
                void act(async () => {
                  const r = await rpc<Message[]>('chat_history', { thread_id: thread.id, before_id: messages[0].id });
                  setOlder(r.length === 100);
                  setMessages((prev) => [...r, ...prev]);
                })
              }
            />
          )}
          {messages.map((m) => (
            <Card key={m.id}>
              <Text style={{ fontWeight: '600' }}>{m.sender === user ? 'You' : thread.name}</Text>
              {m.warning && m.sender !== user && (
                <Text accessibilityRole="alert" style={{ fontWeight: '700', color: c.coral }}>
                  Money safety warning. This message mentions money, crypto or gift cards. Keep your funds and financial details private.
                </Text>
              )}
              {m.body ? (
                <Text>{m.body}</Text>
              ) : m.status === 'sent' ? (
                <Voice thread={thread.id} user={user} path={m.audio!} preview />
              ) : (
                <Text>{m.status === 'pending' ? 'Voice note awaiting review.' : 'Voice note withheld.'}</Text>
              )}
              {m.sender === user && m.status === 'sent' && isPremium && m.read_at && (
                <Text style={{ fontSize: 12, opacity: 0.7 }}>
                  ✓ Read {new Date(m.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </Card>
          ))}
          {!isPremium && messages.some((m) => m.sender === user) && (
            <Button secondary title="Unlock Read Receipts with Premium" onPress={openPaywall} />
          )}
          <Field label="Message" value={message} multiline maxLength={2000} onChangeText={setMessage} />
          <Button title="Send message" disabled={busy || !message.trim()} onPress={() => void act(() => post('text'))} />
          <Voice key={thread.id} thread={thread.id} user={user} path={audio} change={setAudio} />
          {!!audio && <Button title="Send voice note" disabled={busy} onPress={() => void act(() => post('voice'))} />}
        </>
      )}

      {dialog && (
        <Sheet
          close={dismiss}
          title={
            {
              filters: 'Discovery filters',
              intro: 'Send introduction',
              report: 'Report this conversation',
              block: 'Block this member?',
              unmatch: 'End this match?',
            }[dialog]
          }
        >
          {!!error && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}

          {dialog === 'filters' && (
            <>
              {(['min', 'max'] as const).map((key) => (
                <View key={key}>
                  <Text>
                    {key === 'min' ? 'Minimum' : 'Maximum'} age · {draft[key]}
                  </Text>
                  <Slider
                    accessibilityLabel={key + ' age'}
                    minimumValue={18}
                    maximumValue={110}
                    step={1}
                    value={draft[key]}
                    minimumTrackTintColor={c.gold}
                    onValueChange={(v) =>
                      setDraft((f) => ({
                        ...f,
                        [key]: v,
                        ...(key === 'min' && v > f.max ? { max: v } : key === 'max' && v < f.min ? { min: v } : {}),
                      }))
                    }
                  />
                </View>
              ))}
              <Choice
                label="Distance (approximate city-centre distance)"
                value={String(draft.km)}
                options={[0, 10, 25, 50, 100, 200, 300].map((v) => ({ value: String(v), label: v ? v + ' km' : 'Any distance' }))}
                change={(v) => setDraft({ ...draft, km: Number(v) })}
              />
              <Choice
                label="Intent"
                value={draft.intent}
                options={['', ...intents].map((v) => ({ value: v, label: v || 'Any intention' }))}
                change={(intent) => setDraft({ ...draft, intent })}
              />

              <Card>
                <Text style={{ fontWeight: '700', color: c.gold }}>
                  Advanced Filters {isPremium ? '(Unlocked)' : '(Premium)'}
                </Text>
                {isPremium ? (
                  <>
                    <Field label="Religion" value={draft.religion} onChangeText={(religion) => setDraft({ ...draft, religion })} />
                    <Field
                      label="Origin country"
                      value={draft.origin}
                      onChangeText={(origin) => setDraft({ ...draft, origin })}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text>Verified only</Text>
                      <Switch
                        accessibilityLabel="Verified only"
                        value={draft.verified}
                        onValueChange={(verified) => setDraft({ ...draft, verified })}
                      />
                    </View>
                    <Text style={{ fontSize: 13, opacity: 0.75 }}>All profiles currently require verification to publish.</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 14, opacity: 0.8 }}>
                      Filter by Religion, Origin Country, and Verified Only with AfroIE Meet Premium (€14.99/month).
                    </Text>
                    <Button
                      title="Unlock Advanced Filters"
                      onPress={() => {
                        setDialog(null);
                        openPaywall();
                      }}
                    />
                  </>
                )}
              </Card>

              <Button title="Reset filters" secondary onPress={() => setDraft(defaults)} />
              <Button
                title="Apply filters"
                onPress={() =>
                  void act(async () => {
                    await AsyncStorage.setItem(storageKey, JSON.stringify(draft));
                    setFilters(draft);
                    setDialog(null);
                  })
                }
              />
            </>
          )}

          {dialog === 'intro' && target && (
            <>
              <Choice
                label="Comment on"
                value={choice}
                options={[{ value: '', label: 'Choose a photo or prompt' }, ...choices]}
                change={setChoice}
              />
              {choice.startsWith('photo:') && <Photo path={choice.slice(6)} />}
              {choice.startsWith('prompt:') && (
                <Text>{target.card.answers.find((a) => a.prompt === choice.slice(7))?.answer}</Text>
              )}
              <Field
                label="Your introduction (20 characters minimum)"
                multiline
                value={note}
                maxLength={1000}
                onChangeText={setNote}
              />
              <Button
                title="Send introduction now"
                disabled={busy || !choice || note.trim().replace(/\s+/g, ' ').length < 20}
                onPress={() => void act(() => discover(target, 'intro'))}
              />
            </>
          )}

          {(dialog === 'report' || dialog === 'block' || dialog === 'unmatch') && thread && (
            <>
              {dialog === 'report' ? (
                <Field label="Reason for reporting" multiline maxLength={1000} value={reason} onChangeText={setReason} />
              ) : (
                <Text>This ends your conversation with {thread.name}.</Text>
              )}
              <Button
                title={dialog === 'report' ? 'Submit report' : dialog === 'block' ? 'Confirm block' : 'Confirm unmatch'}
                disabled={busy || (dialog === 'report' && reason.trim().length < 3)}
                onPress={() =>
                  void act(async () => {
                    await rpc('thread_action', { thread_id: thread.id, action: dialog, reason });
                    setDialog(null);
                    if (dialog === 'report') setNotice('Report submitted for review.');
                    else close();
                  })
                }
              />
            </>
          )}
        </Sheet>
      )}
    </View>
  );
}
