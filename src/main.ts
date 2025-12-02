import "./style.css";

/**
 * Complex Ginzburg-Landau Simulation
 * ==================================
 * * This class simulates a 2D Complex Scalar Field (psi = u + iv) evolving over time.
 * It is a fundamental model in condensed matter physics used to describe:
 * 1. Superconductivity (Macroscopic quantum states)
 * 2. Superfluids (Liquid Helium)
 * 3. Topological Defects (Vortices)
 * * Unlike the XY model which only tracks "angle", this model tracks 
 * "magnitude" and "angle" via real/imaginary components (u, v).
 */
class GinzburgLandauSimulation {
  // --- Rendering Contexts ---
  // We use a dual-canvas strategy for performance and aesthetics:
  // 1. 'offscreen': A tiny canvas where 1 pixel = 1 simulation cell (Fast drawing).
  // 2. 'canvas': The main display where we draw the tiny image scaled up.
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private offscreenImageData: ImageData | null = null;

  // --- Grid Dimensions ---
  private gridSizeX = 0;
  private gridSizeY = 0;
  private cellWidth = 0;
  private cellHeight = 0;
  
  // Resolution Control
  // Determines how "blocky" the simulation is.
  // Smaller = High Res (slower). Larger = Low Res (faster).
  private targetCellSize = 12; 

  // Rendering Options
  // Default OFF: Shows raw pixels to emphasize the discrete grid nature.
  private smoothRendering = false;

  // Safety Flags
  // Prevents flashing lights from surprising the user during drag operations.
  private hasShownEpilepsyWarning = false;

  // --- Physics State ---
  // The field is a complex number psi = u + i*v
  // We use TypedArrays (Float32Array) for maximum performance.
  private u: Float32Array; // Real component
  private v: Float32Array; // Imaginary component
  
  // Double Buffering:
  // We calculate 'Next' based on 'Current'. If we wrote to 'Current' directly
  // during the loop, updates would propagate directionally across the grid
  // within a single frame, causing artifacts.
  private uNext: Float32Array;
  private vNext: Float32Array;

  // --- Physics Constants ---
  private diffusion = 0.5; // How fast information/energy spreads
  private dt = 0.2;        // Time step (must be small for stability)
  
  // --- Animation State ---
  private frameCount = 0;
  private isPaused = false;
  // private lastFrameTime = 0;

  // --- Interactive Parameters ---
  private simulationSpeed = 1; // Physics steps per render frame
  private noiseLevel = 0;      // Thermal fluctuations

  // --- User Interaction ---
  private isMouseDownOnCanvas = false;
  private lastSpawnPos = { x: 0, y: 0 }; // Used to space out vortices when dragging
  
  // Topological State Flip-Flop
  // We alternate between spawning +1 and -1 vortices.
  // This allows the user to "undo" a vortex by clicking near it again.
  private nextWinding = 1; 

  // --- UI Elements ---
  private controlsPanel: HTMLElement;
  private isDraggingPanel = false;
  private dragOffset = { x: 0, y: 0 };
  private infoButton: HTMLElement;
  private infoModal: HTMLElement;
  private infoCloseButtonDesktop: HTMLElement;
  private infoCloseButtonMobile: HTMLElement;
  private rotateButton: HTMLElement; 

