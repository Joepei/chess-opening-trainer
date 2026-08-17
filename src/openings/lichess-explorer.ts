export interface LichessExplorerResponse {
  opening?: {
    eco: string;
    name: string;
  };
}

export async function fetchLichessOpening(
  fen: string,
): Promise<LichessExplorerResponse | null> {
  try {
    const url = new URL("https://explorer.lichess.ovh/lichess");
    url.searchParams.set("fen", fen);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LichessExplorerResponse;
  } catch {
    return null;
  }
}
