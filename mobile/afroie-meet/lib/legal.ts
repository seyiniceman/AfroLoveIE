export type LegalDocKey = 'terms' | 'privacy' | 'guidelines';

export type LegalDoc = {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
};

export const legalDocs: Record<LegalDocKey, LegalDoc> = {
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: November 2026',
    sections: [
      {
        heading: '1. Eligibility (18+ Only)',
        body: 'AfroIE Meet is strictly for adults aged 18 and over living in or connected with Ireland. By creating an account, you confirm that you are at least 18 years old and that all registration details—including your date of birth and verification selfie—are truthful.',
      },
      {
        heading: '2. Account Verification & Conduct',
        body: 'Every member must verify their email, phone number, age, and live selfie before accessing Discovery. You agree to follow our Community Guidelines and not to impersonate others, solicit money, crypto, or gift cards, or harass any member.',
      },
      {
        heading: '3. Free & Premium Subscriptions',
        body: 'Free members may send up to 5 introductions per day (resetting at midnight Europe/Dublin time). AfroIE Meet Premium (€14.99/month) unlocks unlimited introductions, seeing everyone who liked you, advanced filters, read receipts, and one 30-minute profile boost every 7 days. Subscriptions are billed and managed through Apple App Store or Google Play via RevenueCat and renew automatically unless cancelled at least 24 hours before the end of the billing period.',
      },
      {
        heading: '4. Moderation & Account Termination',
        body: 'We may review reported conversations, voice-note transcripts, and verification selfies to keep the community safe. Accounts that breach these Terms or our Community Guidelines may be suspended or permanently banned without refund where permitted by Irish and EU law.',
      },
      {
        heading: '5. Governing Law',
        body: 'These Terms are governed by the laws of Ireland, without affecting mandatory EU consumer protection rights.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy (GDPR)',
    updated: 'Last updated: November 2026',
    sections: [
      {
        heading: '1. Data We Collect',
        body: 'We collect your account credentials (email, phone number), date of birth, live verification selfie, profile details, photos, optional voice intro, introductions, chat messages, voice notes, safety reports, and—if enabled—your Expo push notification token.',
      },
      {
        heading: '2. How We Use Your Data',
        body: 'We process your data under GDPR Article 6(1)(b) (contract performance) and Article 6(1)(f) (community safety and fraud prevention) to verify your identity, show your published profile to verified members, screen early messages and voice notes for contact-detail leaks or financial scams, and send notifications you opt into.',
      },
      {
        heading: '3. Private Media & Retention',
        body: 'Verification selfies are stored privately and are visible only to authorised safety reviewers—never to other members. Member photos and chat voice notes use private, time-limited signed URLs restricted by row-level security.',
      },
      {
        heading: '4. Your GDPR Rights',
        body: 'Under the EU GDPR and Irish Data Protection Act 2018, you have the right to access, export, rectify, restrict, and erase your personal data. You can export a full JSON copy of your data ("Download My Data") or permanently delete your account and all stored files ("Delete Account") at any time in Settings.',
      },
      {
        heading: '5. Supervisory Authority',
        body: 'If you have privacy concerns, you may contact the Data Protection Commission (DPC) of Ireland at dataprotection.ie.',
      },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    updated: 'Last updated: November 2026',
    sections: [
      {
        heading: 'Respect African & Afro-Caribbean Communities in Ireland',
        body: 'AfroIE Meet is a warm, intentional space for dating, friendship, and meaningful connection. Treat every member with dignity regardless of background, tribe, nationality, faith, or connection intention.',
      },
      {
        heading: 'Be Authentic',
        body: 'Use recent photos of yourself and truthful profile details. Your cover photo must clearly show your face. Catfishing, fake profiles, and AI-generated impersonation result in an immediate ban.',
      },
      {
        heading: 'Respect Boundaries',
        body: 'Write thoughtful introductions (no blank likes). If someone declines, unmatches, or asks you to stop, respect their decision immediately.',
      },
      {
        heading: 'Protect Privacy & Financial Safety',
        body: 'Keep phone numbers, emails, Instagram, and WhatsApp handles off your first ten chat messages. Never ask other members to send money, crypto, or gift cards—financial solicitation is strictly prohibited and triggers safety warnings and permanent bans.',
      },
      {
        heading: 'Report Harm',
        body: 'Use Report in any chat header to alert moderators, Block to end contact immediately, and the Safety Centre for Gardaí emergency contacts whenever you feel unsafe.',
      },
    ],
  },
};
