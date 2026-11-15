// Translated to High Quality NASA Artemis English with identical color tokens and balancing

export type ModuleId = "A" | "B" | "C";

export interface FactDef {
  id: string;
  title: string;
  body: string;
  gameVsReal: string;
  source: string;
  sourceUrl: string;
}

export const UI_COLORS = {
  // Dark Navy Theme (UI.Colors)
  bg: "#080C1A",
  panel: "#121A30",
  panelAlpha: "rgba(18, 26, 48, 0.88)", // 0.12 transparency
  panelLight: "#202C4C",
  text: "#FFFFFF",
  textDim: "#A5AFC8",
  energy: "#FFD640",
  water: "#56BEFF",
  food: "#60D278",
  oxygen: "#FF9632",
  good: "#5AD278",
  bad: "#EB5050",
  neutral: "#969BAA",
  accent: "#4682FF",
  disabled: "#3C4256",

  // Luna Palette (UI.Luna)
  luna: {
    bgTop: "#14215C",
    bgMid: "#2A2A78",
    bgBottom: "#4B2F86",
    mint: "#7EE0B8",
    gold: "#FFD166",
    sky: "#8FD3FF",
    orange: "#FFB36B",
    red: "#FF9D9D",
    soft: "#DFE6FF",
    body: "#E4EBFF",
    label: "#CFD8F7",
    dim: "#AAB6DC",
    faint: "#7F8FBD",
    ink: "#0F2A3A",
    inkDeep: "#0B1230",
    pin: "#2B2F78",
    crater: "#3C4678",
    white: "#FFFFFF",
  },
};

export interface Cost {
  energy: number;
  water: number;
}

export interface ModuleDef {
  id: ModuleId;
  name: string;
  displayName: string;
  cost: Cost;
  buildDays: number;
  upkeep: Cost;
  requires: ModuleId[];
  foodPerDay: number;
  canPause: boolean;
  desc: string;
}

export interface LandingSiteDef {
  id: number;
  name: string;
  sunlight: number;
  iceDistanceLabel: string;
  hazardLabel: string;
  hazardDesc: string;
  description: string;
  coords: { x: number; y: number };
  iceDistanceStuds: number;
  roundTripLabel: string;
}

export interface IceSiteDef {
  id: number;
  x: number;
  z: number;
  deposit: number;
  maxDeposit: number;
  difficulty: "easy" | "mid" | "hard";
}

