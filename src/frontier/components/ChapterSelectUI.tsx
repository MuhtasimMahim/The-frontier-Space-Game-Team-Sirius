import React from "react";
import {
  CHAPTERS,
  CREW_SIZE_MAX,
  CREW_SIZE_MIN,
  getChapter,
  tallyChapterVotes,
  type ChapterId,
} from "../game/chapters";
import { gameSim, type GameState } from "../game/simulation";
import { recommendedChapter } from "../game/storyline";

export const ChapterSelectUI: React.FC<{ state: GameState }> = ({ state }) => {
  const isCrew = state.playMode === "crew";
  const nextUp = recommendedChapter(state.campaignDone);
  const tally = tallyChapterVotes(state.crewVotes);
  const allVoted = isCrew && state.crewVotes.every((v) => v != null);
  const canStartCrew = isCrew && tally.winner != null && allVoted;

  return (
    <div className="absolute inset-0 z-50 flex flex-col p-6 md:p-10 select-none font-gotham text-white luna-gradient overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 my-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-extrabold tracking-widest uppercase text-[#7EE0B8]">
              {isCrew ? "Crew Vote" : "Solo Expedition"}
            </div>
            <h1 className="text-4xl md:text-5xl font-black mt-1">Choose Your Chapter</h1>
            <p className="text-sm text-[#DFE6FF] mt-2 max-w-xl">
              {isCrew
                ? "Every crew member votes for a playable chapter. Majority wins, then you brief and launch together."
                : "Pick a chapter and start when you’re ready. No vote needed in solo."}{" "}
              Chapters can be played in any order, but the story flows best from 1 to 4.
            </p>
          </div>
          <button
            onClick={() => gameSim.exitToTitle()}
            className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer"
          >
            ← Title
          </button>
        </div>

        {isCrew && (
          <div className="luna-panel rounded-[20px] p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#FFD166]">
                Crew Size
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: CREW_SIZE_MAX - CREW_SIZE_MIN + 1 }, (_, i) => {
                  const n = CREW_SIZE_MIN + i;
                  return (
                    <button
                      key={n}
                      onClick={() => gameSim.setCrewSize(n)}
                      className={`w-10 h-10 rounded-full font-black cursor-pointer ${
                        state.crewSize === n
                          ? "bg-[#7EE0B8] text-[#0F2A3A]"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {state.crewVotes.map((vote, seat) => (
                <div
                  key={seat}
                  className="rounded-[14px] bg-[#080C1A]/50 border border-white/10 p-3 flex flex-col gap-2"
                >
                  <div className="text-xs font-bold text-[#8FD3FF]">Crew Member {seat + 1}</div>
                  <div className="flex flex-wrap gap-2">
                    {CHAPTERS.filter((c) => c.status === "playable").map((c) => (
                      <button
                        key={c.id}
                        onClick={() => gameSim.castChapterVote(seat, c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                          vote === c.id
                            ? "bg-[#FFD166] text-[#0F2A3A]"
                            : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
                      >
                        {c.number != null ? `Ch. ${c.number}` : "Sandbox"}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#AAB6DC]">
                    {vote ? `Voted: ${getChapter(vote).title}` : "Waiting for vote…"}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/10">
              <div className="text-xs text-[#CFD8F7]">
                {tally.tied
                  ? `Tie between ${tally.tiedIds.map((id) => getChapter(id).title).join(" & ")} — revote or change a vote.`
                  : tally.winner
                    ? `Leading: ${getChapter(tally.winner).title} (${tally.counts[tally.winner]}/${tally.totalVotes})`
                    : "Cast votes to pick a chapter."}
              </div>
              <button
                disabled={!canStartCrew || !tally.winner}
                onClick={() => {
                  if (tally.winner) gameSim.startVotedChapter(tally.winner);
                }}
                className={`px-6 py-3 rounded-full font-extrabold text-sm uppercase tracking-wide cursor-pointer transition-all ${
                  canStartCrew && tally.winner
                    ? "bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] hover:scale-[1.02]"
                    : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
              >
                Start Winning Chapter →
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CHAPTERS.map((ch) => {
            const locked = ch.status !== "playable";
            const voteCount = isCrew ? (tally.counts[ch.id] ?? 0) : 0;
            const isWinner = isCrew && tally.winner === ch.id;
            const done = state.campaignDone.includes(ch.id);
            const isNext = !locked && nextUp === ch.id;

            return (
              <div
                key={ch.id}
                className={`luna-panel rounded-[20px] p-5 flex flex-col gap-3 border ${
                  isWinner
                    ? "border-[#7EE0B8]/60"
                    : isNext
                      ? "border-[#FFD166]/60"
                      : "border-white/10"
                } ${locked ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${
                      locked
                        ? "bg-white/10 text-[#AAB6DC]"
                        : "bg-[#7EE0B8]/20 text-[#7EE0B8] border border-[#7EE0B8]/40"
                    }`}
                  >
                    {ch.number != null ? `Chapter ${ch.number}` : "Sandbox"}
                    {locked ? " · Coming Soon" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {isCrew && !locked && voteCount > 0 && (
                      <span className="text-xs font-mono text-[#FFD166]">
                        {voteCount} vote{voteCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {done && (
                      <span className="text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full bg-[#7EE0B8] text-[#0F2A3A]">
                        ✓ Completed
                      </span>
                    )}
                    {isNext && (
                      <span className="text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full bg-[#FFD166] text-[#0F2A3A]">
                        Next up
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-black text-white">{ch.title}</h2>
                  <div className="text-xs text-[#8FD3FF] mt-0.5 font-mono">
                    {ch.campName} · {ch.siteName}
                  </div>
                </div>

                <p className="text-sm text-[#DFE6FF] leading-relaxed flex-1">{ch.summary}</p>

                {!isCrew && (
                  <button
                    disabled={locked}
                    onClick={() => enterSoloChapter(ch.id)}
                    className={`mt-1 w-full py-3 rounded-full font-extrabold text-sm uppercase tracking-wide cursor-pointer transition-all ${
                      locked
                        ? "bg-white/10 text-white/40 cursor-not-allowed"
                        : "bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0F2A3A] hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    {locked
                      ? "Locked"
                      : ch.id === "full"
                        ? "Choose Landing Site →"
                        : "Enter Chapter →"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function enterSoloChapter(id: ChapterId) {
  gameSim.enterChapter(id);
}
