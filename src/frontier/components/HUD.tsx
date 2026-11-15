import { BASES, NETWORK } from "../game/network";
import React from "react";
import { CONFIG, UI_COLORS, type ModuleId } from "../game/config";
import {
  DOCK,
  HAB_DOOR,
  ORIENT_CONSOLE,
  SOLAR_FIELD,
  SOLAR_TRACKER,
  gameSim,
  type GameState,
} from "../game/simulation";
import { coachForState } from "../game/coach";
import { projectRadarBlip, remainingStarterPanels } from "../game/rules";
import {
  STORY,
  STORY_CHAPTERS,
  describeStep,
  isStoryChapter,
  packsReady,
  type StoryChapterDef,
} from "../game/storyline";

/** Chapter-specific readouts under the rover stats (Chapters 2–4 only). */
const StoryStatus: React.FC<{ state: GameState; def: StoryChapterDef }> = ({ state, def }) => {
  const s = state.story;
  const rows: { label: string; value: string; color: string }[] = [];
  if (def.id === "chapter2") {
    rows.push(
      { label: "Solar Tower", value: `${s.stagesBuilt} / 3 stages`, color: UI_COLORS.energy },
      { label: "Packs ready", value: `${packsReady(s)}`, color: UI_COLORS.text },
      {
        label: "Packs in rover",
        value: `${s.packsCarried} / ${STORY.ROVER_PACK_CAP}`,
        color: UI_COLORS.water,
      },
      {
        label: "Hopper cargo",
        value: `${s.packsLoaded} / ${STORY.PACK_TOTAL}`,
        color: UI_COLORS.good,
      },
    );
  } else if (def.id === "chapter3") {
    rows.push(
      {
        label: "Earth link",
        value: s.linkLocked ? "Locked" : s.aiming ? "Aiming…" : "Offline",
        color: s.linkLocked ? UI_COLORS.good : UI_COLORS.textDim,
      },
      {
        label: "Solar storm",
        value:
          s.stormTimer > 0
            ? `Active ${Math.ceil(s.stormTimer)}s`
            : s.stormCountdown > 0
              ? `In ${Math.ceil(s.stormCountdown)}s`
              : s.stormCountdown === 0
                ? "Passed"
                : "Quiet",
        color: s.stormTimer > 0 || s.stormCountdown > 0 ? UI_COLORS.bad : UI_COLORS.textDim,
      },
    );
    if (s.stormDose > 0)
      rows.push({
        label: "Storm exposure",
        value: `${Math.round(s.stormDose)}s`,
        color: UI_COLORS.oxygen,
      });
  } else {
    rows.push(
      {
        label: "Ice map",
        value: s.iceRevealed ? "Radar found ice" : "Unknown",
        color: s.iceRevealed ? UI_COLORS.water : UI_COLORS.textDim,
      },
      {
        label: "Lights & heaters",
        value: s.roverUpgraded ? "Fitted" : "Not fitted",
        color: s.roverUpgraded ? UI_COLORS.good : UI_COLORS.textDim,
      },
    );
  }
  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-white/10 text-[13px]">
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: def.accent }}>
        {def.campName}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between">
          <span style={{ color: UI_COLORS.textDim }}>{r.label}</span>
          <span className="font-bold font-mono-num" style={{ color: r.color }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/** Chapter 3 dish aiming: crosshair and signal meter with the lock threshold marked. */
const AimOverlay: React.FC<{ signal: number }> = ({ signal }) => {
  const ok = signal >= STORY.AIM_LOCK_SIGNAL;
  const color = ok ? UI_COLORS.good : signal >= 50 ? UI_COLORS.energy : UI_COLORS.bad;
  return (
    <>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24">
        <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: color }} />
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/40" />
        <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/40" />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 top-[62%] w-[360px] flex flex-col items-center gap-1.5">
        <div className="text-[13px] font-bold tracking-widest uppercase text-stroke-world">
          Earth signal <span style={{ color }}>{signal}%</span>
        </div>
        <div className="relative w-full h-3 rounded-full bg-[#080C1A]/80 border border-white/15 overflow-hidden">
          <div
            className="h-full transition-all duration-150"
            style={{ width: `${signal}%`, backgroundColor: color }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white"
            style={{ left: `${STORY.AIM_LOCK_SIGNAL}%` }}
          />
        </div>
        <div className="text-[12px] text-white/80 text-stroke-world">
          A/D turn · W/S tilt · {ok ? "Hold E to lock!" : "find the bright Earth"} · Space to step
          away
        </div>
      </div>
    </>
  );
};

