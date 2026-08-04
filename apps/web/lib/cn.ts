import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// 04/08: i token font-size custom (@theme in globals.css) non matchano
// il pattern t-shirt di tailwind-merge, che li classificava come COLORI:
// text-body dopo text-white faceva sparire text-white dai bottoni
// (verificato: primary e accent rendevano senza colore testo). La
// classGroup dichiara la scala tipografica del design system.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "eyebrow",
            "body-sm",
            "body",
            "body-lg",
            "h4",
            "h3",
            "h2",
            "h1",
            "display",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export default cn;
