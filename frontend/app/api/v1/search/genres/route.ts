import { NextResponse } from "next/server";

export async function GET() {
  const genres = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
    "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
    "Sports", "Supernatural", "Thriller", "Ecchi", "Mecha", "Music",
    "Seinen", "Shounen", "Shoujo", "Josei", "Kids", "Hentai", "Yuri", "Yaoi",
    "Historical", "Martial Arts", "Military", "Parody", "Samurai",
    "Space", "Super Power", "Vampire", "Harem", "Demons", "Game",
    "Cars", "Dementia", "Food", "Police", "Post-Apocalyptic",
    "School", "Sci-Fi Fantasy", "Suspense",
  ];
  return NextResponse.json({ data: genres });
}
