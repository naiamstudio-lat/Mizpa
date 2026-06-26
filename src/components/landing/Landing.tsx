import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { Logos } from './Logos';
import { HowItWorks } from './HowItWorks';
import { Features } from './Features';
import { Testimonials } from './Testimonials';
import { Pricing } from './Pricing';
import { FAQ } from './FAQ';
import { CTAFinal } from './CTAFinal';
import { Footer } from './Footer';

export function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <Logos />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTAFinal />
      <Footer />
    </>
  );
}