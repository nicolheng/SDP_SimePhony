import type { Photo } from "./types";

/** Photos the buyer took (the report and each reopen) vs. photos from the inspection, repair and verification. */
export const REPORT_PHOTO_KINDS: Photo["kind"][] = ["original", "reopen"];
export const WORK_PHOTO_KINDS: Photo["kind"][] = ["verdict", "repair", "verification"];

/** One attempt at fixing a defect: the buyer's report (or a reopen) and everything that followed it. */
export interface PhotoRound {
  n: number;
  startedAt: string;
  problem: Photo | null;
  repair: Photo | null;
  photos: Photo[];
}

/** Splits a case's photos (oldest first, as the API returns them) into rounds. Each reopen photo starts a new
 *  round: that covers both "still not fixed" on the buyer's verify page and reopening a closed case. */
export function photoRounds(photos: Photo[]): PhotoRound[] {
  const rounds: PhotoRound[] = [];
  for (const p of photos) {
    let round = rounds[rounds.length - 1];
    if (!round || p.kind === "reopen") {
      round = { n: rounds.length + 1, startedAt: p.at, problem: null, repair: null, photos: [] };
      rounds.push(round);
    }
    round.photos.push(p);
    if (!round.problem && (p.kind === "original" || p.kind === "reopen")) round.problem = p;
    if (p.kind === "repair") round.repair = p;
  }
  return rounds;
}
