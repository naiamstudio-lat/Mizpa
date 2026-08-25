import { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { Capabilities } from './Capabilities';
import { Features } from './Features';
import { Process } from './Process';
import { Quote } from './Quote';
import { Pricing } from './Pricing';
import { CTAFinal } from './CTAFinal';
import { Footer } from './Footer';

export function Landing() {
  useEffect(() => {
    const handleScroll = () => {
      const img = document.querySelector('.hero-parallax-img') as HTMLElement;
      if (img) {
        img.style.transform = `translateY(${window.pageYOffset * 0.15}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Grid overlay */}
      <div className="fixed inset-0 grid-overlay pointer-events-none z-0" />

      <div className="relative z-10">
        <Navbar />
        <main className="pt-20">
          <Hero />
          <Capabilities />
          <Features />
          <Process />
          <Quote />
          <Pricing />
          <CTAFinal />
        </main>
        <Footer />
      </div>
    </>
  );
}
