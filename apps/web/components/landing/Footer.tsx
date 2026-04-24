import { Container } from "@/components/Container";

export function Footer() {
  return (
    <footer className="py-10 border-t border-line-soft">
      <Container>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full bg-terracotta"
            />
            <span className="font-serif text-h4 text-ink">Premura</span>
            <span className="text-body-sm text-ink-mute">· Fatto a Napoli.</span>
          </div>
          <p className="text-body-sm text-ink-mute">© 2026 Premura</p>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
