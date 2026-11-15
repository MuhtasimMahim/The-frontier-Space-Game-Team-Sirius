import React, { useState } from "react";
import { CONFIG, type LandingSiteDef } from "../game/config";
import { gameSim } from "../game/simulation";

export const SiteSelectUI: React.FC = () => {
  const [selectedSite, setSelectedSite] = useState<LandingSiteDef>(
    CONFIG.SITES[CONFIG.DEFAULT_SITE_ID - 1] ?? CONFIG.SITES[0]!,
  );

  const handleLand = () => {
    gameSim.selectSite(selectedSite);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 select-none font-gotham text-white luna-gradient">
      <div className="max-w-6xl w-full flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight uppercase">
              {CONFIG.TEXTS.siteTitle}
            </h1>
            <p className="text-sm text-[#DFE6FF]/80 mt-1">{CONFIG.TEXTS.siteSubtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs uppercase px-3 py-1 rounded-full bg-[#7EE0B8]/20 text-[#7EE0B8] font-bold border border-[#7EE0B8]/40">
              NASA ARTEMIS SITES
            </span>
          </div>
        </div>

        {/* Content Body: Left 2D South Pole Map, Right Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* MAP CANVAS */}
          <div className="md:col-span-7 luna-panel rounded-[20px] p-5 flex flex-col items-center justify-center relative min-h-[420px] overflow-hidden">
            <div className="absolute left-5 top-5 text-xs text-[#AAB6DC] font-bold tracking-wider">
              {CONFIG.TEXTS.siteMapTitle}
            </div>
            <div className="absolute right-5 top-5 text-xs text-[#7F8FBD] font-semibold flex items-center gap-1">
              ↑ {CONFIG.TEXTS.siteEarth}
            </div>

            {/* Latitude circles */}
            <div className="relative w-[340px] h-[340px] flex items-center justify-center">
              <div className="absolute w-[320px] h-[320px] rounded-full border border-[#AAB6DC]/20 flex items-start justify-center pt-1 text-[10px] text-[#7F8FBD]">
                88° S
              </div>
              <div className="absolute w-[220px] h-[220px] rounded-full border border-[#AAB6DC]/25 flex items-start justify-center pt-1 text-[10px] text-[#7F8FBD]">
                89° S
              </div>
              <div className="absolute w-[120px] h-[120px] rounded-full border border-[#AAB6DC]/30 flex items-start justify-center pt-1 text-[10px] text-[#7F8FBD]">
                89.5° S
              </div>

              {/* South Pole Center Dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_white] z-10 relative flex items-center justify-center">
                <span className="absolute -top-4 text-[10px] font-bold text-white">S</span>
              </div>

              {/* Site Pins on Polar Projection */}
              {CONFIG.SITES.map((site) => {
                const isSelected = selectedSite.id === site.id;
                const px = (site.coords.x - 0.5) * 300 + 170;
                const py = (site.coords.y - 0.5) * 300 + 170;

                return (
                  <button
                    key={site.id}
                    onClick={() => setSelectedSite(site)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer"
                    style={{ left: `${px}px`, top: `${py}px` }}
                  >
                    {isSelected && (
                      <div className="absolute w-12 h-12 rounded-full bg-[#7EE0B8]/30 animate-ping pointer-events-none" />
                    )}

                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-xl transition-all ${
                        isSelected
                          ? "bg-[#7EE0B8] text-[#0B1230] scale-110 ring-4 ring-white"
                          : "bg-[#2B2F78] text-white border-2 border-[#CFD8F7] hover:scale-105"
                      }`}
                    >
                      {site.id}
                    </div>

                    <span
                      className={`text-[11px] font-bold mt-1 px-1.5 py-0.5 rounded shadow ${
                        isSelected ? "bg-white text-[#0B1230]" : "bg-[#0B1230]/70 text-[#DFE6FF]"
                      }`}
                    >
                      {site.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Map Legend */}
            <div className="absolute left-5 bottom-4 flex items-center gap-4 text-[11px] text-[#AAB6DC]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#7EE0B8]" />
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#2B2F78] border border-[#CFD8F7]" />
                <span>Candidate Site</span>
              </div>
            </div>
          </div>

          {/* DETAIL PANEL & LAND BUTTON */}
          <div className="md:col-span-5 luna-panel rounded-[20px] p-6 flex flex-col justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-[#7EE0B8] font-nunito tracking-wider">
                  SITE 0{selectedSite.id} / 04
                </span>
                {selectedSite.id === CONFIG.CHAPTER_1.siteId && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FFD166]/20 text-[#FFD166] font-bold border border-[#FFD166]/40">
                    ★ CHAPTER 1 · CAMP SIRIUS
                  </span>
                )}
                {selectedSite.id === 2 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#7EE0B8]/20 text-[#7EE0B8] font-bold border border-[#7EE0B8]/30">
                    ★ {CONFIG.TEXTS.siteRecommended}
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-2xl font-black text-white">{selectedSite.name}</h2>
                <p className="text-sm text-[#DFE6FF] mt-1.5 leading-relaxed">
                  {selectedSite.description}
                </p>
              </div>

              {/* Numerical Metrics */}
              <div className="flex flex-col gap-3 py-2 border-y border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#AAB6DC] font-medium">Solar Irradiance</span>
                  <div className="flex items-center gap-2">
                    <div className="w-28 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#FFD166] rounded-full"
                        style={{ width: `${selectedSite.sunlight * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-[#FFD166] font-mono-num w-10 text-right">
                      {Math.round(selectedSite.sunlight * 100)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#AAB6DC] font-medium">Crater Ice Distance</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#8FD3FF]">
                      {selectedSite.iceDistanceLabel}
                    </span>
                    <span className="text-xs text-[#AAB6DC] ml-2">
                      ({selectedSite.iceDistanceStuds}m / {selectedSite.roundTripLabel})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#AAB6DC] font-medium">Topography Hazard</span>
                  <span
                    className="text-sm font-bold"
                    style={{
                      color:
                        selectedSite.hazardLabel === "High"
                          ? "#FF9D9D"
                          : selectedSite.hazardLabel === "Medium"
                            ? "#FFB36B"
                            : "#7EE0B8",
                    }}
                  >
                    {selectedSite.hazardLabel} ({selectedSite.hazardDesc})
                  </span>
                </div>
              </div>
            </div>

            {/* Touchdown Button */}
            <button
              onClick={handleLand}
              className="w-full py-4 mt-6 rounded-[14px] bg-[#7EE0B8] hover:bg-[#68d4a7] text-[#0B1230] font-black text-lg tracking-wide shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 uppercase"
            >
              <span>{CONFIG.TEXTS.siteLand}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
