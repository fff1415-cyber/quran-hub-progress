import { PLATFORM_BRAND } from "@/lib/tenant";

type Props = {
  compact?: boolean;
};

/** Platform branding for msht.io — text only, no tenant logo. */
export function PlatformBrandHeader({ compact = false }: Props) {
  return (
    <div className="text-center mb-8">
      <h1
        className={`display font-bold gold-text mb-2 ${compact ? "text-2xl md:text-3xl" : "text-4xl md:text-5xl"}`}
      >
        {PLATFORM_BRAND.name}
      </h1>
      <p className={`font-semibold text-foreground mb-1 ${compact ? "text-base" : "text-lg md:text-xl"}`}>
        {PLATFORM_BRAND.tagline}
      </p>
      <p className="text-muted-foreground text-sm">{PLATFORM_BRAND.subtitle}</p>
    </div>
  );
}
