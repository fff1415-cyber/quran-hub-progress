import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  logoUrl: string | null;
  brandName: string;
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
};

/** Tenant logo or neutral placeholder when none uploaded. */
export function TenantLogo({
  logoUrl,
  brandName,
  className,
  imgClassName = "w-full h-full object-contain",
  placeholderClassName,
}: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`شعار ${brandName}`}
        className={cn(imgClassName, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed border-primary/25 bg-primary/5 text-primary/60",
        placeholderClassName,
        className,
      )}
      aria-hidden
    >
      <Building2 className="w-1/2 h-1/2" />
    </div>
  );
}
