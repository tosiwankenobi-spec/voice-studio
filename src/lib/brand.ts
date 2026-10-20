import { supabase } from "@/integrations/supabase/client";

export const BRAND_FONTS = ["Syne", "Plus Jakarta Sans", "Georgia", "Arial"] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

export type BrandKit = {
  primary: string;
  secondary: string;
  font: BrandFont;
  introText: string;
  outroText: string;
  cta: string;
  logoPath: string | null;
};

export const DEFAULT_BRAND: BrandKit = {
  primary: "#f5a524",
  secondary: "#1a1410",
  font: "Syne",
  introText: "",
  outroText: "",
  cta: "",
  logoPath: null,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Normalises user input into a safe brand kit (valid hex colours, known font, length limits). */
export function cleanBrand(input: Partial<BrandKit>): BrandKit {
  return {
    primary: HEX.test(input.primary ?? "") ? input.primary! : DEFAULT_BRAND.primary,
    secondary: HEX.test(input.secondary ?? "") ? input.secondary! : DEFAULT_BRAND.secondary,
    font: (BRAND_FONTS as readonly string[]).includes(input.font ?? "")
      ? (input.font as BrandFont)
      : DEFAULT_BRAND.font,
    introText: String(input.introText ?? "").slice(0, 80),
    outroText: String(input.outroText ?? "").slice(0, 80),
    cta: String(input.cta ?? "").slice(0, 80),
    logoPath: input.logoPath ?? null,
  };
}

/** Readable text colour (black or white) for a hex background. */
export function contrastText(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}

type Row = {
  primary_color: string;
  secondary_color: string;
  font: string;
  intro_text: string;
  outro_text: string;
  cta: string;
  logo_path: string | null;
};

export async function loadBrand(): Promise<{
  kit: BrandKit;
  logoUrl: string | null;
  saved: boolean;
}> {
  const { data, error } = await supabase.from("brand_kits").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return { kit: DEFAULT_BRAND, logoUrl: null, saved: false };
  const r = data as Row;
  const kit = cleanBrand({
    primary: r.primary_color,
    secondary: r.secondary_color,
    font: r.font as BrandFont,
    introText: r.intro_text,
    outroText: r.outro_text,
    cta: r.cta,
    logoPath: r.logo_path,
  });
  let logoUrl: string | null = null;
  if (kit.logoPath) {
    const s = await supabase.storage.from("clips").createSignedUrl(kit.logoPath, 3600);
    logoUrl = s.data?.signedUrl ?? null;
  }
  return { kit, logoUrl, saved: true };
}

export async function saveBrand(kit: BrandKit, logo?: File | null) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to save your brand kit.");
  let logoPath = kit.logoPath;
  if (logo) {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(logo.type))
      throw new Error("Logos must be PNG, JPG, WebP or SVG.");
    if (logo.size > 2 * 1024 * 1024) throw new Error("Logos must be under 2 MB.");
    const ext =
      logo.type === "image/svg+xml" ? "svg" : logo.type.split("/")[1]!.replace("jpeg", "jpg");
    const path = `${u.user.id}/brand/logo-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("clips").upload(path, logo, { contentType: logo.type });
    if (up.error) throw up.error;
    if (logoPath) await supabase.storage.from("clips").remove([logoPath]);
    logoPath = path;
  }
  const k = cleanBrand({ ...kit, logoPath });
  const { error } = await supabase
    .from("brand_kits")
    .upsert(
      {
        user_id: u.user.id,
        primary_color: k.primary,
        secondary_color: k.secondary,
        font: k.font,
        intro_text: k.introText,
        outro_text: k.outroText,
        cta: k.cta,
        logo_path: k.logoPath,
      },
      { onConflict: "user_id" },
    );
  if (error) throw error;
  return k;
}

export async function removeLogo(kit: BrandKit) {
  if (kit.logoPath) await supabase.storage.from("clips").remove([kit.logoPath]);
  return saveBrand({ ...kit, logoPath: null });
}