export const HUD: React.FC<{ state: GameState }> = ({ state }) => {
  const story = isStoryChapter(state.missionMode) ? STORY_CHAPTERS[state.missionMode] : null;
  const coach = coachForState(state);
  // Current mission objective text
  let missionText = "";
  switch (state.stage) {
    case "orient":
      missionText = CONFIG.MISSION_TEXTS.orient;
      break;
    case "panels": {
      const needed = remainingStarterPanels(state.panelsInstalled);
      const ch1Starter =
        state.missionMode === "chapter1" && !state.chapter1Completed && state.panelsInstalled < 3;
      missionText =
        !ch1Starter && state.panelsInstalledToday >= CONFIG.PANELS_PER_DAY
          ? `Daily panel limit (${CONFIG.PANELS_PER_DAY}) reached — wait for sunrise to deploy ${needed} more`
          : CONFIG.MISSION_TEXTS.installPanels.replace("{n}", `${needed}`);
      break;
    }
    case "align_panels":
      missionText = CONFIG.MISSION_TEXTS.alignPanels;
      break;
    case "board_rover":
      missionText = CONFIG.MISSION_TEXTS.boardRover;
      break;
    case "find_ice":
      missionText = CONFIG.MISSION_TEXTS.findIce;
      break;
    case "unload":
      missionText = CONFIG.MISSION_TEXTS.unloadWater;
      break;
    case "build_A":
      missionText = CONFIG.MISSION_TEXTS.buildA;
      break;
    case "enter_airlock":
      missionText = CONFIG.MISSION_TEXTS.enterAirlock;
      break;
    case "build_B":
      missionText = CONFIG.MISSION_TEXTS.buildB;
      break;
    case "build_C":
      missionText = CONFIG.MISSION_TEXTS.buildC;
      break;
    case "done":
      missionText = CONFIG.MISSION_TEXTS.won;
      break;
  }

  const storyLine = story ? describeStep(story, state.story, state) : null;
  if (storyLine) missionText = storyLine.text;

  // Critical rover overrides & active module construction text
  const buildingMod = Object.values(state.modules).find((m) => m.status === "building");
  if (state.rover.damage >= CONFIG.ROVER.maxDamage) {
    missionText = CONFIG.MISSION_TEXTS.roverBroken;
  } else if (state.rover.battery <= 0 && state.dockState === "empty") {
    missionText = CONFIG.MISSION_TEXTS.batteryEmpty;
  } else if (buildingMod) {
    missionText = CONFIG.MISSION_TEXTS.building
      .replace("{name}", buildingMod.def.displayName)
      .replace("{days}", `${buildingMod.daysLeft}`);
  }

  const originX = state.player.inRover ? state.rover.x : state.player.x;
  const originZ = state.player.inRover ? state.rover.z : state.player.z;
  // Camera view heading: rotates radar with camera view (GTA-style)
  const cameraHeading = state.cameraHeading ?? (state.player.inRover ? state.rover.rotation : Math.PI);
  const homeBlip = projectRadarBlip(originX, originZ, DOCK.x, DOCK.z, cameraHeading);

  const stageTarget = story
    ? gameSim.storyTarget()
    : state.stage === "orient"
      ? ORIENT_CONSOLE
      : state.stage === "panels"
        ? SOLAR_FIELD
        : state.stage === "align_panels"
          ? SOLAR_TRACKER
          : state.stage === "board_rover"
            ? state.rover
            : state.stage === "build_A"
              ? { x: 20, z: -10 }
              : state.stage === "enter_airlock"
                ? HAB_DOOR
                : null;
  const objectiveBlip = stageTarget
    ? projectRadarBlip(originX, originZ, stageTarget.x, stageTarget.z, cameraHeading)
    : null;
  const visibleModules: ModuleId[] =
    story || (state.missionMode === "chapter1" && !state.chapter1Completed)
      ? ["A"]
      : ["A", "B", "C"];

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden text-white font-gotham text-sm">
      {/* ============================================================== */}
      {/* LEFT COLUMN: RESOURCES (Width: 330px, Pos: 12px, 12px)        */}
      {/* ============================================================== */}
      <div className="absolute left-3 top-3 w-[330px] flex flex-col gap-2">
        {/* Resources Panel */}
        <div
          className="rounded-[10px] p-2.5 flex flex-col gap-1 border border-white/5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: UI_COLORS.panelAlpha }}
        >
          {/* Energy Row */}
          <div className="h-[26px] flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-[4px] flex items-center justify-center text-[11px] font-black text-[#080C1A]"
                style={{ backgroundColor: UI_COLORS.energy }}
              >
                ⚡
              </span>
              <span className="font-medium text-[15px] text-white">Power</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-[18px] text-white font-mono-num">
                {Math.round(state.energy)}
              </span>
              <span
                className="font-medium text-[13px] w-14 text-right font-mono-num"
                style={{
                  color:
                    state.dailyEnergyDelta > 0
                      ? UI_COLORS.good
                      : state.dailyEnergyDelta < 0
                        ? UI_COLORS.bad
                        : UI_COLORS.neutral,
                }}
              >
                {state.dailyEnergyDelta > 0 ? `+${state.dailyEnergyDelta}` : state.dailyEnergyDelta}
                /d
              </span>
            </div>
          </div>

          {/* Water Row */}
          <div className="h-[26px] flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black text-[#080C1A]"
                style={{ backgroundColor: UI_COLORS.water }}
              >
                💧
              </span>
              <span className="font-medium text-[15px] text-white">Water</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-[18px] text-white font-mono-num">
                {Math.round(state.water)}
              </span>
              <span
                className="font-medium text-[13px] w-14 text-right font-mono-num"
                style={{
                  color:
                    state.dailyWaterDelta > 0
                      ? UI_COLORS.good
                      : state.dailyWaterDelta < 0
                        ? UI_COLORS.bad
                        : UI_COLORS.neutral,
                }}
              >
                {state.dailyWaterDelta > 0 ? `+${state.dailyWaterDelta}` : state.dailyWaterDelta}
                /d
              </span>
            </div>
          </div>

          {/* Food Row */}
          <div className="h-[26px] flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-[2px] rotate-45 flex items-center justify-center text-[9px] font-black text-[#080C1A]"
                style={{ backgroundColor: UI_COLORS.food }}
              >
                <span className="-rotate-45">🌱</span>
              </span>
              <span className="font-medium text-[15px] text-white">Food</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-[18px] text-white font-mono-num">
                {Math.round(state.food)}
              </span>
              <span
                className="font-medium text-[13px] w-14 text-right font-mono-num"
                style={{
                  color:
                    state.dailyFoodDelta > 0
                      ? UI_COLORS.good
                      : state.dailyFoodDelta < 0
                        ? UI_COLORS.bad
                        : UI_COLORS.neutral,
                }}
              >
                {state.dailyFoodDelta > 0 ? `+${state.dailyFoodDelta}` : state.dailyFoodDelta}
                /d
              </span>
            </div>
          </div>
        </div>

        {/* Modules Panel (Habitat, Farm, Lab) */}
        <div
          className="rounded-[10px] p-2.5 flex flex-col gap-2 border border-white/5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: UI_COLORS.panelAlpha }}
        >
          {visibleModules.map((id) => {
            const mod = state.modules[id];
            const def = mod.def;

            let statusLabel = "Locked";
            let statusColor = UI_COLORS.neutral;

            if (mod.status === "available") {
              statusLabel = "Available";
              statusColor = UI_COLORS.good;
            } else if (mod.status === "building") {
              statusLabel = `Building (${mod.daysLeft}d left)`;
              statusColor = UI_COLORS.energy;
            } else if (mod.status === "active") {
              statusLabel = "Active";
              statusColor = UI_COLORS.good;
            } else if (mod.status === "damaged") {
              statusLabel = "Damaged: hold R";
              statusColor = UI_COLORS.bad;
            } else if (mod.status === "paused") {
              statusLabel = "Standby";
              statusColor = UI_COLORS.oxygen;
            }

            const buildProgress =
              mod.status === "building"
                ? 1 - mod.daysLeft / def.buildDays
                : mod.status === "active"
                  ? 1
                  : 0;

            return (
              <div key={id} className="flex flex-col gap-1 py-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[15px] text-white">{def.displayName}</span>
                  <span className="font-semibold text-[13px]" style={{ color: statusColor }}>
                    {statusLabel}
                  </span>
                </div>

                {/* Progress bar during building */}
                {mod.status === "building" && (
                  <div className="w-full h-1.5 bg-[#080C1A] rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.round(buildProgress * 100)}%`,
                        backgroundColor: UI_COLORS.energy,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* NETWORK PANEL (hidden during self-contained Chapter 1 vertical slice) */}
      {(state.missionMode === "full" || state.chapter1Completed) && (
        <div
          className="absolute left-4 bottom-[200px] w-[250px] pointer-events-auto rounded-[10px] p-2.5 flex flex-col gap-1.5 border border-white/5 shadow-2xl backdrop-blur-md text-[12px]"
          style={{ backgroundColor: UI_COLORS.panelAlpha }}
        >
          <div className="flex justify-between font-bold" style={{ color: UI_COLORS.textDim }}>
            <span>BASE NETWORK</span>
            <span style={{ color: state.networkStreak > 0 ? UI_COLORS.good : UI_COLORS.textDim }}>
              {state.networkOpen
                ? `Running ${state.networkStreak}/${NETWORK.WIN_STREAK_DAYS}d`
                : "Locked"}
            </span>
          </div>
          {BASES.map((b) => {
            const bs = state.bases.find((x) => x.id === b.id)!;
            const on = state.baseOnline[b.id];
            const color =
              bs.built === 0 ? UI_COLORS.neutral : on ? UI_COLORS.good : UI_COLORS.energy;
            return (
              <div key={b.id} className="flex items-center justify-between gap-2" title={b.role}>
                <span className="truncate" style={{ color: UI_COLORS.text }}>
                  {b.label}
                </span>
                <span className="shrink-0 font-bold" style={{ color }}>
                  {bs.built}/3 {bs.built === 0 ? "" : on ? "ON" : "OFF"}
                </span>
              </div>
            );
          })}
          {state.networkOpen && (
            <div style={{ color: UI_COLORS.textDim }}>
              Daily flow: {state.networkFlow.energy >= 0 ? "+" : ""}
              {state.networkFlow.energy}E · +{state.networkFlow.water}W · +{state.networkFlow.food}F
              {state.commLinkDown > 0 && (
                <div style={{ color: UI_COLORS.bad }}>Earth link down ({state.commLinkDown}d)</div>
              )}
            </div>
          )}
          {!state.networkOpen && (
            <div style={{ color: UI_COLORS.textDim }}>
              Finish Habitat A and 3 solar panels to unlock.
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TOP CENTER: DAY COUNTER & MISSION OBJECTIVES (Width: 460px)   */}
      {/* ============================================================== */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-[460px] flex flex-col items-center gap-1.5 text-center">
        {/* Shortage Alert Banner (if any) */}
        {state.shortageDays > 0 && (
          <div
            className="w-full py-1.5 px-3 rounded-lg text-white font-bold text-sm tracking-wide shadow-lg animate-pulse"
            style={{ backgroundColor: UI_COLORS.bad }}
          >
            RESOURCE DEPLETED: Day {state.shortageDays}. Failure in{" "}
            {CONFIG.SHORTAGE_DAYS_TO_LOSE - state.shortageDays} days!
          </div>
        )}

        {/* Random event banner: grey = forecast, red = active */}
        {state.eventBanner && (
          <div
            className="order-last w-full py-1.5 px-3 rounded-lg text-white text-[13px] shadow-lg"
            style={{
              backgroundColor:
                state.eventBanner.phase === "active" ? UI_COLORS.bad : UI_COLORS.disabled,
            }}
          >
            <div className="font-bold">{state.eventBanner.title}</div>
            <div className="text-white/80 text-[12px]">{state.eventBanner.edu}</div>
          </div>
        )}

        {/* Day Panel */}
        <div
          className="w-full rounded-[10px] py-2 px-3 border border-white/5 shadow-2xl backdrop-blur-md flex flex-col gap-1"
          style={{ backgroundColor: UI_COLORS.panelAlpha }}
        >
          {/* Day Title */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[26px] font-bold text-white tracking-wider font-nunito">
              Day {state.day}
            </span>
            {!story && (
              <span className="text-[15px] text-white/50 font-normal">/ {CONFIG.TOTAL_DAYS}</span>
            )}
          </div>

          {/* Landing Site Name + Save Checkpoint */}
          <div className="flex items-center justify-center gap-2">
            <span
              className="text-[13px] font-medium uppercase tracking-wider"
              style={{ color: UI_COLORS.textDim }}
            >
              {story
                ? `${story.campName} · ${story.latitudeLabel}`
                : state.missionMode === "chapter1" && !state.chapter1Completed
                  ? `${CONFIG.CHAPTER_1.campName} · ${CONFIG.CHAPTER_1.latitudeLabel}`
                  : `${state.selectedSite.name} (SOUTH POLE)`}
            </span>
            <button
              onClick={() => gameSim.saveCheckpoint(false)}
              className="pointer-events-auto px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold text-[#7EE0B8] border border-[#7EE0B8]/30 cursor-pointer"
              title="Save mission checkpoint to browser storage"
            >
              Save
            </button>
          </div>

          {/* Story step title + progress pips (Chapters 2–4) */}
          {story && storyLine && (
            <div className="flex items-center justify-center gap-2">
              <div className="flex gap-1">
                {story.steps.map((step, i) => (
                  <span
                    key={step.id}
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        i < state.story.stepIndex
                          ? story.accent
                          : i === state.story.stepIndex
                            ? "#FFFFFF"
                            : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
              <span className="text-[14px] font-bold" style={{ color: story.accent }}>
                {storyLine.title}
              </span>
            </div>
          )}

          {/* Current Mission Objective */}
          <div
            className="text-[14px] font-medium leading-snug px-2 text-white/90"
            style={{ color: UI_COLORS.text }}
          >
            {missionText}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT COLUMN: PANELS / ROVER STATS (Width: 260px)              */}
      {/* ============================================================== */}
      <div className="absolute right-3 top-3 w-[260px] flex flex-col gap-2">
        <div
          className="rounded-[10px] p-2.5 flex flex-col gap-2 border border-white/5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: UI_COLORS.panelAlpha }}
        >
          {/* Panels Info */}
          <div className="flex items-center justify-between text-[14px]">
            <span style={{ color: UI_COLORS.textDim }}>Solar Arrays</span>
            <span className="font-bold text-white font-mono-num">
              {story
                ? `${state.panelsInstalled} online`
                : `${state.panelsInstalled} / ${CONFIG.PANELS_TOTAL}`}
              {!state.solarAligned && state.panelsInstalled > 0 && (
                <span className="ml-1.5 text-[11px] text-[#FFB36B]">(70% tilt)</span>
              )}
            </span>
          </div>

          {/* Rover Tank Info (no ice to haul at Mons Mouton or Malapert) */}
          {(!story || story.id === "chapter4") && (
            <div className="flex items-center justify-between text-[14px]">
              <span style={{ color: UI_COLORS.textDim }}>Rover Tank</span>
              <span className="font-bold font-mono-num" style={{ color: UI_COLORS.water }}>
                {state.rover.waterTank} / {CONFIG.ROVER.tankMax} W
              </span>
            </div>
          )}

          {/* Rover Battery Row & Bar */}
          <div className="flex flex-col gap-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[14px]">
              <span style={{ color: UI_COLORS.textDim }}>Rover Battery</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="font-bold font-mono-num"
                  style={{
                    color: state.rover.battery <= 12 ? UI_COLORS.bad : UI_COLORS.energy,
                  }}
                >
                  {Math.round(state.rover.battery)} / {state.rover.batteryMax} E
                </span>
                {state.rover.battery <= 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#EB5050] text-white font-bold">
                    EMPTY
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <span style={{ color: UI_COLORS.textDim }}>Dock Status</span>
              <span
                className="font-semibold uppercase"
                style={{
                  color:
                    state.dockState === "charging" || state.dockState === "full"
                      ? UI_COLORS.good
                      : state.dockState === "docked"
                        ? UI_COLORS.water
                        : UI_COLORS.textDim,
                }}
              >
                {state.dockState === "charging"
                  ? "Charging (1:1 E)"
                  : state.dockState === "full"
                    ? "Charged"
                    : state.dockState === "docked"
                      ? state.energy <= 0
                        ? "Docked (No Base E)"
                        : "Docked"
                      : "In Field"}
              </span>
            </div>

            {state.rover.damage > 0 && (
              <div className="text-[12px]" style={{ color: UI_COLORS.bad }}>
                Chassis damage {state.rover.damage}/{CONFIG.ROVER.maxDamage} (hold R alongside
                rover)
              </div>
            )}

            {state.iceCheck && (
              <div
                className="text-[12px]"
                style={{ color: state.iceCheck.ok ? UI_COLORS.good : UI_COLORS.bad }}
              >
                Nearest ice {state.iceCheck.distance}m: round trip needs ~{state.iceCheck.needed}E{" "}
                {state.iceCheck.ok ? "✓" : "✗"}
              </div>
            )}
            {state.rover.boostCooldown > 0 && (
              <div className="text-[12px]" style={{ color: UI_COLORS.oxygen }}>
                Booster cooling: {Math.ceil(state.rover.boostCooldown)}s
              </div>
            )}
            {/* Battery Bar */}
            <div className="w-full h-2 bg-[#080C1A] rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${Math.round((state.rover.battery / state.rover.batteryMax) * 100)}%`,
                  backgroundColor: state.rover.battery <= 12 ? UI_COLORS.bad : UI_COLORS.energy,
                }}
              />
            </div>
          </div>

          {/* Rover Booster State */}
          <div className="flex items-center justify-between text-[13px] pt-1">
            <span style={{ color: UI_COLORS.textDim }}>Booster</span>
            <span
              className="font-semibold text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: state.rover.isBoosting
                  ? UI_COLORS.oxygen
                  : state.rover.boostCooldown > 0
                    ? UI_COLORS.disabled
                    : "rgba(90, 210, 120, 0.2)",
                color: state.rover.isBoosting
                  ? "#FFFFFF"
                  : state.rover.boostCooldown > 0
                    ? UI_COLORS.textDim
                    : UI_COLORS.good,
              }}
            >
              {state.rover.isBoosting
                ? "BURNING"
                : state.rover.boostCooldown > 0
                  ? "COOLDOWN"
                  : "READY"}
            </span>
          </div>
          <div className="text-[12px] leading-tight" style={{ color: UI_COLORS.textDim }}>
            Hold Shift: High-speed booster (3x battery)
          </div>
          {story && <StoryStatus state={state} def={story} />}
        </div>
      </div>

      {story && state.story.aiming && <AimOverlay signal={gameSim.aimSignal()} />}

      {/* ============================================================== */}
      {/* BOTTOM CENTER: OXYGEN BAR (Width: 340px, Height: 30px)        */}
      {/* ============================================================== */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-5 w-[340px] flex flex-col items-center gap-1.5">
        {/* Pressurized O2 Refill Tag */}
        {state.player.oxygenSource !== "none" && (
          <div
            className="px-2.5 py-0.5 rounded-md text-[12px] font-bold shadow-md tracking-wider uppercase"
            style={{
              backgroundColor: UI_COLORS.good,
              color: UI_COLORS.bg,
            }}
          >
            {state.player.oxygenSource === "rover"
              ? "Rover Life Support Active (O2 Refilling)"
              : state.player.oxygenSource === "lander"
                ? "Lander Cabin Shelter (O2 Refilling)"
                : "Airlock Pressurized (O2 Refilling)"}
          </div>
        )}

        {/* Low Oxygen Warning Hint */}
        {state.player.oxygenSource === "none" && state.player.oxygen <= 25 && (
          <div
            className="text-[13px] font-bold animate-bounce uppercase tracking-wide"
            style={{ color: UI_COLORS.oxygen }}
          >
            {state.modules.A.status === "damaged"
              ? "Warning: Habitat A Damaged — Board Powered Rover or Repair Module A!"
              : "Warning: Return to Shelter or Powered Rover to Refill Oxygen!"}
          </div>
        )}

        {/* Oxygen Bar Frame */}
        <div
          className="w-full h-[30px] rounded-[8px] p-1 flex items-center relative overflow-hidden shadow-2xl border border-white/10"
          style={{ backgroundColor: UI_COLORS.panel }}
        >
          {/* Fill Bar */}
          <div
            className="h-full rounded-[5px] transition-all duration-200"
            style={{
              width: `${Math.round(state.player.oxygen)}%`,
              backgroundColor: state.player.oxygen <= 20 ? UI_COLORS.bad : UI_COLORS.oxygen,
            }}
          />

          {/* Text Overlay */}
          <div className="absolute inset-0 flex items-center justify-center font-bold text-[14px] text-white tracking-wide text-stroke-world">
            OXYGEN {Math.round(state.player.oxygen)}%
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RADAR: BOTTOM LEFT (Circle: 180px, Pos: 16px, bottom-16px)     */}
      {/* ============================================================== */}
      <div className="absolute left-4 bottom-4 w-[180px] h-[180px] rounded-full border-2 border-[#56BEFF]/50 bg-[#080C1A]/85 backdrop-blur-md shadow-2xl overflow-hidden p-2 flex items-center justify-center pointer-events-auto">
        <div className="absolute w-[90px] h-[90px] rounded-full border border-[#202C4C]" />

        <div className="absolute top-1 text-[11px] font-bold text-[#A5AFC8]">▲ FWD</div>

        {/* Home Base Marker */}
        {homeBlip.dist > 14 && (
          <div
            className="absolute flex flex-col items-center z-10"
            style={{ transform: `translate(${homeBlip.x}px, ${homeBlip.y}px)` }}
            title={`Home Base (${Math.round(homeBlip.dist)}m)`}
          >
            <div
              className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-black shadow-md"
              style={{ backgroundColor: UI_COLORS.good, color: UI_COLORS.bg }}
            >
              H
            </div>
          </div>
        )}

        {/* Player / Rover Center Indicator */}
        <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_white] z-10" />

        {/* Active Stage Target Blip */}
        {objectiveBlip && objectiveBlip.dist > 5 && (
          <div
            className="absolute flex items-center justify-center z-20"
            style={{ transform: `translate(${objectiveBlip.x}px, ${objectiveBlip.y}px)` }}
            title="Current Mission Objective"
          >
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#7EE0B8] bg-[#7EE0B8]/30 animate-pulse" />
          </div>
        )}

        {state.networkOpen &&
          BASES.map((b) => {
            const blip = projectRadarBlip(originX, originZ, b.x, b.z, cameraHeading);
            return (
              <div
                key={b.id}
                className="absolute text-[10px] font-black"
                style={{
                  transform: `translate(${blip.x}px, ${blip.y}px)`,
                  color: UI_COLORS.energy,
                }}
                title={b.label}
              >
                {b.label.slice(5, 6)}
              </div>
            );
          })}
        {state.iceSites.map((ice) => {
          const blip = projectRadarBlip(originX, originZ, ice.x, ice.z, cameraHeading);

          if (ice.deposit <= 0) {
            return (
              <div
                key={ice.id}
                className="absolute text-[10px] text-gray-500 font-bold"
                style={{
                  transform: `translate(${blip.x}px, ${blip.y}px)`,
                }}
              >
                ×
              </div>
            );
          }

          return (
            <div
              key={ice.id}
              className="absolute flex flex-col items-center"
              style={{
                transform: `translate(${blip.x}px, ${blip.y}px)`,
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_#56BEFF]"
                style={{
                  backgroundColor: ice.difficulty === "hard" ? "#BE78FF" : "#56BEFF",
                }}
              />
              {blip.dist < 80 && (
                <span className="text-[9px] font-mono-num text-cyan-200 font-bold">
                  {ice.deposit}W
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* PROMPT POPUP (World / Screen Action Prompt)                     */}
      {/* ============================================================== */}
      {state.prompt && state.prompt.visible && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-28 w-[360px] h-[72px] rounded-[12px] bg-[#121A30]/90 border border-[#202C4C] shadow-2xl backdrop-blur-md flex items-center px-3.5 gap-3 pointer-events-auto">
          {state.prompt.keyText && (
            <div className="w-11 h-11 rounded-[8px] bg-[#202C4C] border border-[#A5AFC8]/30 flex items-center justify-center font-bold text-[20px] text-white shadow-inner">
              {state.prompt.keyText}
            </div>
          )}

          {state.prompt.holdProgress > 0 && (
            <svg
              className="absolute left-3 w-12 h-12 -rotate-90 pointer-events-none"
              viewBox="0 0 48 48"
            >
              <circle
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke={UI_COLORS.good}
                strokeWidth="4"
                strokeDasharray={`${state.prompt.holdProgress * 132} 132`}
              />
            </svg>
          )}
          <div className="flex flex-col justify-center flex-1 overflow-hidden">
            <span className="text-[13px] font-medium truncate" style={{ color: UI_COLORS.textDim }}>
              {state.prompt.objectText}
            </span>
            <span className="text-[15px] font-bold text-white truncate">
              {state.prompt.actionText}
            </span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TOAST NOTIFICATIONS (PC: Top Right under right column)          */}
      {/* ============================================================== */}
      <div
        className="absolute right-3 w-[300px] flex flex-col gap-1.5 pointer-events-none"
        style={{ top: story ? 380 : 250 }}
      >
        {state.toasts.map((toast) => {
          let bg = "#343C54";
          if (toast.kind === "warn") bg = "#962D34";
          if (toast.kind === "good") bg = "#227042";

          return (
            <div
              key={toast.id}
              className="py-2 px-3 rounded-[8px] text-[13px] font-medium text-white shadow-xl backdrop-blur-md border border-white/10 transition-all duration-300"
              style={{ backgroundColor: bg }}
            >
              {toast.text}
            </div>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* MISSION COACH + TIP (bottom right, Luna theme)                  */}
      {/* ============================================================== */}
      <div className="absolute right-4 bottom-14 w-[320px] flex flex-col gap-1.5 pointer-events-auto">
        {coach && state.showTips && (
          <div
            className="rounded-[12px] p-3 border border-white/10 shadow-xl text-white flex flex-col gap-2"
            style={{ backgroundColor: UI_COLORS.panelAlpha }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "rgba(126, 224, 184, 0.2)",
                  color: coach.accent || UI_COLORS.luna.mint,
                  border: `1px solid ${coach.accent || UI_COLORS.luna.mint}66`,
                }}
              >
                Mission Coach
              </span>
            </div>
            <div className="text-[15px] font-black leading-tight" style={{ color: "#FFFFFF" }}>
              {coach.goal}
            </div>
            <div className="text-[13px] leading-snug" style={{ color: UI_COLORS.luna.soft }}>
              <span className="font-bold" style={{ color: UI_COLORS.luna.sky }}>
                Do this:{" "}
              </span>
              {coach.doThis}
            </div>
            <div
              className="text-[12px] leading-snug pt-1 border-t border-white/10"
              style={{ color: UI_COLORS.luna.label }}
            >
              <span className="font-bold" style={{ color: UI_COLORS.luna.gold }}>
                Why:{" "}
              </span>
              {coach.why}
            </div>
          </div>
        )}
        {state.activeTip && state.showTips && (
          <div
            className="rounded-[10px] p-3 border border-white/10 shadow-xl text-[13px] text-white flex gap-2"
            style={{ backgroundColor: UI_COLORS.panelAlpha }}
          >
            <span className="font-bold" style={{ color: UI_COLORS.energy }}>
              TIP
            </span>
            <span className="flex-1 leading-snug">{state.activeTip}</span>
            <button
              onClick={() => gameSim.closeTip()}
              className="text-white/60 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex gap-3 justify-end text-[12px]" style={{ color: UI_COLORS.textDim }}>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showTips}
              onChange={(e) => gameSim.setShowTips(e.target.checked)}
            />{" "}
            Show tips
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showFacts}
              onChange={(e) => gameSim.setShowFacts(e.target.checked)}
            />{" "}
            Show facts
          </label>
        </div>
      </div>

      {state.activeFact && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[380px] rounded-[12px] bg-[#121A30] border-2 border-[#202C4C] p-4 shadow-2xl flex flex-col gap-2.5 pointer-events-auto z-40">
          <div className="flex items-center justify-between">
            <div className="px-2.5 py-0.5 rounded-full bg-white text-[#121A30] font-bold text-[12px] uppercase tracking-wider">
              Did You Know?
            </div>
            <button
              onClick={() => gameSim.closeFact()}
              className="w-7 h-7 rounded-full bg-[#202C4C] text-white flex items-center justify-center font-bold text-sm hover:bg-[#324476] cursor-pointer"
            >
              ✕
            </button>
          </div>

          <h3 className="font-bold text-[18px] text-white">{state.activeFact.title}</h3>

          <p className="text-[14px] text-[#E1E8F5] leading-relaxed">{state.activeFact.body}</p>

          <div className="rounded-[8px] bg-white/5 border border-white/10 px-3 py-2 text-[12px] text-[#CFD8F7] leading-snug">
            <span className="font-bold text-[#7EE0B8]">Game vs. Real Moon: </span>
            {state.activeFact.gameVsReal}
          </div>

          <div className="flex items-center justify-between text-[12px] text-[#A5AFC8]">
            <span>Source: {state.activeFact.source}</span>
            <a
              href={state.activeFact.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#8FD3FF] hover:underline font-semibold"
            >
              NASA Ref ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