export const CONFIG = {
  // Time
  DAY_SECONDS: 10,
  TOTAL_DAYS: 60,
  FAST_FORWARD: 2,
  LANDING_SECONDS: 5,
  SITE_SELECT_TIMEOUT: 30,
  DEFAULT_SITE_ID: 2,

  // Start resources (Energy ≥ Habitat A cost so Chapter 1 stays fair after ice refining)
  START: {
    energy: 70,
    water: 25,
    food: 35,
  },

  // Daily crew consumption
  CREW: {
    food: 1,
    water: 1,
  },

  // Solar panels
  PANELS_TOTAL: 25,
  PANELS_PER_DAY: 3,
  PANEL_OUTPUT: 1,
  PANEL_INSTALL_HOLD: 2.0,

  // Energy & Water
  ENERGY_CAP_BASE: 150,
  ENERGY_CAP_PER_MODULE: 100,
  WATER_PROCESS_ENERGY_PER_W: 0.35,

  // Rover specs
  ROVER: {
    tankMax: 60,
    fillHold: 3.0,
    maxSpeed: 18,
    batteryMax: 50,
    batteryDrainPerSecond: 0.3,
    chargeRatePerSecond: 2.0,
    chargeRadius: 10,
    lowBatteryRatio: 0.25,
    recoverBatteryRatio: 0.2,
    boostSpeedMultiplier: 1.6,
    boostDrainMultiplier: 3.0,
    boostMaxSeconds: 4.0,
    boostCooldownSeconds: 6.0,
    boostMinBatteryRatio: 0.2,
    maxDamage: 3,
    repairHold: 4.0,
    repairEnergy: 10,
  },

  // Oxygen
  OXYGEN: {
    max: 100,
    drainPerSecond: 100 / 60,
    refillPerSecond: 10,
    lowWarning: 20,
    deathPenalty: { food: 1, water: 2 },
  },

  SHORTAGE_DAYS_TO_LOSE: 4,

  // Modules A, B, C
  MODULES: {
    A: {
      id: "A",
      name: "Habitat",
      displayName: "Habitat A",
      cost: { energy: 60, water: 20 },
      buildDays: 5,
      upkeep: { energy: 3, water: 1 },
      requires: [],
      foodPerDay: 0,
      canPause: false,
      desc: "Crew quarters and life support. Regenerates spacesuit oxygen inside.",
    },
    B: {
      id: "B",
      name: "Farm",
      displayName: "Farm B",
      cost: { energy: 80, water: 30 },
      buildDays: 5,
      upkeep: { energy: 6, water: 2 },
      requires: ["A"],
      foodPerDay: 2,
      canPause: true,
      desc: "Hydroponic agriculture bay. Produces daily food rations.",
    },
    C: {
      id: "C",
      name: "ResearchLab",
      displayName: "Research Lab C",
      cost: { energy: 150, water: 50 },
      buildDays: 7,
      upkeep: { energy: 8, water: 3 },
      requires: ["A", "B"],
      foodPerDay: 0,
      canPause: false,
      desc: "Lunar science complex. Final milestone for permanent colonization!",
    },
  } satisfies Record<ModuleId, ModuleDef>,

  // Landing Sites
  SITES: [
    {
      id: 1,
      name: "Shackleton Rim",
      sunlight: 1.0,
      iceDistanceLabel: "Far",
      hazardLabel: "Low",
      hazardDesc: "Relatively flat terrain routes",
      description: "Abundant peak sunlight, but crater ice deposits are farther out.",
      coords: { x: 0.53, y: 0.564 },
      iceDistanceStuds: 450,
      roundTripLabel: "~1m 30s",
    },
    {
      id: 2,
      name: "de Gerlache Ridge",
      sunlight: 0.85,
      iceDistanceLabel: "Medium",
      hazardLabel: "Medium",
      hazardDesc: "Moderate rocks and rolling crater slopes",
      description: "The optimal balanced candidate for Artemis base establishment.",
      coords: { x: 0.568, y: 0.34 },
      iceDistanceStuds: 300,
      roundTripLabel: "~1m 00s",
    },
    {
      id: 3,
      name: "Malapert Massif",
      sunlight: 0.7,
      iceDistanceLabel: "Close",
      hazardLabel: "Medium",
      hazardDesc: "Rolling ridge slopes with scattered rocks",
      description: "Close access to water deposits, but slower solar power generation.",
      coords: { x: 0.276, y: 0.741 },
      iceDistanceStuds: 180,
      roundTripLabel: "~40s",
    },
    {
      id: 4,
      name: "Nobile Rim 1",
      sunlight: 0.75,
      iceDistanceLabel: "Very Close",
      hazardLabel: "Medium",
      hazardDesc: "Elevated polar crater rim beside dark shadow basins",
      description:
        "Camp Sirius target: sunlit rim peaks right next to permanently shadowed candidate ice basins.",
      coords: { x: 0.826, y: 0.706 },
      iceDistanceStuds: 110,
      roundTripLabel: "~30s",
    },
  ] as LandingSiteDef[],

  // Ice Sites (all inside the 380 m drivable rim; the mountain ring starts beyond it)
  ICE_SITES: [
    { id: 1, x: -75, z: 50, deposit: 55, maxDeposit: 55, difficulty: "mid" },
    { id: 2, x: 210, z: 300, deposit: 45, maxDeposit: 45, difficulty: "easy" },
    { id: 3, x: -330, z: 120, deposit: 45, maxDeposit: 45, difficulty: "easy" },
    { id: 4, x: 80, z: 160, deposit: 60, maxDeposit: 60, difficulty: "mid" },
    { id: 5, x: -140, z: -330, deposit: 55, maxDeposit: 55, difficulty: "mid" },
    { id: 6, x: -20, z: 290, deposit: 110, maxDeposit: 110, difficulty: "hard" },
    { id: 7, x: 130, z: -340, deposit: 110, maxDeposit: 110, difficulty: "hard" },
    { id: 8, x: 350, z: 20, deposit: 110, maxDeposit: 110, difficulty: "hard" },
  ] as IceSiteDef[],

  // Chapter 1 Vertical Slice (Nobile Rim 1 — Camp Sirius)
  CHAPTER_1: {
    siteId: 4,
    campName: "Camp Sirius",
    latitudeLabel: "85.2° S · Nobile Rim 1",
    briefingBadge: "CHAPTER 1 · VERTICAL SLICE MISSION",
    briefingTitle: "Landing & Camp Sirius",
    briefingSummary:
      "Touch down on the sunlit ridge of Nobile Rim 1 and establish Camp Sirius. Learn how astronauts generate grazing polar solar power, prospect candidate crater ice, and pressurize their first lunar habitat.",
    steps: [
      "Check the Lander Orientation Console (E) to calibrate your suit radar.",
      "Deploy 3 solar arrays (Hold E) and align the sun-tracker for 100% polar sunlight.",
      "Drive the Lunar Rover to a nearby permanently shadowed crater to collect candidate water ice.",
      "Refine at least 20W of water at the base dock while keeping 60E stored.",
      "Build Habitat A, cycle its airlock (E), and step inside to commission Camp Sirius!",
    ],
    scienceNote:
      "Game vs. Real Moon: Lunar days are compressed to 10 seconds for classroom play (a real lunar day lasts ~29.5 Earth days), and crater ice locations represent orbital PSR candidates that real rovers must verify by drilling.",
  },

  // Mission Objectives (Fluent NASA Mission Control English)
  MISSION_TEXTS: {
    selecting: "Select your Lunar South Pole landing site",
    landing: "Descent stage firing. Lunar landing in progress...",
    orient:
      "Walk to the Lander Orientation Console (glowing ring) and press E to calibrate your Camp Sirius radar.",
    installPanels: "Deploy {n} solar panels at the Solar Field Array (Hold E)",
    alignPanels:
      "Solar panels are at 70% grazing efficiency. Hold E at the Sun-Tracker Console to align them with the low polar sun.",
    boardRover:
      "Approach the Lunar Rover and press E to board for your first candidate-ice expedition.",
    findIce:
      "Follow the radar blip to a permanently shadowed crater. Hold E to sample candidate water ice.",
    unloadWater:
      "Drive back to the H Home Base dock and press E at the tank to refine water (uses 0.35E per 1W).",
    buildA: "Initiate construction of Habitat A at its foundation pad (Req: 60 Energy, 20 Water).",
    enterAirlock:
      "Habitat A is ready! Press E at the Habitat Airlock door, wait 6s to cycle, and step inside.",
    buildB: "Initiate construction of Farm B (Req: 80 Energy, 30 Water)",
    buildC: "Initiate construction of Research Lab C (Req: 150 Energy, 50 Water)",
    building:
      "{name} under construction: {days} days remaining. Keep solar power and water reserves steady.",
    roverBroken: "Rover damaged. Hold R alongside the rover chassis to repair (Req: 10 Energy).",
    batteryEmpty: "Rover battery depleted. Walk to the base Recovery Console to recall the rover.",
    batteryLow: "Rover battery low. Return to base charging dock.",
    shortage:
      "CRITICAL ALERT: {res} supply exhausted! Replenish within {days} days or mission fails.",
    won: "Mission Accomplished! Camp Sirius is operational.",
    lost: "Mission Paused. Restore your checkpoint or start a new expedition.",
  },

  TEXTS: {
    titleBadge: "60-DAY LUNAR BASE EXPEDITION",
    titleName: "The Frontier\n60 Days",
    titleSubtitle:
      "Solo or online crew — land at the Lunar South Pole, build camps,\nand survive 60 mission days under Artemis Protocol.",
    titleStart: "START MISSION",
    titleChipEnergy: "Harvest Solar Energy",
    titleChipWater: "Extract Sub-surface Ice",
    titleChipFood: "Cultivate Hydroponic Crops",
    titleCrew: "Cooperative Survival Simulation (Artemis Protocol)",

    siteTitle: "WHERE SHALL WE TOUCH DOWN?",
    siteSubtitle:
      "Four Artemis candidate sites at the Lunar South Pole with realistic lighting and topography.",
    siteMapTitle: "LUNAR SOUTH POLE (POLAR PROJECTION)",
    siteEarth: "EARTH DIRECTION",
    siteRecommended: "RECOMMENDED FOR FIRST MISSION",
    siteLand: "TOUCHDOWN HERE",
    siteChosen: "PREPARING DESCENT...",

    resultWonTag: "MISSION ACCOMPLISHED",
    resultLostTag: "MISSION FAILED",
    resultWon: "Outpost Established",
    resultLost: "Expedition Aborted",
    resultDays: "Days Elapsed",
    resultTrips: "Ice Expeditions",
    resultDeaths: "O2 Failures",
    resultSite: "Landing Site",
    unitDay: "d",
    unitCount: "trips",
    restartLabel: "NEW EXPEDITION",
    lessonsTitle: "TODAY'S LUNAR SCIENCE BRIEF",
    crewLogTitle: "CREW LOG / MISSION CONTRIBUTIONS",
    recordsTitle: "HALL OF FAME",
  },

  FACTS: [
    {
      id: "landing_site",
      title: "Why Nobile Rim 1 at the South Pole?",
      body: "NASA selected Nobile Rim 1 among the Artemis III candidate regions because sunlit mountain rims sit right beside permanently shadowed craters (-200°C) that may trap ancient water ice.",
      gameVsReal:
        "In-game craters show visible cyan markers for navigation; on the real Moon, water ice is a subsurface candidate mixed into dark regolith that rovers like VIPER must drill and test.",
      source: "NASA Artemis III Candidate Landing Regions",
      sourceUrl:
        "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/",
    },
    {
      id: "first_panel",
      title: "How long is a lunar day?",
      body: "One lunar day-night cycle lasts ~29.5 Earth days. Near the South Pole, high peaks can catch low grazing sunlight for over 75–85% of the lunar year.",
      gameVsReal:
        "The game speeds 1 lunar day into 10 seconds so you can test multi-day base planning in one session.",
      source: "NASA Lunar Reconnaissance Orbiter (LRO)",
      sourceUrl: "https://science.nasa.gov/mission/lro/",
    },
    {
      id: "solar_alignment",
      title: "Why tilt polar solar panels sideways?",
      body: "At the Lunar South Pole the Sun never climbs high overhead—it skims just a few degrees above the horizon. Tilting solar arrays to face the horizon captures far more electricity than laying them flat.",
      gameVsReal:
        "Game alignment is a one-step sun-tracker lock (+30% output); real polar arrays use motor gimbals that slowly rotate 360° as the Sun circles the horizon.",
      source: "NASA Glenn Research Center — Lunar Power Systems",
      sourceUrl:
        "https://www.nasa.gov/space-technology-mission-directorate/tdm/fission-surface-power/",
    },
    {
      id: "first_water",
      title: "Water is more than drinking water",
      body: "Splitting lunar water (electrolysis) produces breathing oxygen for crews and hydrogen/oxygen rocket propellant—a technique called In-Situ Resource Utilization (ISRU).",
      gameVsReal:
        "Refining water in-game costs Energy immediately at the tank; real ISRU plants must heat icy regolith in sealed ovens, filter volatiles, and store cryogens.",
      source: "NASA In-Situ Resource Utilization (ISRU)",
      sourceUrl: "https://www.nasa.gov/mission/isru/",
    },
    {
      id: "module_A",
      title: "No atmosphere, no shield",
      body: "With no air or global magnetic field, solar particles and micrometeoroids strike the surface directly. Pressurized habitats use thick multi-layer walls and regolith berms for protection.",
      gameVsReal:
        "Game airlocks cycle in 6 seconds; real lunar airlocks pump down air first to save precious cabin gas and keep razor-sharp lunar dust outside.",
      source: "NASA Artemis Base Camp Concept",
      sourceUrl: "https://www.nasa.gov/specials/artemis/",
    },
    {
      id: "module_B",
      title: "Farming beyond Earth",
      body: "Space station plant chambers (Veggie) and 2022 laboratory tests showed thale cress seeds can sprout in Apollo regolith when given water, light, and nutrients.",
      gameVsReal:
        "Lunar regolith lacks organic nutrients and contains sharp glass grains, so real lunar farms mainly use closed-loop hydroponics rather than raw moon dirt.",
      source: "NASA Biological & Physical Sciences",
      sourceUrl: "https://www.nasa.gov/news-release/scientists-grow-plants-in-lunar-soil/",
    },
    {
      id: "module_C",
      title: "The Moon is an ancient archive",
      body: "With no wind or rain erosion, lunar craters preserve 4+ billion years of inner solar system history—telling us how Earth and its neighbors formed.",
      gameVsReal:
        "Game labs unlock colony milestones automatically; real astronauts curate sealed core samples for laboratories on the Moon and Earth.",
      source: "NASA Planetary Science — Moon",
      sourceUrl: "https://science.nasa.gov/moon/",
    },
    {
      id: "gravity",
      title: "One-sixth Earth gravity",
      body: "Lunar surface gravity is 1.62 m/s²—about 17% of Earth’s. Objects fall slower, jumps stay airborne longer, and rover wheels have much less downward traction.",
      gameVsReal:
        "The physics engine uses exact 1.62 m/s² gravity, though real spacesuits are stiff and pressurized, making small bunny-hops safer than high jumps.",
      source: "NASA Moon Fact Sheet (NSSDC)",
      sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html",
    },
    {
      id: "oxygen",
      title: "Oxygen is the shortest clock",
      body: "Every moonwalk (EVA) is planned around spacesuit life-support reserves and cooling water, using 'walk-back' limits so crews can always reach shelter safely.",
      gameVsReal:
        "In-game O2 depletion triggers an automatic Camp Sirius rescue beacon (-2W, -1F); real astronauts turn back well before hitting emergency reserve tanks.",
      source: "NASA Extravehicular Activity (xEMU / Axiom Suit)",
      sourceUrl: "https://www.nasa.gov/humans-in-space/spacesuits/",
    },
    {
      id: "result_win",
      title: "From Camp Sirius to Mars",
      body: "Learning to generate power, recycle water, and operate pressurized habitats at the Lunar South Pole is humanity’s proving ground for future crewed missions to Mars.",
      gameVsReal:
        "Camp Sirius is your first self-contained foothold—real Artemis missions build capability step by step across multiple landings.",
      source: "NASA Moon to Mars Architecture",
      sourceUrl: "https://www.nasa.gov/moontomarsarchitecture/",
    },
    {
      id: "ch2_mouton",
      title: "Mons Mouton: a mountain with a flat top",
      body: "Mons Mouton is a mesa-like mountain near the lunar South Pole, named after NASA mathematician Melba Mouton. NASA picked its plateau as the landing area for the VIPER ice-hunting rover.",
      gameVsReal:
        "The game shrinks the plateau to a few hundred meters; the real mountain top stretches for kilometers and rises several kilometers above its surroundings.",
      source: "NASA VIPER Mission",
      sourceUrl: "https://science.nasa.gov/mission/viper/",
    },
    {
      id: "ch2_tower",
      title: "Why build solar power up high?",
      body: "Near the South Pole the Sun stays close to the horizon, so hills and boulders cast very long shadows. Raising solar panels on a tall mast lets them catch sunlight that ground-level panels miss.",
      gameVsReal:
        "Your tower charges a pack every few seconds; real towers would feed power over many lunar days and must survive dust, cold, and long nights.",
      source: "NASA Science — The Lunar South Pole",
      sourceUrl: "https://science.nasa.gov/moon/south-pole/",
    },
    {
      id: "ch2_flare",
      title: "Solar flares travel at light speed",
      body: "A solar flare is a sudden flash of energy on the Sun. Its X-rays reach the Moon in about 8 minutes and can disrupt radio links and electronics.",
      gameVsReal:
        "Here a flare only slows the charger for a few seconds; real crews watch NASA space-weather forecasts and protect sensitive equipment.",
      source: "NASA Science — Solar Storms and Flares",
      sourceUrl: "https://science.nasa.gov/sun/solar-storms-and-flares/",
    },
    {
      id: "ch3_relay",
      title: "Talking to Earth from the far south",
      body: "From much of the lunar South Pole, Earth sits low on the horizon or hides behind crater rims. High ground like Malapert Massif keeps Earth in view, which makes it a natural place for a relay.",
      gameVsReal:
        "The game uses one dish; NASA's LunaNet plan links landers, rovers, and orbiting relay satellites into a network like the internet.",
      source: "NASA LunaNet",
      sourceUrl: "https://www.nasa.gov/communicating-with-missions/lunanet/",
    },
    {
      id: "ch3_malapert",
      title: "Aiming a dish at Earth",
      body: "Radio dishes send a narrow beam. Pointing a few degrees off can cut the signal sharply, so lunar antennas need precise aiming at Earth, which barely moves in the lunar sky.",
      gameVsReal:
        "You aim by hand with a signal meter; real antennas use motors and computers to track Earth automatically.",
      source: "NASA LunaNet",
      sourceUrl: "https://www.nasa.gov/communicating-with-missions/lunanet/",
    },
    {
      id: "ch3_storm",
      title: "DONKI: space-weather alerts",
      body: "NASA's DONKI database records solar flares, coronal mass ejections, and particle storms. With no thick air or global magnetic field, Moon crews must shelter when a radiation storm arrives.",
      gameVsReal:
        "The storm here gives a 45-second warning and lasts 20 seconds; real solar particle events can last hours to days.",
      source: "NASA Space Weather",
      sourceUrl: "https://www.nasa.gov/space-weather/",
    },
    {
      id: "ch4_cabeus",
      title: "LCROSS hit Cabeus on purpose",
      body: "In October 2009 NASA's LCROSS mission crashed a spent rocket stage into Cabeus crater and flew a probe through the debris. It detected water in the plume.",
      gameVsReal:
        "The game places three tidy ice deposits; real crater ice is patchy and mixed into frozen soil, so it must be mapped carefully.",
      source: "NASA LCROSS Mission",
      sourceUrl: "https://science.nasa.gov/mission/lcross/",
    },
    {
      id: "ch4_psr",
      title: "Permanently shadowed craters",
      body: "Some polar crater floors have not seen sunlight for billions of years. They can be colder than −200 °C, cold enough to trap water ice for a very long time.",
      gameVsReal:
        "Your radar finds ice in seconds; real teams combine orbiter maps, neutron data, and rover drilling to confirm where ice is.",
      source: "NASA Science — Moon Water and Ices",
      sourceUrl: "https://science.nasa.gov/moon/moon-water-and-ices/",
    },
    {
      id: "ch4_finale",
      title: "A network, not a single base",
      body: "NASA's Artemis program plans to return astronauts to the lunar South Pole and build up long-term exploration step by step, sharing power, data, and supplies between systems.",
      gameVsReal:
        "Your four camps trade by cargo hopper in minutes; real lunar logistics will take many missions over years.",
      source: "NASA Artemis",
      sourceUrl: "https://www.nasa.gov/humans-in-space/artemis/",
    },
  ] as FactDef[],
};
