import {
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Inter,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Playfair_Display,
  Poppins,
  Source_Sans_3,
} from "next/font/google";

/**
 * The curated font catalogue a restaurant can name in websites.theme (font / bodyFont). Every name is
 * self-hosted through next/font so it renders its real face instead of falling back to Georgia or the
 * system font. Only the two faces the demo tenants use are preloaded; the rest carry `preload: false`,
 * and a browser only downloads a face a restaurant actually uses.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", axes: ["opsz"] });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-cormorant", display: "swap", preload: false });
const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-baskerville", display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-merriweather", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap", preload: false });

/** Class list for <html>: declares every catalogue variable. */
export const fontVariables = [
  inter, playfair, dmSerif, cormorant, baskerville, merriweather, lora, dmSans, manrope, poppins, sourceSans,
]
  .map((font) => font.variable)
  .join(" ");
