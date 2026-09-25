import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface CtaConfig {
  label: string;
  href: string;
  style?: "primary" | "outline" | "ghost" | "secondary" | "glass" | "inverse" | undefined;
}

const STYLE_MAP: Record<string, NonNullable<ButtonProps["variant"]>> = {
  primary: "primary",
  outline: "outline",
  ghost: "ghost",
  secondary: "secondary",
  glass: "glass",
  inverse: "inverse",
};

/** Section CTAs come from JSONB: style names map to variants, unknown → outline. */
export function CtaLink({ cta, size = "md" }: { cta: CtaConfig; size?: ButtonProps["size"] }) {
  const variant = STYLE_MAP[cta.style ?? "primary"] ?? "outline";
  const isExternal = /^https?:\/\//i.test(cta.href);
  if (isExternal) {
    return (
      <Button asChild variant={variant} size={size}>
        <a href={cta.href} target="_blank" rel="noreferrer noopener">
          {cta.label}
        </a>
      </Button>
    );
  }
  return (
    <Button asChild variant={variant} size={size}>
      <Link href={cta.href}>{cta.label}</Link>
    </Button>
  );
}
