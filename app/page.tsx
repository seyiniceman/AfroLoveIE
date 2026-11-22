"use client";

import Link from "next/link";

function Mark() {
  return <span aria-hidden="true" className="brand-mark"><span>♥</span></span>;
}

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AfroIE Meet home">
          <Mark /> AfroIE Meet
        </Link>
        <nav className="toplinks" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/app">Sign in</Link>
          <Link className="button button-primary button-small" href="/app?signup=1">Join us</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">Dublin pilot · 18+</span>
          <h1 className="serif" id="hero-title">Meet someone who’s ready to build a life together.</h1>
          <p>Serious dating for Africans in Ireland and people open to building a life across cultures.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/app?signup=1">Create my profile</Link>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-note">
            <span aria-hidden="true">✓</span>
            <span>Thoughtful introductions, built around what matters to you.</span>
          </div>
        </div>
        <div className="hero-image">
          <img
            src="/images/couple-hero.svg"
            alt="An original illustration of two people smiling together, with their shoulders turned toward one another."
            fetchPriority="high"
          />
        </div>
      </section>

      <div className="trust-row" aria-label="Our approach">
        <div className="trust-pill"><span>01</span> Intentional connections</div>
        <div className="trust-pill"><span>02</span> Culture, on your terms</div>
        <div className="trust-pill"><span>03</span> Safety comes first</div>
      </div>

      <section className="how" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading">
          <span className="eyebrow">A slower, more thoughtful start</span>
          <h2 className="serif" id="how-title">A good conversation can start anywhere.</h2>
          <p>Share the parts of your story that feel right. Meet people who want the same kind of future, one thoughtful introduction at a time.</p>
        </div>
        <div className="steps">
          <article className="step-card">
            <span className="step-number">01</span>
            <h3>Show what matters</h3>
            <p>Build a profile with your own words, relationship intentions and the traditions or little things that make you, you.</p>
          </article>
          <article className="step-card">
            <span className="step-number">02</span>
            <h3>Send an introduction</h3>
            <p>Respond to something specific in a person’s profile. A kind, considered note is a better beginning than a swipe.</p>
          </article>
          <article className="step-card">
            <span className="step-number">03</span>
            <h3>Meet in the middle</h3>
            <p>If they accept, you become a match and can get to know one another in a private conversation.</p>
          </article>
        </div>
      </section>

      <section className="closing">
        <span className="eyebrow">Your next chapter starts with a hello</span>
        <h2 className="serif">Make room for something real.</h2>
        <p>For grown-up intentions, at your own pace.</p>
        <Link className="button button-primary" href="/app?signup=1">Create my profile</Link>
      </section>
      <footer className="footer">
        <Link className="brand" href="/"><Mark /> AfroIE Meet</Link>
        <span>Made for people building a life across cultures. Dublin, Ireland.</span>
      </footer>
    </main>
  );
}
