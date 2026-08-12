import Image from "next/image";

const LOGO_WHITE = "https://i.postimg.cc/YCxYqJ8F/zad-logo-white.png";
const LOGO_COLOR = "https://i.postimg.cc/8zYqJq8F/zad-logo-color.png";

interface ZadLogoProps {
  variant?: "white" | "color";
  width?: number;
  height?: number;
  className?: string;
}

export default function ZadLogo({
  variant = "color",
  width = 120,
  height = 48,
  className = "",
}: ZadLogoProps) {
  const src = variant === "white" ? LOGO_WHITE : LOGO_COLOR;

  return (
    <Image
      src={src}
      alt="شعار جمعية الزاد"
      width={width}
      height={height}
      className={`object-contain ${className}`}
      priority
    />
  );
}
