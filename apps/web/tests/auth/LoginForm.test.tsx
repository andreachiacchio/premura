import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/_components/LoginForm";

afterEach(cleanup);

describe("LoginForm", () => {
  it("renderizza form vuoto con label e bottone disabilitato", () => {
    render(<LoginForm errorCode={null} signInAction={vi.fn()} />);
    expect(screen.getByLabelText("La tua email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Invia link di accesso/i }),
    ).toBeDisabled();
  });

  it("submit con email valida chiama action e mostra conferma", async () => {
    const action = vi.fn(async (_email: string) => ({ ok: true as const }));
    const user = userEvent.setup();
    render(<LoginForm errorCode={null} signInAction={action} />);

    await user.type(screen.getByLabelText("La tua email"), "test@premura.it");
    await user.click(
      screen.getByRole("button", { name: /Invia link di accesso/i }),
    );

    await waitFor(() => {
      expect(action).toHaveBeenCalledWith("test@premura.it");
    });
    expect(
      await screen.findByText(/Ti abbiamo inviato un link/i),
    ).toBeInTheDocument();
    expect(screen.getByText("test@premura.it")).toBeInTheDocument();
  });

  it("se l'action ritorna error, mostra il messaggio inline e il form resta", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: "Invio non riuscito: rate limit",
    }));
    const user = userEvent.setup();
    render(<LoginForm errorCode={null} signInAction={action} />);

    await user.type(screen.getByLabelText("La tua email"), "x@y.com");
    await user.click(
      screen.getByRole("button", { name: /Invia link di accesso/i }),
    );

    expect(
      await screen.findByText("Invio non riuscito: rate limit"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("La tua email")).toBeInTheDocument();
  });

  it("errorCode=missing_code mostra alert italiano", () => {
    render(<LoginForm errorCode="missing_code" signInAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Link non valido, riprova",
    );
  });

  it("errorCode=exchange_failed mostra alert italiano", () => {
    render(<LoginForm errorCode="exchange_failed" signInAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sessione scaduta, riprova",
    );
  });

  it("errorCode sconosciuto fallback a messaggio generico", () => {
    render(<LoginForm errorCode="totally_unknown" signInAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Qualcosa e' andato storto",
    );
  });
});