  constructor(canvasId: string, controlsId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    // alpha: false creates an opaque canvas, which is faster for the browser to composite
    this.ctx = this.canvas.getContext("2d", { alpha: false })!; 
    this.controlsPanel = document.getElementById(controlsId)!;

    // Create the hidden buffer for raw pixel manipulation
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false })!;

    // UI Hookups
    this.infoButton = document.getElementById("info-button")!;
    this.infoModal = document.getElementById("info-modal")!;
    this.infoCloseButtonDesktop = document.getElementById("info-close-button-desktop")!;
    this.infoCloseButtonMobile = document.getElementById("info-close-button-mobile")!;
    this.rotateButton = document.getElementById("rotate-button")!;

    // Initialize arrays (size 0 initially, resized in setupCanvas)
    this.u = new Float32Array(0);
    this.v = new Float32Array(0);
    this.uNext = new Float32Array(0);
    this.vNext = new Float32Array(0);

    this.setupCanvas();
    this.loadPanelPosition();
    this.setupEventListeners();

    // this.lastFrameTime = performance.now();
    this.animate();
  }

  /**
   * Calculates grid size based on window size and target resolution.
   * Called on init and resize.
   */
  private setupCanvas(): void {
    const container = document.getElementById("simulation-container");
    if (!container) return;

    // 1. Setup Main Display Canvas (Visual Output)
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    // 2. Calculate Grid Dimensions based on Resolution Slider
    // Ensure we don't create a grid so dense it crashes the browser (min size 2px)
    const safeCellSize = Math.max(2, this.targetCellSize);
    this.gridSizeX = Math.ceil(this.canvas.width / safeCellSize);
    this.gridSizeY = Math.ceil(this.canvas.height / safeCellSize);
    
    // Calculate the ratio for mouse interactions
    this.cellWidth = this.canvas.width / this.gridSizeX;
    this.cellHeight = this.canvas.height / this.gridSizeY;

    // 3. Setup Offscreen Buffer (1 pixel per grid cell)
    this.offscreenCanvas.width = this.gridSizeX;
    this.offscreenCanvas.height = this.gridSizeY;
    // ImageData allows us to write directly to the pixel memory array (Fastest method)
    this.offscreenImageData = this.offscreenCtx.createImageData(this.gridSizeX, this.gridSizeY);

    // 4. Allocate Physics Arrays
    const totalCells = this.gridSizeX * this.gridSizeY;
    this.u = new Float32Array(totalCells);
    this.v = new Float32Array(totalCells);
    this.uNext = new Float32Array(totalCells);
    this.vNext = new Float32Array(totalCells);

    this.initializeGrid();
  }

  /**
   * Sets the initial state: A "hot" random soup.
   * The magnitude is small, so the system will naturally "grow" into the
   * stable state (magnitude = 1) over time.
   */
  public initializeGrid(): void {
    for (let i = 0; i < this.u.length; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const mag = 0.1 + Math.random() * 0.1;
      this.u[i] = mag * Math.cos(angle);
      this.v[i] = mag * Math.sin(angle);
    }
  }

  /**
   * Handles user interaction (Click/Drag).
   * Spawns a SINGLE vortex.
   * * Note: Because our grid is a Torus (periodic boundaries), adding a single
   * vortex with charge +1 creates a topological mismatch at the edges of the screen.
   * The physics engine will likely spawn a "Ghost" anti-vortex to heal this seam.
   */
  private spawnVortex(screenX: number, screenY: number): void {
    const cx = screenX / this.cellWidth;
    const cy = screenY / this.cellHeight;
    
    // Imprint a single defect
    this.imprintSingleVortex(cx, cy, this.nextWinding);

    // Toggle winding for next click so user can annihilate them manually
    // (+1, then -1, then +1...)
    this.nextWinding *= -1;
  }

  /**
   * Imprints a SINGLE vortex onto the field.
   * This simply rotates the phase around the center point.
   */
  private imprintSingleVortex(cx: number, cy: number, winding: number): void {
      const w = this.gridSizeX;
      const h = this.gridSizeY;
      
      // Wrap coordinate calculations to ensure the vortex center is valid on the torus
      const x1 = (cx + w) % w; 
      const y1 = (cy + h) % h; 

      // Iterate over the ENTIRE grid to apply the phase shift globally
      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const idx = y * w + x;

              let u = this.u[idx];
              let v = this.v[idx];

              // Calculate shortest distance on the Torus
              // This logic handles the "wrap-around" math
              let dx1 = x - x1;
              let dy1 = y - y1;
              if (dx1 > w / 2) dx1 -= w;
              if (dx1 < -w / 2) dx1 += w;
              if (dy1 > h / 2) dy1 -= h;
              if (dy1 < -h / 2) dy1 += h;

              // Calculate angle relative to the core
              const ang1 = Math.atan2(dy1, dx1);
              
              // The topological charge: winding number * angle
              const deltaPhase = ang1 * winding;

              // Soft Core Logic:
              // Dip the magnitude near the center to help the physics engine 
              // accept the new singularity.
              const dist1 = Math.sqrt(dx1*dx1 + dy1*dy1);
              const coreProfile = Math.min(1.0, dist1 / 4.0); 
              const softProfile = 0.2 + 0.8 * Math.tanh(coreProfile); 

              // Apply rotation (Phase Shift)
              const cosP = Math.cos(deltaPhase);
              const sinP = Math.sin(deltaPhase);
              
              const uNew = u * cosP - v * sinP;
              const vNew = u * sinP + v * cosP;

              // Apply to state
              this.u[idx] = uNew * softProfile;
              this.v[idx] = vNew * softProfile;
          }
      }
  }

  /**
   * The Physics Engine (Solver)
   * Solves the Time-Dependent Ginzburg-Landau equation:
   * d(psi)/dt = D * Laplacian(psi) + psi * (1 - |psi|^2)
   */
  private updatePhysics(): void {
    const w = this.gridSizeX;
    const h = this.gridSizeY;
    const size = w * h;

    // Optional: Add thermal noise (temperature)
    if (this.noiseLevel > 0) {
      const noiseScale = this.noiseLevel * 0.1;
      for (let i = 0; i < size; i++) {
        this.u[i] += (Math.random() - 0.5) * noiseScale;
        this.v[i] += (Math.random() - 0.5) * noiseScale;
      }
    }

    // --- Main Solver Loop ---
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const u = this.u[i];
        const v = this.v[i];

        // 1. Calculate Laplacian (Diffusion Term)
        // We check 4 neighbors, handling periodic boundaries (Torus topology)
        const left = this.u[y * w + ((x - 1 + w) % w)];
        const right = this.u[y * w + ((x + 1) % w)];
        const up = this.u[((y - 1 + h) % h) * w + x];
        const down = this.u[((y + 1) % h) * w + x];
        
        const laplacianU = left + right + up + down - 4 * u;

        const leftV = this.v[y * w + ((x - 1 + w) % w)];
        const rightV = this.v[y * w + ((x + 1) % w)];
        const upV = this.v[((y - 1 + h) % h) * w + x];
        const downV = this.v[((y + 1) % h) * w + x];

        const laplacianV = leftV + rightV + upV + downV - 4 * v;

        // 2. Calculate Reaction Term (Non-linear potential)
        // This term forces the magnitude (|psi|) to relax towards 1.0.
        // It creates the "Sombrero Potential" shape.
        const magSq = u * u + v * v;
        const reaction = 1 - magSq;

        // 3. Euler Integration Step
        this.uNext[i] = u + this.dt * (this.diffusion * laplacianU + u * reaction);
        this.vNext[i] = v + this.dt * (this.diffusion * laplacianV + v * reaction);
      }
    }

    // Swap buffers for the next frame
    const tempU = this.u;
    this.u = this.uNext;
    this.uNext = tempU;

    const tempV = this.v;
    this.v = this.vNext;
    this.vNext = tempV;
  }

  /**
   * Rendering Pipeline
   * 1. Draw physics data to the offscreen buffer (1 pixel per cell).
   * 2. Draw the offscreen buffer to the main canvas (scaled up).
   */
  private draw(): void {
    if (!this.offscreenImageData) return;

    const data = this.offscreenImageData.data;
    const len = this.u.length;

    // Iterate over simulation cells
    for (let i = 0; i < len; i++) {
        const u = this.u[i];
        const v = this.v[i];
        
        const magSq = u*u + v*v;
        const mag = Math.sqrt(magSq);
        const angle = Math.atan2(v, u);

        // Map Phase Angle to Hue (Color)
        let hue = (angle * 180 / Math.PI + 360) % 360;
        
        // Map Magnitude to Lightness
        // Core (0) -> Black
        // Field (1) -> Bright Color
        const lightness = Math.min(1.0, mag) * 50; 

        // Convert to RGB for the pixel buffer
        const [r, g, b] = this.hslToRgb(hue / 360, 1.0, lightness / 100);

        const pxIndex = i * 4;
        data[pxIndex] = r;
        data[pxIndex + 1] = g;
        data[pxIndex + 2] = b;
        data[pxIndex + 3] = 255; // Alpha
    }
    
    // 1. Update Offscreen Buffer
    this.offscreenCtx.putImageData(this.offscreenImageData, 0, 0);

    // 2. Configure Main Canvas Scaling
    // 'smoothRendering' controls if we use Bilinear (Smooth) or Nearest-Neighbor (Blocky) scaling
    this.ctx.imageSmoothingEnabled = this.smoothRendering;
    this.ctx.imageSmoothingQuality = 'high';

    // 3. Draw Scaled Image
    this.ctx.drawImage(
        this.offscreenCanvas, 
        0, 0, this.gridSizeX, this.gridSizeY, // Source rect (Tiny)
        0, 0, this.canvas.width, this.canvas.height // Dest rect (Full Screen)
    );
  }

  // --- Helper: Fast HSL to RGB conversion ---
  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = this.hue2rgb(p, q, h + 1 / 3);
      g = this.hue2rgb(p, q, h);
      b = this.hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  private hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  // --- Animation Loop ---
  private animate(_currentTime: number = 0): void {
    // const deltaTime = currentTime - this.lastFrameTime;
    // this.lastFrameTime = currentTime;

    if (!this.isPaused) {
      // We can run multiple physics steps per visual frame to speed up the simulation
      for(let i=0; i<this.simulationSpeed; i++) {
          this.updatePhysics();
          this.frameCount++; 
      }
      this.draw();
    }
    requestAnimationFrame((time) => this.animate(time));
  }

  // --- UI Logic: Panel Dragging & Setup ---
  private loadPanelPosition(): void {
    if (window.innerWidth > 600) {
      const savedX = localStorage.getItem("panelX");
      const savedY = localStorage.getItem("panelY");
      if (savedX && savedY) {
        this.controlsPanel.style.left = `${savedX}px`;
        this.controlsPanel.style.top = `${savedY}px`;
      }
    }
  }

  private setupEventListeners(): void {
    const resetButton = document.getElementById("reset-button")!;
    const speedSlider = document.getElementById("speed-slider") as HTMLInputElement;
    const tempSlider = document.getElementById("temp-slider") as HTMLInputElement;
    const resolutionSlider = document.getElementById("resolution-slider") as HTMLInputElement;
    const smoothToggle = document.getElementById("smooth-toggle") as HTMLInputElement;

    resetButton.addEventListener("click", () => this.initializeGrid());
    
    // Stop event propagation so clicking UI doesn't click the canvas
    const interactables = [
        resetButton, speedSlider, tempSlider, resolutionSlider, 
        smoothToggle, smoothToggle.parentElement!, 
        this.infoButton, this.rotateButton
    ];
    interactables.forEach(el => {
        if(el) el.addEventListener("mousedown", e => e.stopPropagation());
    });

    // Control Handlers
    speedSlider.addEventListener("input", (e) => {
      this.simulationSpeed = parseInt((e.target as HTMLInputElement).value);
    });
    
    tempSlider.addEventListener("input", (e) => {
      this.noiseLevel = parseInt((e.target as HTMLInputElement).value) / 100;
    });

    resolutionSlider.addEventListener("change", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        const mapping = [24, 18, 12, 8, 4];
        const newSize = mapping[val - 1] || 12;
        this.targetCellSize = newSize;
        this.setupCanvas(); // Re-allocate grid
    });

    smoothToggle.addEventListener("change", (e) => {
        this.smoothRendering = (e.target as HTMLInputElement).checked;
        this.draw(); 
    });

    window.addEventListener("resize", () => this.setupCanvas());

    // --- Interaction Listeners ---
    this.canvas.addEventListener("mousedown", (e) => {
      if (!this.isDraggingPanel) {
        this.isMouseDownOnCanvas = true;
        const coords = this.getCanvasCoordinates(e);
        if (coords) {
            this.spawnVortex(coords.x, coords.y); // Spawn immediately on click
            this.lastSpawnPos = coords;
        }
      }
    });
    
    this.canvas.addEventListener("mousemove", (e) => {
        if(this.isMouseDownOnCanvas) {
            const coords = this.getCanvasCoordinates(e);
            if (coords) {
                // Only spawn if we've dragged far enough (prevents piling up)
                const dist = Math.hypot(coords.x - this.lastSpawnPos.x, coords.y - this.lastSpawnPos.y);
                if (dist > 30) { // Threshold in pixels
                    // Alert Logic for Dragging (Epilepsy Warning)
                    if (!this.hasShownEpilepsyWarning) {
                        this.hasShownEpilepsyWarning = true;
                        // Release mouse so they stop dragging while reading alert
                        this.isMouseDownOnCanvas = false;
                        alert("Epilepsy Warning: Rapid flashing lights may occur when dragging. Proceed with caution.");
                        return; // Stop this spawn event
                    }
                    this.spawnVortex(coords.x, coords.y);
                    this.lastSpawnPos = coords;
                }
            }
        }
    });
    
    window.addEventListener("mouseup", () => this.isMouseDownOnCanvas = false);

    // Touch Support
    this.canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const coords = this.getCanvasCoordinates(e);
        if(coords) {
            this.isMouseDownOnCanvas = true;
            this.spawnVortex(coords.x, coords.y);
            this.lastSpawnPos = coords;
        }
    }, {passive: false});
    
    this.canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if(this.isMouseDownOnCanvas) {
            const coords = this.getCanvasCoordinates(e);
            if (coords) {
                const dist = Math.hypot(coords.x - this.lastSpawnPos.x, coords.y - this.lastSpawnPos.y);
                if (dist > 30) {
                    if (!this.hasShownEpilepsyWarning) {
                        this.hasShownEpilepsyWarning = true;
                        this.isMouseDownOnCanvas = false;
                        alert("Epilepsy Warning: Rapid flashing lights may occur when dragging. Proceed with caution.");
                        return;
                    }
                    this.spawnVortex(coords.x, coords.y);
                    this.lastSpawnPos = coords;
                }
            }
        }
    }, {passive: false});
    
    window.addEventListener("touchend", () => this.isMouseDownOnCanvas = false);

    // Panel Dragging Logic
    this.controlsPanel.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'LABEL';
      if (window.innerWidth > 600 && !isInput) {
        this.isDraggingPanel = true;
        this.dragOffset.x = e.clientX - this.controlsPanel.offsetLeft;
        this.dragOffset.y = e.clientY - this.controlsPanel.offsetTop;
      }
    });
    window.addEventListener("mousemove", (e) => {
        if (this.isDraggingPanel) {
            this.controlsPanel.style.left = `${e.clientX - this.dragOffset.x}px`;
            this.controlsPanel.style.top = `${e.clientY - this.dragOffset.y}px`;
        }
    });
    window.addEventListener("mouseup", () => {
        if (this.isDraggingPanel) {
            this.isDraggingPanel = false;
            localStorage.setItem("panelX", this.controlsPanel.style.left.replace("px", ""));
            localStorage.setItem("panelY", this.controlsPanel.style.top.replace("px", ""));
        }
    });

    // Info Modal
    this.infoButton.addEventListener("click", () => {
        this.infoModal.classList.remove("hidden");
        this.isPaused = true;
    });
    const closeModal = () => {
        this.infoModal.classList.add("hidden");
        this.isPaused = false;
        // this.lastFrameTime = performance.now();
    };
    this.infoCloseButtonDesktop.addEventListener("click", closeModal);
    this.infoCloseButtonMobile.addEventListener("click", closeModal);
    this.infoModal.addEventListener("click", (e) => {
        if(e.target === this.infoModal) closeModal();
    });
  }

  // Helper to get coordinates relative to the canvas
  private getCanvasCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else if (event instanceof TouchEvent && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      return null;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new GinzburgLandauSimulation("simulation-canvas", "controls");
});