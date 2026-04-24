import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Problem } from "@/components/landing/Problem";
import { WaitlistCTA } from "@/components/landing/WaitlistCTA";

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Pricing />
        <WaitlistCTA />
      </main>
      <Footer />
    </>
  );
}
