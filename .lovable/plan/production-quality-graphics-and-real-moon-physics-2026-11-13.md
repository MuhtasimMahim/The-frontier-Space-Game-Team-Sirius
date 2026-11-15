# Production-quality graphics and real Moon physics

Today the astronaut, rover and buildings are made of simple boxes and spheres. Nothing has gravity: the astronaut can't jump, and the rover slides over the ground without bouncing. This plan fixes both while keeping the game in the browser.

## 1. Real 3D models (biggest visual jump)

- Replace the box astronaut, rover, lander, habitat, farm, lab, solar panels and water tank with free, high-detail 3D models (NASA's public 3D library and other free model libraries).
- Give the astronaut walking and bouncing animations.
- Show a clear construction stage for each module: frame, then shell, then finished.

## 2. Realistic Moon surface

- Use real lunar ground textures (surface detail, bumpiness and roughness) instead of the generated noise.
- Model the terrain on NASA's south-pole elevation data, with real crater rims and ridges.
- Add scattered rocks with detail, plus permanently shadowed craters where the ice sits.

## 3. Lighting and camera effects

- Harsh, low sun along the horizon with long, sharp shadows, the way it really looks at the south pole.
- A higher-quality reflection setup so metal and visor surfaces reflect properly.
- Subtle bloom on lights and the sun, sharper edges, and color grading.
- Dust kicked up by the rover wheels and by footsteps, falling in clean arcs because there's no air.

## 4. Real Moon physics

- Gravity at 1.62 m/s², one-sixth of Earth's.
- The astronaut gets a bouncy "bunny-hop" walk, high slow jumps (Space) and low traction.
- The rover gets suspension, wheel grip, the ability to tip on steep slopes, and collisions with rocks and buildings.
- Ice harvesting and unloading stay the same.

## 5. Production polish

- Quality settings (Low / Medium / High) with automatic detection, so phones and laptops still run smoothly.
- A loading screen while the models download.
- Recorded sound effects for footsteps, the rover engine and suit breathing.

## Order of work

1. Physics and controls (core feel)
2. Models and animations
3. Terrain and textures
4. Lighting, effects and dust
5. Quality settings, loading screen, sound

## Limits

- This is a browser game, so it will look like a strong indie game rather than a big-studio console title.
- I can't check frame rate, feel or sound here. You'll need to test those on your own device after each step.

## Technical details

- Keep the PlayCanvas engine. Add `ammo.js` physics through PlayCanvas rigidbody/collision components: a heightfield or mesh collider for the terrain, a kinematic capsule character, and a raycast-vehicle rover. Set gravity to (0, -1.62, 0).
- Load GLB assets through lovable-assets pointers, compress them with Draco/meshopt, and validate each one before use.
- Use PBR materials with normal and roughness maps, an IBL environment from a local cubemap, and CameraFrame post-processing (bloom, TAA, ACES, vignette).
- Feel values (jump impulse, friction, suspension stiffness) become named constants in config.ts. Add unit tests for the gravity and jump rules.
