export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

interface ReactionsStore {
  counts: Record<string, Record<string, number>>;
  mine: Record<string, string>;
}

const KEY = "anibinge_comment_reactions_v1";

function load(): ReactionsStore {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      counts: parsed?.counts ?? {},
      mine: parsed?.mine ?? {},
    };
  } catch {
    return { counts: {}, mine: {} };
  }
}

function save(store: ReactionsStore) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

export function getCommentReactions(commentId: number): { counts: Record<string, number>; mine: string | null } {
  const store = load();
  return {
    counts: store.counts[String(commentId)] ?? {},
    mine: store.mine[String(commentId)] ?? null,
  };
}

export function toggleCommentReaction(commentId: number, emoji: ReactionEmoji): { counts: Record<string, number>; mine: string | null } {
  const store = load();
  const id = String(commentId);
  const counts = { ...(store.counts[id] ?? {}) };
  const mine = store.mine[id] ?? null;

  if (mine === emoji) {
    counts[emoji] = Math.max(0, (counts[emoji] ?? 0) - 1);
    if (counts[emoji] === 0) delete counts[emoji];
    delete store.mine[id];
  } else {
    if (mine && counts[mine]) {
      counts[mine] = Math.max(0, (counts[mine] ?? 0) - 1);
      if (counts[mine] === 0) delete counts[mine];
    }
    counts[emoji] = (counts[emoji] ?? 0) + 1;
    store.mine[id] = emoji;
  }
  store.counts[id] = counts;
  save(store);
  return { counts, mine: mine === emoji ? null : emoji };
}
