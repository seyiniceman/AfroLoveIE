import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "./home-tailwind.css";

export const metadata: Metadata = {
  title: "AfroIE Meet | Dating and friendship in Ireland",
  description: "Meet people for dating and friendship in Ireland’s African and Afro-Caribbean communities. Open to every background. Dublin pilot, ages 18 and over.",
};

const signup = "/app?signup=1";
const button = "inline-flex shrink-0 items-center justify-center gap-3 rounded-full bg-[#3D2A4A] font-semibold text-white no-underline transition-all hover:bg-[#2F2038] hover:scale-[1.02] motion-reduce:hover:scale-100 motion-reduce:transition-none";
const nav = "text-[#6B6B6B] no-underline hover:text-[#3D2A4A] hover:underline";
const grain = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#grain)"/></svg>`;

const steps = [
  ["Create your profile", "Confirm your email, add photos, and share what you're looking for. Preview your profile before you publish it."],
  ["Send an introduction", "Find people nearby who share your intentions. Reply to one of their prompts to start a conversation."],
  ["Chat when you match", "When your introduction is accepted, you can get to know each other in a private chat."],
];

const safety = [
  { title: "Control what you share.", text: "Preview your profile before publishing and pause discovery when you need a break.", icon: <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6" /> },
  { title: "Block or report.", text: "Block a member or report a specific profile, photo, or message for moderator review.", icon: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></> },
  { title: "Connect by mutual agreement.", text: "Private chat opens once the other member accepts your introduction.", icon: <path d="M20 5c-2-2-6-2-8 1-2-3-6-3-8-1-2 2-2 6 1 9l7 7 7-7c3-3 3-7 1-9Z" /> },
];

export default function HomePage() {
  return (
    <div className="afroie-home relative isolate min-h-screen bg-[#FDF8F4] text-[#1A1A1A]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(grain)}")` }} />
      </div>

      <header className="h-20 border-b border-solid border-[#F0E9E4]">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-2 px-3 sm:px-6">
          <Link href="/" aria-label="AfroIE Meet home" className="inline-flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold no-underline">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[#3D2A4A] text-sm text-white">♥</span>
            AfroIE Meet
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3 whitespace-nowrap text-sm sm:gap-6">
            <a href="#how-it-works" className={nav + " hidden md:inline"}>How it works</a>
            <a href="#safety" className={nav + " hidden md:inline"}>Safety</a>
            <Link href="/app" className={nav}>Sign in</Link>
            <Link href={signup} className={button + " h-10 px-5"}>Join us</Link>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="absolute w-[600px] h-[600px] rounded-full bg-[#FFE8D6] blur-[100px] top-[-150px] left-[-150px] opacity-70 -z-10 pointer-events-none" />
          <div aria-hidden="true" className="absolute w-[700px] h-[700px] rounded-full bg-[#F3E6FF] blur-[110px] top-[80px] right-[-200px] opacity-60 -z-10 pointer-events-none" />
          <div className="home-enter mx-auto flex max-w-[1280px] flex-col items-center justify-center gap-10 px-6 py-20 lg:flex-row lg:gap-20">
          <div className="w-full min-w-0 max-w-[520px]">
            <span className="inline-flex rounded-full bg-[#F3E6F0] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B5A7C]">Dublin pilot • 18+</span>
            <h1 id="hero-title" className="home-display m-0 mt-5 text-[40px] font-bold leading-[0.95] tracking-[-0.02em] md:text-[72px]">
              <span className="block">Dating and</span>{" "}
              <span className="block">connection,</span>{" "}
              <em className="block font-normal italic text-[#3D2A4A]">built for us</em>{" "}
              <span className="block">in Ireland.</span>
            </h1>
            <p className="m-0 mt-5 max-w-[420px] text-[18px] leading-[1.6] text-[#6B6B6B]">
              Meet people for dating and friendship. Centred on African and Afro-Caribbean communities in Ireland, and open to every background.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={signup} className={button + " h-[56px] px-7 text-[15px] shadow-[0_8px_20px_rgba(61,42,74,0.25)]"}>
                Create my profile <span aria-hidden="true">→</span>
              </Link>
              <a href="#how-it-works" className="text-sm font-medium text-[#3D2A4A] underline underline-offset-4">How it works</a>
            </div>
            <ul aria-label="Membership details" className="m-0 mt-5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-[#8A8A8A]">
              <li>✓ Email verification</li><li>• 18+ only</li><li>• Dublin pilot</li>
            </ul>
          </div>

          <figure className="group relative m-0 aspect-[540/620] w-full max-w-[540px] overflow-hidden rounded-[32px] shadow-[0_32px_80px_-20px_rgba(61,42,74,0.3)]">
            <img src="/images/dublin-canal-couple.webp" alt="A couple smiling at each other beside a Dublin canal." fetchPriority="high" className="absolute inset-0 size-full object-cover object-[50%_35%] motion-safe:transition-transform motion-safe:duration-[6000ms] motion-safe:ease-[ease] motion-safe:group-hover:scale-[1.03]" />
            <figcaption className="absolute bottom-4 left-4 grid gap-1 rounded-[14px] bg-white/90 px-[14px] py-3 text-[#3D2A4A] shadow-md backdrop-blur-[12px]">
              <strong className="text-[13px] font-semibold">✓ Email-verified profiles</strong>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6B6B]">
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                Dublin, IE
              </span>
            </figcaption>
          </figure>
          </div>
        </section>

        <div className="px-6">
          <section id="how-it-works" aria-labelledby="how-title" className="mx-auto max-w-[1280px] py-20">
            <h2 id="how-title" className="home-display m-0 mb-8 text-[42px] font-bold leading-tight">How AfroIE Meet works</h2>
            <ol className="m-0 grid list-none gap-5 p-0 md:grid-cols-3 [&>li]:border-solid [&_h3]:m-0 [&_p]:mb-0">
              {steps.map(([title, detail], index) => (
                <li key={title} className="bg-white border border-[#F0E9E4] rounded-[20px] p-[28px] min-h-[190px] shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] hover:-translate-y-[2px] transition-all duration-300 flex flex-col">
                  <span aria-hidden="true" className="mb-4 flex size-8 items-center justify-center rounded-full bg-[#3D2A4A] text-sm font-bold text-white">{index + 1}</span>
                  <h3 className="font-semibold text-[17px] text-[#1A1A1A]">{title}</h3>
                  <p className="text-[14px] text-[#6B6B6B] mt-[8px] leading-[1.6]">{detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="safety" aria-labelledby="safety-title" className="mx-auto mt-16 max-w-[1280px] text-white [&_p]:m-0">
            <div className="bg-gradient-to-br from-[#1A1024] to-[#2D1F3F] rounded-[24px] p-[40px] relative overflow-hidden flex flex-col md:flex-row justify-between gap-[40px]">
            <div aria-hidden="true" className="absolute w-[300px] h-[300px] bg-[#C9A96E] blur-[80px] opacity-[0.15] right-[-50px] top-[-50px] pointer-events-none" />
            <div>
              <h2 id="safety-title" className="home-display m-0 text-[28px] font-bold leading-tight">Your safety and privacy</h2>
              <Link href="/community-guidelines" className="mt-2 inline-block text-[13px] text-[#C9A96E] underline underline-offset-4">Read the community guidelines →</Link>
            </div>
            <ul className="m-0 flex max-w-[560px] list-none flex-col gap-[20px] p-0">
              {safety.map(({ title, text, icon }) => (
                <li key={title} className="flex items-start gap-3">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0 text-[#C9A96E]">{icon}</svg>
                  <p className="text-[14px] text-white/90 leading-[1.6]"><strong className="font-semibold">{title}</strong> {text}</p>
                </li>
              ))}
            </ul>
            </div>
          </section>
        </div>
      </main>

      <footer className="mx-auto mt-12 flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-solid border-[#F0E9E4] px-6 py-6 text-sm">
        <Link href="/" className="font-semibold no-underline">AfroIE Meet</Link>
        <Link href={signup} className="text-[#3D2A4A] underline-offset-4">Create my profile →</Link>
      </footer>
    </div>
  );
}

