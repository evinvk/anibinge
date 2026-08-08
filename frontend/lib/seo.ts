const RAW_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun";
export const SITE_URL = RAW_SITE_URL.replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

/**
 * Stable, per-episode date derived from the series slug. Google requires an
 * uploadDate on VideoObject; using "today" on every episode looks like
 * auto-generated spam, so each episode gets a fixed, consistent date that
 * never flips between crawls. Used by watch-page JSON-LD AND the sitemap
 * lastmod so both signals agree.
 */
export function episodeUploadDate(slug: string, episode: number): string {
  let seed = 0;
  for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
  const epochDay = (seed + (episode - 1) * 3) % 1200;
  return new Date(Date.UTC(2022, 0, 1) + epochDay * 86400000).toISOString().split("T")[0];
}

export interface SeasonSeo {
  slug: string;
  season: string;
  year: number;
  label: string;
  intro: string;
}

export const SEASON_NAMES = ["winter", "spring", "summer", "fall"] as const;

function currentSeasonIndex(): number {
  const m = new Date().getMonth() + 1;
  if (m <= 2 || m === 12) return 0; // winter
  if (m <= 5) return 1; // spring
  if (m <= 8) return 2; // summer
  return 3; // fall
}

export function seasonLabel(season: string, year: number): string {
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

export function buildSeasonSlug(season: string, year: number): string {
  return `${season}-${year}`;
}

export function parseSeasonSlug(slug: string): { season: string; year: number } | null {
  const m = slug.toLowerCase().match(/^(winter|spring|summer|fall)-(\d{4})$/);
  if (!m) return null;
  return { season: m[1], year: parseInt(m[2]) };
}

const SEASON_INTROS: Record<string, string> = {
  winter: "Winter anime air from January through March. Discover the most popular shows of the winter lineup — new seasons, sequels, and hidden gems — all free to stream in HD on Anibinge.",
  spring: "Spring anime air from April through June. Explore the biggest premieres, returning favorites, and breakout hits of the spring season, all free to stream on Anibinge.",
  summer: "Summer anime air from July through September. From blockbuster sequels to fresh original series, catch every must-watch title of the summer lineup free on Anibinge.",
  fall: "Fall anime air from October through December. The season of heavy hitters — explore the highest-profile premieres and cult favorites of the fall lineup free on Anibinge.",
};

export function getSeasonPages(): SeasonSeo[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const curIdx = currentSeasonIndex();
  const pages: SeasonSeo[] = [];
  // 3 years back → 1 year ahead
  for (let y = currentYear - 3; y <= currentYear + 1; y++) {
    for (let s = 0; s < 4; s++) {
      const season = SEASON_NAMES[s];
      pages.push({
        slug: buildSeasonSlug(season, y),
        season,
        year: y,
        label: seasonLabel(season, y),
        intro: SEASON_INTROS[season],
      });
    }
  }
  // Move current season first
  pages.sort((a, b) => {
    const ka = a.year === currentYear && SEASON_NAMES.indexOf(a.season as any) === curIdx ? -1 : a.year * 10 + SEASON_NAMES.indexOf(a.season as any);
    const kb = b.year === currentYear && SEASON_NAMES.indexOf(b.season as any) === curIdx ? -1 : b.year * 10 + SEASON_NAMES.indexOf(b.season as any);
    return kb - ka;
  });
  return pages;
}

// Backwards-compatible request-time accessor.
export const SEASON_PAGES: SeasonSeo[] = getSeasonPages();

export interface StudioSeo {
  slug: string;
  name: string;
  intro: string;
}

export const STUDIO_PAGES: StudioSeo[] = [
  { slug: "ufotable", name: "Ufotable", intro: "Ufotable is celebrated for breathtaking sakuga animation and cinematic visuals, best known for the Demon Slayer series and the Fate franchise." },
  { slug: "mappa", name: "MAPPA", intro: "MAPPA is a studio known for high-energy action and bold visual style, behind hits like Jujutsu Kaisen, Attack on Titan's final seasons, and Chainsaw Man." },
  { slug: "studio-bones", name: "Bones", intro: "Bones produces acclaimed action and mecha series, including My Hero Academia, Fullmetal Alchemist: Brotherhood, and Mob Psycho 100." },
  { slug: "wit-studio", name: "WIT Studio", intro: "WIT Studio earned its reputation with Attack on Titan's early seasons, Vinland Saga, Spy x Family, and Great Pretender." },
  { slug: "madhouse", name: "Madhouse", intro: "Madhouse is one of anime's most storied studios, behind One Punch Man, Hunter x Hunter, Death Note, and Paprika." },
  { slug: "kyoto-animation", name: "Kyoto Animation", intro: "Kyoto Animation, or KyoAni, is beloved for meticulous production values and heartfelt series like Violet Evergarden, K-On!, and Hibike! Euphonium." },
  { slug: "studio-ghibli", name: "Studio Ghibli", intro: "Studio Ghibli creates hand-drawn animated masterpieces such as Spirited Away, My Neighbor Totoro, and Princess Mononoke." },
  { slug: "a-1-pictures", name: "A-1 Pictures", intro: "A-1 Pictures produces major hits including Sword Art Online, Your Lie in April, and Kaguya-sama: Love Is War." },
  { slug: "cloverworks", name: "CloverWorks", intro: "CloverWorks is known for polished visuals and beloved series like Spy x Family, Bocchi the Rock!, and Horimiya." },
  { slug: "aniplex", name: "Aniplex", intro: "Aniplex is a major production and distribution company behind flagship franchises including Demon Slayer, Fate, and Sword Art Online." },
  { slug: "toei-animation", name: "Toei Animation", intro: "Toei Animation is behind legendary long-running franchises: One Piece, Dragon Ball, Sailor Moon, and Digimon." },
  { slug: "pierrot", name: "Pierrot", intro: "Pierrot, or Studio Pierrot, produced anime classics like Naruto, Bleach, and Yu Yu Hakusho." },
  { slug: "shaft", name: "Shaft", intro: "Shaft is famed for its distinctive visual direction in Monogatari series, Madoka Magica, and March Comes in Like a Lion." },
  { slug: "feel", name: "feel.", intro: "feel. is a studio known for romantic dramas and character-focused series like My Youth Romantic Comedy Is Wrong, As I Expected." },
  { slug: "j-c-staff", name: "J.C.Staff", intro: "J.C.Staff has produced hundreds of series across genres, from A Certain Scientific Railgun to Toradora!." },
  { slug: "silver-link", name: "Silver Link.", intro: "Silver Link. is known for Chivalry of a Failed Knight and the Is It Wrong to Try to Pick Up Girls in a Dungeon? franchise." },
  { slug: "david-production", name: "David Production", intro: "David Production brought JoJo's Bizarre Adventure to life and delivered Fire Force and Cells at Work!." },
  { slug: "trigger", name: "Studio Trigger", intro: "Studio Trigger is famous for over-the-top, high-energy originals like Kill la Kill, Promare, and Cyberpunk: Edgerunners." },
  { slug: "science-saru", name: "Science SARU", intro: "Science SARU is an experimental studio behind Devilman Crybaby, Scott Pilgrim Takes Off, and Keep Your Hands Off Eizouken!" },
  { slug: "sunrise", name: "Sunrise", intro: "Sunrise defined the mecha genre with Gundam, and created Code Geass, Cowboy Bebop, and Love Live!" },
  { slug: "p-a-works", name: "P.A. Works", intro: "P.A. Works is known for gorgeous backgrounds and heartfelt stories like Angel Beats!, Shirobako, and Frieren." },
  { slug: "studio-deen", name: "Studio Deen", intro: "Studio Deen produced early classics including Ranma ½, Fruits Basket, and Hetalia." },
  { slug: "eight-bit", name: "8bit", intro: "8bit (Eight Bit) is known for The Eminence in Shadow, That Time I Got Reincarnated as a Slime, and Blue Lock." },
  { slug: "tms-entertainment", name: "TMS Entertainment", intro: "TMS Entertainment has a deep history spanning Detective Conan, Lupin III, and Dr. STONE." },
  { slug: "lerche", name: "Lerche", intro: "Lerche produced series like Assassination Classroom, Danganronpa, and Classroom of the Elite." },
  { slug: "craft-beast", name: "craft beast", intro: "craft beast is a newer studio behind the acclaimed Handyman Saitou in Another World." },
  { slug: "lidenfilms", name: "LIDENFILMS", intro: "LIDENFILMS has produced a wide range of series including Rurouni Kenshin, Blade of the Immortal, and Tokyo Revengers." },
  { slug: "studio-a-cat", name: "Studio A-CAT", intro: "Studio A-CAT produced series like Overtake! and High Card." },
  { slug: "project-no-9", name: "Project No.9", intro: "Project No.9 is known for romantic comedies and isekai like The Genius Prince's Guide to Raising a Nation Out of Debt." },
  { slug: "studio-signpost", name: "Studio Signpost", intro: "Studio Signpost produced series including Kotaro Lives Alone and The Vampire Dies in No Time." },
];

export function slugifyStudio(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function findStudioBySlug(slug: string): StudioSeo | undefined {
  return STUDIO_PAGES.find((s) => s.slug === slug);
}
