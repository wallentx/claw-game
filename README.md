<p align="center">
<img src="https://github.com/user-attachments/assets/b52f0314-7551-4d02-950f-e50f0d39548d" alt="Claw Machine Game" width="500">
<h1 align="center">Claw Machine Game</h2>
</p>

This project was developed under the guidance of LLMs. It's purpose is to serve as a mile-marker to show what AI assisted development is capable of.
This is a claw machine game built using [Three.js](https://threejs.org/) for 3D rendering and [Cannon-es](https://github.com/pmndrs/cannon-es) for physics simulation. It simulates a traditional claw machine complete with a movable gantry, a physics-driven claw (represented as a cone with pivoting arms), and prizes that the claw can attempt to grab.

## Overview

- **3D Graphics & Physics:**  
  The game uses Three.js to render a 3D environment and Cannon-es to simulate realistic physics for the gantry, claw, cable, and prizes.

- **Interactive Controls:**  
  Users can move the gantry using on-screen buttons or arrow keys and control the claw’s grab action with a button or the spacebar.

- **Cable Simulation:**  
  A visual cable (rendered as a spline) connects the gantry to the claw, mirroring the physics constraint between them.

## AI-Assisted Development Milestone

This project exists as a mile-marker in the evolution of AI-assisted software development. I used large language models (LLMs) extensively to help design, debug, and refine this project. Their assistance not only accelerated development but also provided creative and technical insights into integrating physics with 3D graphics in web applications. This project stands as a testament to the growing capabilities of AI and serves as a record of this transformative period.

## Installation

### 1. Clone the Repository:
```bash
git clone <repository-url>
cd claw-machine-game
```

### 2. Install Dependencies:
```bash
npm install
```

### 3. Start the Server:
```bash
node server.js
```

### 4. Open in Your Browser:

Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

- **Gantry Movement:**  
  Use the on-screen buttons or arrow keys to move the gantry horizontally within the machine.

- **Claw Operation:**  
  Press the "Grab!" button or the spacebar to drop the claw and attempt to grab a prize. The claw’s drop and retract actions are driven by a simulated cable.

- **Physics Interactions:**  
  The physics simulation handles collisions between the claw, prizes, floor, and walls. You can adjust simulation parameters (mass, damping, constraint stiffness) directly in the code.

## Contributing

Contributions, suggestions, and bug reports are welcome! Feel free to open an issue or submit a pull request.
