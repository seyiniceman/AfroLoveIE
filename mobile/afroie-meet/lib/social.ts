import { supabase } from './supabase';
import type { Form } from './profile';

export type Person = { user_id: string; card: Form & { age: number; boosted?: boolean } };
export type Intro = { id: string; peer: string; name: string; kind: 'photo' | 'prompt'; choice: string; body: string };
export type Thread = { id: string; name: string };
export type Message = {
  id: number;
  sender: string;
  body: string | null;
  audio: string | null;
  status: string;
  warning: boolean;
  read_at?: string | null;
};
export type Filters = { min: number; max: number; km: number; intent: string; religion: string; origin: string; verified: boolean };
export type MemberSettings = {
  user_id: string;
  hidden: boolean;
  paused: boolean;
  notifications_enabled: boolean;
  push_token: string | null;
  push_platform: string | null;
  legal_accepted_at: string | null;
  age_confirmed: boolean;
};
export type BlockedUser = { peer: string; name: string };
export type Entitlements = {
  is_premium: boolean;
  expires: string | null;
  can_boost: boolean;
  next_boost_at: string | null;
  boosted_until: string | null;
  is_admin: boolean;
};
export type AdminSelfieItem = {
  user_id: string;
  email: string | null;
  name: string;
  date_of_birth: string | null;
  selfie_path: string;
  banned: boolean;
};
export type AdminReportItem = {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  peer_id: string | null;
  peer_name: string;
  peer_banned: boolean;
  thread_id: string | null;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed' | 'banned';
  created_at: string;
};
export type AdminDashboardData = {
  pending_selfies: AdminSelfieItem[];
  reports: AdminReportItem[];
};

export const defaults: Filters = { min: 18, max: 110, km: 0, intent: '', religion: '', origin: '', verified: true };
const centres: Record<string, [number, number]> = {
  Dublin: [53.35, -6.26],
  Cork: [51.9, -8.47],
  Galway: [53.27, -9.05],
  Limerick: [52.66, -8.63],
};

export function distance(a: string, b: string) {
  const from = centres[a.split(' ')[0]],
    to = centres[b.split(' ')[0]];
  if (!from || !to) return null;
  const rad = Math.PI / 180;
  const d =
    Math.sin(((to[0] - from[0]) * rad) / 2) ** 2 +
    Math.cos(from[0] * rad) * Math.cos(to[0] * rad) * Math.sin(((to[1] - from[1]) * rad) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(d))));
}

export function includesPerson(p: Person, filters: Filters, location: string) {
  const c = p.card,
    km = distance(location, c.location);
  return (
    c.age >= filters.min &&
    c.age <= filters.max &&
    (!filters.km || (km !== null && km <= filters.km)) &&
    (!filters.intent || filters.intent === c.intent) &&
    (!filters.religion || c.religion.toLowerCase().includes(filters.religion.trim().toLowerCase())) &&
    (!filters.origin || c.origin.toLowerCase().includes(filters.origin.trim().toLowerCase())) &&
    (!filters.verified || !!p.user_id) // member_cards admits only verified profiles.
  );
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const r = await supabase!.rpc(name, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
