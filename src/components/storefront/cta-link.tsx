import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/shared/utils";

export interface CtaConfig {
  label: string;
  href: string;
  style?: "primary" | "outline" | "ghost" | "secondary" | "glass" | "inverse" | "link" | undefined;
}

const STYLE_MAP: Record<string, NonNullable<ButtonProps["variant"]>> = {
  primary: "primary",
  outline: "outline",
  ghost: "ghost",
  secondary: "secondary",
  glass: "glass",
  inverse: "inverse",
  link: "link",
};

/** Section CTAs come from JSONB: style names map to variants, unknown → outline. */
export function CtaLink({
  cta,
  size = "md",
  className,
  arrow = false,
}: {
  cta: CtaConfig;
  size?: ButtonProps["size"];
  className?: string;
  /** a trailing arrow that travels on hover */
  arrow?: boolean;
}) {
  const variant = STYLE_MAP[cta.style ?? "primary"] ?? "outline";
  const isExternal = /^https?:\/\//i.test(cta.href);
  const content = (
    <>
      {cta.label}
      {arrow ? (
        <ArrowRight className="transition-transform duration-200 group-hover/cta:translate-x-1" aria-hidden />
      ) : null}
    </>
  );
  return (
    <Button asChild variant={variant} size={size} className={cn("group/cta", className)}>
      {isExternal ? (
        <a href={cta.href} target="_blank" rel="noreferrer noopener">
          {content}
        </a>
      ) : (
        <Link href={cta.href}>{content}</Link>
      )}
    </Button>
  );
}
