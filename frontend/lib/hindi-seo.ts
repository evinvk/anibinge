export interface HindiSeo {
  anilistId: number;
  title: string;
  note?: string;
}

// Curated list of anime confirmed to have a Hindi dub on ToonStream.
// Each title deep-links to its Anibinge anime page, where the Hindi audio
// toggle is available on the watch player.
export const HINDI_ANIME: HindiSeo[] = [
  { anilistId: 20, title: "Naruto" },
  { anilistId: 1735, title: "Naruto: Shippuden" },
  { anilistId: 101922, title: "Demon Slayer: Kimetsu no Yaiba" },
  { anilistId: 113415, title: "Jujutsu Kaisen" },
  { anilistId: 21459, title: "My Hero Academia" },
  { anilistId: 16498, title: "Attack on Titan" },
  { anilistId: 120120, title: "Tokyo Revengers" },
  { anilistId: 140960, title: "SPY x FAMILY" },
  { anilistId: 21087, title: "One-Punch Man" },
  { anilistId: 1535, title: "Death Note" },
  { anilistId: 5114, title: "Fullmetal Alchemist: Brotherhood" },
  { anilistId: 11757, title: "Sword Art Online" },
  { anilistId: 6702, title: "Fairy Tail" },
  { anilistId: 20605, title: "Tokyo Ghoul" },
  { anilistId: 1575, title: "Code Geass: Lelouch of the Rebellion" },
  { anilistId: 150672, title: "Oshi no Ko" },
  { anilistId: 101280, title: "That Time I Got Reincarnated as a Slime" },
  { anilistId: 116006, title: "The God of High School" },
  { anilistId: 151807, title: "Solo Leveling" },
  { anilistId: 101348, title: "Vinland Saga" },
  { anilistId: 21175, title: "Dragon Ball Super" },
  { anilistId: 269, title: "Bleach" },
  { anilistId: 21, title: "One Piece" },
  { anilistId: 136, title: "Hunter x Hunter" },
  { anilistId: 97938, title: "Boruto: Naruto Next Generations" },
  { anilistId: 813, title: "Dragon Ball Z" },
];

export const HINDI_ANIME_TITLES = HINDI_ANIME.map((h) => h.title);

export function findHindiByAnilistId(anilistId: number): HindiSeo | undefined {
  return HINDI_ANIME.find((h) => h.anilistId === anilistId);
}
