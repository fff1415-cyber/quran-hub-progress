export type BrandThemeKey = "navy" | "navy_gradient" | "beige" | "olive";

export type BrandThemePreset = {
  key: BrandThemeKey;
  label: string;
  primary: string;
  secondary?: string;
  gradient: boolean;
};

export const BRAND_THEMES: BrandThemePreset[] = [
  { key: "navy", label: "كحلي", primary: "#1e3a5f", gradient: false },
  {
    key: "navy_gradient",
    label: "كحلي مدرج",
    primary: "#1e3a5f",
    secondary: "#2d5a87",
    gradient: true,
  },
  { key: "beige", label: "بيجي", primary: "#C9A227", gradient: false },
  { key: "olive", label: "زيتي", primary: "#4A5D23", gradient: false },
];

export function getBrandTheme(key: string | undefined | null): BrandThemePreset {
  return BRAND_THEMES.find((t) => t.key === key) ?? BRAND_THEMES[0];
}

export function isBrandThemeKey(key: string): key is BrandThemeKey {
  return BRAND_THEMES.some((t) => t.key === key);
}
