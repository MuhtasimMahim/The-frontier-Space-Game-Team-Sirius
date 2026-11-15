/**
 * Storm Visual Controller for PlayCanvas.
 *
 * Smoothly modulates the 3D scene during solar storms and micrometeor impacts:
 * - Solar storm: dims sunlight to 30%, tints sky/ambient to amber, adds screen-edge
 *   reddish vignette, increases swirling dust emission, and adds subtle screen shake.
 * - Micrometeor: triggers brief white flash, 0.5s camera shake, and spawns 3–5 impact
 *   bursts on terrain.
 * - Clear: restores all parameters to normal over 2 seconds.
 *
 * Standalone module — importable by playcanvasWorld.ts and multiplayer integration.
 */

import * as pc from "playcanvas";
import { mkMat, part, type Vec3Tuple } from "../sceneKit";

export interface EventBannerState {
  kind: "storm" | "meteor" | string;
  phase?: "warning" | "active" | string;
  title?: string;
  edu?: string;
}

interface ImpactParticle {
  entity: pc.Entity;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface DustParticle {
  entity: pc.Entity;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class StormVisualController {
  private app: pc.Application;
  private sunLight: pc.Entity | null = null;
  private skyRig: unknown = null;
  private cameraEntity: pc.Entity | null = null;

  // Visual lerp state (0 = clear, 1 = maximum storm)
  public stormBlend: number = 0;

  // Baseline scene parameters to restore to
  private baseSunIntensity: number = 1.4;
  private baseSunColor: pc.Color = new pc.Color(1, 0.95, 0.9);
  private baseAmbient: pc.Color = new pc.Color(0.04, 0.04, 0.06);
  private baseFogStart: number = 900;
  private baseFogEnd: number = 3600;
  private baseFogColor: pc.Color = new pc.Color(0.02, 0.025, 0.04);

  // Screen overlays
  private overlayHolder: pc.Entity | null = null;
  private vignetteEntity: pc.Entity | null = null;
  private vignetteMat: pc.StandardMaterial | null = null;
  private flashEntity: pc.Entity | null = null;
  private flashMat: pc.StandardMaterial | null = null;
  private domOverlay: HTMLDivElement | null = null;
  private domFlash: HTMLDivElement | null = null;

  // Flash and shake dynamics
  private flashIntensity: number = 0;
  private shakeTimer: number = 0;
  private shakeIntensity: number = 0;
  private lastMeteorPhase: string | null = null;

  // Dust and impact particles
  private dustPool: DustParticle[] = [];
  private dustRoot: pc.Entity;
  private dustSpawnTimer: number = 0;

  private impactPool: ImpactParticle[] = [];
  private impactRoot: pc.Entity;

  // Terrain height function callback if provided
  private terrainHeight?: ((x: number, z: number) => number) | undefined;

  constructor(
    app: pc.Application,
    sunLight?: pc.Entity,
    skyRig?: unknown,
    camera?: pc.Entity,
    terrainHeight?: (x: number, z: number) => number,
  ) {
    this.app = app;
    this.sunLight = sunLight ?? (app.root.findByName("SunLight") as pc.Entity | null);
    this.skyRig = skyRig;
    this.cameraEntity = camera ?? (app.root.findByName("MainCamera") as pc.Entity | null);
    this.terrainHeight = terrainHeight;

    // Cache initial lighting parameters
    if (this.sunLight?.light) {
      this.baseSunIntensity = this.sunLight.light.intensity;
      this.baseSunColor = this.sunLight.light.color.clone();
    }
    if (this.app.scene) {
      this.baseAmbient = this.app.scene.ambientLight.clone();
      if (this.app.scene.fog) {
        this.baseFogStart = this.app.scene.fog.start;
        this.baseFogEnd = this.app.scene.fog.end;
        this.baseFogColor = this.app.scene.fog.color.clone();
      }
    }

    // Roots for particles
    this.dustRoot = new pc.Entity("StormDustRoot");
    this.app.root.addChild(this.dustRoot);

    this.impactRoot = new pc.Entity("StormImpactRoot");
    this.app.root.addChild(this.impactRoot);

    this.initOverlays();
    this.initDustPool();
    this.initImpactPool();
  }

  /** Set or update the camera entity */
  public setCamera(camera: pc.Entity) {
    this.cameraEntity = camera;
    if (this.overlayHolder && this.overlayHolder.parent !== camera) {
      camera.addChild(this.overlayHolder);
    }
  }

  /** Set terrain height provider for ground impact placement */
  public setTerrainHeight(fn: (x: number, z: number) => number) {
    this.terrainHeight = fn;
  }

  // ── Overlays (Vignette & Flash) ──────────────────────────────────────────

  private initOverlays() {
    const cam = this.cameraEntity ?? (this.app.root?.findByName("MainCamera") as pc.Entity | null);
    if (!cam || !this.app.systems?.render) {
      this.initDomOverlays();
      return;
    }

    this.overlayHolder = new pc.Entity("StormOverlays");
    cam.addChild(this.overlayHolder);

    // 1. Reddish-amber vignette plane
    const device = this.app.graphicsDevice;
    const vignetteTex = this.createVignetteTexture(device);

    this.vignetteMat = new pc.StandardMaterial();
    this.vignetteMat.useLighting = false;
    this.vignetteMat.cull = pc.CULLFACE_NONE;
    this.vignetteMat.depthTest = false;
    this.vignetteMat.depthWrite = false;
    this.vignetteMat.blendType = pc.BLEND_NORMAL;
    this.vignetteMat.diffuseMap = vignetteTex;
    this.vignetteMat.opacity = 0;
    this.vignetteMat.useFog = false;
    this.vignetteMat.update();

    this.vignetteEntity = new pc.Entity("VignetteQuad");
    this.vignetteEntity.addComponent("render", {
      type: "plane",
      castShadows: false,
      receiveShadows: false,
    });
    this.vignetteEntity.render!.material = this.vignetteMat;
    // Local plane stands vertical facing camera at z = -0.15
    this.vignetteEntity.setLocalPosition(0, 0, -0.15);
    this.vignetteEntity.setLocalEulerAngles(90, 0, 0);
    this.vignetteEntity.setLocalScale(0.38, 1, 0.26);
    this.overlayHolder.addChild(this.vignetteEntity);

    // 2. White flash plane
    this.flashMat = new pc.StandardMaterial();
    this.flashMat.useLighting = false;
    this.flashMat.cull = pc.CULLFACE_NONE;
    this.flashMat.depthTest = false;
    this.flashMat.depthWrite = false;
    this.flashMat.blendType = pc.BLEND_ADDITIVEALPHA;
    this.flashMat.diffuse = new pc.Color(1, 1, 1);
    this.flashMat.emissive = new pc.Color(1, 1, 1);
    this.flashMat.emissiveIntensity = 2.0;
    this.flashMat.opacity = 0;
    this.flashMat.useFog = false;
    this.flashMat.update();

    this.flashEntity = new pc.Entity("FlashQuad");
    this.flashEntity.addComponent("render", {
      type: "plane",
      castShadows: false,
      receiveShadows: false,
    });
    this.flashEntity.render!.material = this.flashMat;
    this.flashEntity.setLocalPosition(0, 0, -0.14);
    this.flashEntity.setLocalEulerAngles(90, 0, 0);
    this.flashEntity.setLocalScale(0.4, 1, 0.28);
    this.overlayHolder.addChild(this.flashEntity);

    this.initDomOverlays();
  }

  private createVignetteTexture(device: pc.GraphicsDevice): pc.Texture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.7;

      const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
      grad.addColorStop(0, "rgba(255, 60, 20, 0)");
      grad.addColorStop(0.5, "rgba(255, 60, 20, 0.05)");
      grad.addColorStop(0.75, "rgba(255, 45, 15, 0.4)");
      grad.addColorStop(1, "rgba(200, 25, 5, 0.92)");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    const tex = new pc.Texture(device, {
      width: size,
      height: size,
      format: pc.PIXELFORMAT_SRGBA8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
    });
    tex.setSource(canvas);
    return tex;
  }

  private initDomOverlays() {
    if (typeof document === "undefined") return;
    const canvas = this.app.graphicsDevice.canvas;
    const container = canvas?.parentElement;
    if (!container) return;

    // DOM Vignette
    this.domOverlay = document.createElement("div");
    this.domOverlay.id = "storm-vignette-overlay";
    this.domOverlay.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:20;transition:opacity 0.2s ease-out;opacity:0;";
    container.appendChild(this.domOverlay);

    // DOM Flash
    this.domFlash = document.createElement("div");
    this.domFlash.id = "storm-flash-overlay";
    this.domFlash.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:22;background-color:#ffffff;opacity:0;";
    container.appendChild(this.domFlash);
  }

  // ── Particle Pools ───────────────────────────────────────────────────────

  private initDustPool() {
    if (!this.app.systems?.render) return;
    const dustMat = mkMat(0.85, 0.55, 0.35, {
      metal: 0,
      gloss: 0.2,
      opacity: 0.65,
      additive: true,
    });

    for (let i = 0; i < 50; i++) {
      const e = new pc.Entity(`StormDust_${i}`);
      e.addComponent("render", {
        type: "sphere",
        castShadows: false,
        receiveShadows: false,
      });
      e.render!.material = dustMat;
      e.setLocalScale(0.12, 0.12, 0.12);
      e.enabled = false;
      this.dustRoot.addChild(e);
      this.dustPool.push({
        entity: e,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.5,
      });
    }
  }

  private initImpactPool() {
    if (!this.app.systems?.render) return;
    const sparkMat = mkMat(1, 0.9, 0.7, {
      metal: 0.2,
      gloss: 0.9,
      emissive: 4.0,
      opacity: 0.9,
      additive: true,
    });

    for (let i = 0; i < 60; i++) {
      const e = new pc.Entity(`ImpactParticle_${i}`);
      e.addComponent("render", {
        type: "sphere",
        castShadows: false,
        receiveShadows: false,
      });
      e.render!.material = sparkMat;
      e.setLocalScale(0.2, 0.2, 0.2);
      e.enabled = false;
      this.impactRoot.addChild(e);
      this.impactPool.push({
        entity: e,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.0,
        baseScale: 0.2,
      });
    }
  }

  // ── Public Update Loop ───────────────────────────────────────────────────

  /**
   * Main per-frame update.
   *
   * @param dt Frame delta in seconds.
   * @param activeStorm Whether solar radiation storm is ongoing.
   * @param eventBanner Active environmental event banner from simulation.
   */
  public update(dt: number, activeStorm: boolean, eventBanner?: EventBannerState | null) {
    if (dt <= 0) return;

    // Detect storm states
    const isSolarStorm =
      activeStorm || (eventBanner?.kind === "storm" && eventBanner?.phase === "active");

    const isMeteorActive = eventBanner?.kind === "meteor" && eventBanner?.phase === "active";

    // Trigger meteor impact burst and flash on transition to active
    if (isMeteorActive && this.lastMeteorPhase !== "active") {
      this.triggerMicrometeorImpact();
    }
    this.lastMeteorPhase = eventBanner?.phase ?? null;

    // Smooth stormBlend:
    // If solar storm active, ramp up over ~1.5s
    // If clear, restore all to normal over 2 seconds (rate = dt / 2.0)
    if (isSolarStorm) {
      this.stormBlend = Math.min(1, this.stormBlend + dt / 1.5);
    } else {
      this.stormBlend = Math.max(0, this.stormBlend - dt / 2.0);
    }

    // Apply scene visual modulations
    this.modulateLighting(dt);
    this.modulateSkyAndFog();
    this.updateVignetteAndFlash(dt);
    this.updateCameraShake(dt, isSolarStorm);
    this.updateDustParticles(dt, isSolarStorm);
    this.updateImpactParticles(dt);
  }

  // ── Visual Modulations ───────────────────────────────────────────────────

  private modulateLighting(_dt: number) {
    if (!this.sunLight?.light) return;

    // Solar storm: dim sun light intensity to 30% of normal
    const targetIntensity = pc.math.lerp(
      this.baseSunIntensity,
      this.baseSunIntensity * 0.3,
      this.stormBlend,
    );
    this.sunLight.light.intensity = targetIntensity;

    // Tint sunlight toward amber/orange
    this.sunLight.light.color.set(
      pc.math.lerp(this.baseSunColor.r, 1.0, this.stormBlend),
      pc.math.lerp(this.baseSunColor.g, 0.62, this.stormBlend),
      pc.math.lerp(this.baseSunColor.b, 0.22, this.stormBlend),
    );

    // Ambient lighting: warm amber dusk cast
    if (this.app.scene) {
      this.app.scene.ambientLight.set(
        pc.math.lerp(this.baseAmbient.r, 0.16, this.stormBlend),
        pc.math.lerp(this.baseAmbient.g, 0.08, this.stormBlend),
        pc.math.lerp(this.baseAmbient.b, 0.03, this.stormBlend),
      );
    }
  }

  private modulateSkyAndFog() {
    // Tint sky to amber/orange
    const skyEntity = this.app.root.findByName("Sky") as pc.Entity | null;
    if (skyEntity?.render?.material) {
      const mat = skyEntity.render.material as pc.StandardMaterial;
      if (mat.emissive) {
        mat.emissive.set(
          pc.math.lerp(1.0, 0.95, this.stormBlend),
          pc.math.lerp(1.0, 0.52, this.stormBlend),
          pc.math.lerp(1.0, 0.18, this.stormBlend),
        );
        mat.update();
      }
    }

    // Distance fog during storm
    if (this.app.scene?.fog) {
      const fog = this.app.scene.fog;
      fog.start = pc.math.lerp(this.baseFogStart, 180, this.stormBlend);
      fog.end = pc.math.lerp(this.baseFogEnd, 1200, this.stormBlend);
      fog.color.set(
        pc.math.lerp(this.baseFogColor.r, 0.18, this.stormBlend),
        pc.math.lerp(this.baseFogColor.g, 0.07, this.stormBlend),
        pc.math.lerp(this.baseFogColor.b, 0.02, this.stormBlend),
      );
    }
  }

  private updateVignetteAndFlash(dt: number) {
    // Vignette opacity follows stormBlend
    const targetVignette = this.stormBlend * 0.72;
    if (this.vignetteMat) {
      this.vignetteMat.opacity = targetVignette;
      this.vignetteMat.update();
    }
    if (this.domOverlay) {
      this.domOverlay.style.boxShadow = `inset 0 0 ${Math.round(
        120 * this.stormBlend,
      )}px rgba(230, 45, 10, ${this.stormBlend * 0.75})`;
      this.domOverlay.style.opacity = this.stormBlend > 0.01 ? "1" : "0";
    }

    // Decay white flash
    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 2.8);
      if (this.flashMat) {
        this.flashMat.opacity = this.flashIntensity * 0.9;
        this.flashMat.update();
      }
      if (this.domFlash) {
        this.domFlash.style.opacity = (this.flashIntensity * 0.85).toFixed(3);
      }
    } else {
      if (this.flashMat && this.flashMat.opacity > 0) {
        this.flashMat.opacity = 0;
        this.flashMat.update();
      }
      if (this.domFlash) this.domFlash.style.opacity = "0";
    }
  }

  private updateCameraShake(dt: number, isSolarStorm: boolean) {
    const cam = this.cameraEntity ?? (this.app.root.findByName("MainCamera") as pc.Entity | null);
    if (!cam) return;

    // Micrometeor shake (0.5s duration)
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const intensity = (this.shakeTimer / 0.5) * this.shakeIntensity;
      const t = performance.now() * 0.06;
      cam.rotateLocal(
        Math.sin(t * 2.1) * intensity * 1.5,
        Math.cos(t * 2.7) * intensity * 1.5,
        Math.sin(t * 3.4) * intensity * 0.8,
      );
    }

    // Subtle solar storm screen rumble
    if (isSolarStorm && this.stormBlend > 0.1) {
      const t = performance.now() * 0.012;
      const subtle = this.stormBlend * 0.06;
      cam.rotateLocal(Math.sin(t * 3.1) * subtle, Math.cos(t * 2.3) * subtle, 0);
    }
  }

  // ── Micrometeor Impact ───────────────────────────────────────────────────

  /**
   * Triggers a micrometeor impact sequence:
   * - Brief white screen flash
   * - 0.5s camera shake
   * - Spawns 3–5 impact particle bursts on terrain
   */
  public triggerMicrometeorImpact() {
    this.flashIntensity = 1.0;
    this.shakeTimer = 0.5;
    this.shakeIntensity = 0.9;

    const cam = this.cameraEntity ?? (this.app.root.findByName("MainCamera") as pc.Entity | null);
    const centerPos = cam ? cam.getPosition() : new pc.Vec3(0, 0, 0);

    // Spawn 3 to 5 impact particle bursts on surrounding terrain
    const burstCount = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < burstCount; b++) {
      const angle = (b / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const dist = 25 + Math.random() * 55;
      const x = centerPos.x + Math.cos(angle) * dist;
      const z = centerPos.z + Math.sin(angle) * dist;
      const y = this.terrainHeight ? this.terrainHeight(x, z) : 0;

      this.spawnImpactBurst(x, y, z);
    }
  }

  private spawnImpactBurst(x: number, y: number, z: number) {
    const count = 10 + Math.floor(Math.random() * 5);
    let spawned = 0;

    for (const p of this.impactPool) {
      if (p.entity.enabled) continue;

      p.entity.enabled = true;
      p.entity.setPosition(x, y + 0.2, z);
      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = 4 + Math.random() * 10;
      p.vx = Math.cos(angle) * horizSpeed;
      p.vy = 5 + Math.random() * 8; // High upward ejection
      p.vz = Math.sin(angle) * horizSpeed;
      p.life = 0;
      p.maxLife = 0.8 + Math.random() * 0.6;
      p.baseScale = 0.25 + Math.random() * 0.2;
      p.entity.setLocalScale(p.baseScale, p.baseScale, p.baseScale);

      spawned++;
      if (spawned >= count) break;
    }
  }

  private updateImpactParticles(dt: number) {
    for (const p of this.impactPool) {
      if (!p.entity.enabled) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.entity.enabled = false;
        continue;
      }

      // Lunar gravity (1.62 m/s²) ballistic trajectory
      p.vy -= 1.62 * 3.0 * dt;
      const pos = p.entity.getPosition();
      p.entity.setPosition(pos.x + p.vx * dt, pos.y + p.vy * dt, pos.z + p.vz * dt);

      // Scale down over life
      const remaining = 1 - p.life / p.maxLife;
      const s = p.baseScale * remaining;
      p.entity.setLocalScale(s, s, s);
    }
  }

  // ── Dust Particles ───────────────────────────────────────────────────────

  private updateDustParticles(dt: number, isSolarStorm: boolean) {
    // Spawn dust particles at a rate proportional to stormBlend
    if (isSolarStorm && this.stormBlend > 0.05) {
      this.dustSpawnTimer += dt;
      const interval = pc.math.lerp(0.12, 0.02, this.stormBlend);
      if (this.dustSpawnTimer >= interval) {
        this.dustSpawnTimer = 0;
        this.spawnStormDust();
      }
    }

    // Advance active particles
    for (const d of this.dustPool) {
      if (!d.entity.enabled) continue;

      d.life += dt;
      if (d.life >= d.maxLife) {
        d.entity.enabled = false;
        continue;
      }

      // Strong lateral solar wind drift with slight gravity
      d.vy -= 1.62 * 0.5 * dt;
      const pos = d.entity.getPosition();
      d.entity.setPosition(pos.x + d.vx * dt, pos.y + d.vy * dt, pos.z + d.vz * dt);
    }
  }

  private spawnStormDust() {
    const cam = this.cameraEntity ?? (this.app.root.findByName("MainCamera") as pc.Entity | null);
    const cp = cam ? cam.getPosition() : new pc.Vec3(0, 15, 30);

    for (const d of this.dustPool) {
      if (d.entity.enabled) continue;

      d.entity.enabled = true;
      // Spawn upwind of camera in a volume
      d.entity.setPosition(
        cp.x - 20 + (Math.random() - 0.5) * 15,
        cp.y - 2 + Math.random() * 8,
        cp.z + (Math.random() - 0.5) * 25,
      );

      // Sweeping lateral solar storm wind (vx 16–28 m/s)
      d.vx = 16 + Math.random() * 12;
      d.vy = (Math.random() - 0.3) * 2;
      d.vz = (Math.random() - 0.5) * 8;
      d.life = 0;
      d.maxLife = 1.2 + Math.random() * 0.8;
      break;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  public destroy() {
    // Restore baseline scene lighting
    if (this.sunLight?.light) {
      this.sunLight.light.intensity = this.baseSunIntensity;
      this.sunLight.light.color.copy(this.baseSunColor);
    }
    if (this.app.scene) {
      this.app.scene.ambientLight.copy(this.baseAmbient);
      if (this.app.scene.fog) {
        this.app.scene.fog.start = this.baseFogStart;
        this.app.scene.fog.end = this.baseFogEnd;
        this.app.scene.fog.color.copy(this.baseFogColor);
      }
    }

    // Clean up entities
    if (this.overlayHolder) {
      this.overlayHolder.destroy();
      this.overlayHolder = null;
    }
    this.dustRoot.destroy();
    this.impactRoot.destroy();

    // Clean up DOM overlays
    if (this.domOverlay?.parentElement) {
      this.domOverlay.parentElement.removeChild(this.domOverlay);
    }
    if (this.domFlash?.parentElement) {
      this.domFlash.parentElement.removeChild(this.domFlash);
    }
  }
}
