"""
# Ginzburg-Landau Vortex Simulation 🌀

This project is an interactive web-based simulation visualizing the **Time-Dependent Ginzburg-Landau (TDGL) equation**, a fundamental model in condensed matter physics. It demonstrates the dynamics of a **Complex Scalar Field** ($\psi = u + iv$), revealing how macroscopic quantum states like superconductors and superfluids evolve, stabilize, and form **topological defects (vortices)**.

Built with TypeScript and rendered using a high-performance, dual-layer HTML Canvas system.

---

## Live Simulation

**Explore the simulation here:** 👉 [**https://bobbyconnolly.com/ginzburg-landau-simulation/**](https://bobbyconnolly.com/ginzburg-landau-simulation/)

---

## What It Shows

* **Complex Scalar Field:** Unlike simple vector models, this simulates a field with both **Magnitude** (density/brightness) and **Phase** (angle/color). The system naturally evolves towards a stable magnitude of 1.0 (the "Mexican Hat" potential).
* **Topological Defects (Vortices):** Observe how the field twists. If the phase winds around by $360^\circ$, the math forces the magnitude to drop to **zero** at the center to avoid a singularity. These are the black dots—stable "knots" in the field.
* **Quantization:** Rotation in this quantum fluid is quantized. You cannot have 1.5 twists; it must be an integer (Winding Number).
* **Topology on a Torus:** The simulation runs on a grid with periodic boundaries (a Torus). Because a Torus cannot hold a net topological charge, spawning a single vortex creates a global **Branch Cut** (a "seam" in the universe). Watch how the physics engine violently reacts to "heal" this tear!

---

## Interactive Features

* **Spawn Vortex:** Click or Drag on the canvas to imprint a topological defect into the field.
* **The "Flip-Flop" Switch:** The simulation alternates between spawning a **Vortex (+1)** and an **Anti-Vortex (-1)** on each click. This allows for manual annihilation experiments.
* **Heal the Universe:** Try double-clicking near a vortex! By placing an Anti-Vortex on top of a Vortex, you cancel the topological charge, and the field heals back to a smooth state.
* **Smooth vs. Grid View:** Toggle the **"Smooth"** checkbox to switch between the "Physics" view (Bilinear Interpolation, representing a continuous fluid) and the "Computer Science" view (Raw Pixels, representing the discrete calculation grid).
* **Epilepsy Protection:** Includes a safety alert if rapid dragging is detected, as high-speed vortex generation can cause flashing.

---

## The Physics (TDGL Equation)

The simulation solves the following partial differential equation in real-time:

$$ \frac{\partial \psi}{\partial t} = D \nabla^2 \psi + \psi(1 - |\psi|^2) $$

* **Diffusion Term ($D \nabla^2 \psi$):** Smooths out the field, analogous to heat spreading.
* **Reaction Term ($\psi(1 - |\psi|^2)$):** Forces the field magnitude to relax to the lowest energy state ($|\psi| = 1$).

This equation models phase transitions in:
* **Superconductors:** The onset of superconductivity and magnetic flux tubes.
* **Superfluids:** Quantum vortices in Liquid Helium-4.
* **Cosmology:** The formation of cosmic strings in the early universe (Kibble-Zurek mechanism).

---

## Running Locally

This project uses [Vite](https://vitejs.dev/) with TypeScript.

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd <repo-name>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
4.  Open your browser to the local address provided (usually `http://localhost:5173`).

---

Find the source code on [GitHub](https://github.com/bobbyconnolly/u1).
"""