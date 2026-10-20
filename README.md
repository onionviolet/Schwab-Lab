# Schwab Lab 🚀

**Research in motion.** A responsive, browser-based website for educational rocket flight visualization, 3D trajectory plotting and post-flight vector analysis.

> No server, installation, API key, or npm build required. This project uses plain HTML, CSS and JavaScript, and can be hosted on GitHub Pages.

## Project structure

```text
schwab-lab/
├── index.html                 # Landing page (required at the publishing root)
├── lab.html                   # Flight Lab interface
├── assets/
│   ├── css/
│   │   ├── home.css           # Landing page styles
│   │   └── lab.css            # Flight Lab styles
│   ├── js/
│   │   └── flight-lab.js      # Flight playback, charting and CSV parsing
│   └── icons/
│       └── favicon.svg
├── data/
│   └── sample_flight.csv      # Example dataset for import
├── .nojekyll                 # Serve static source without Jekyll processing
├── .gitignore
└── README.md
```

## Launch it locally

1. Open `index.html` in your browser.
2. Click **Open Flight Lab**.
3. Use the example dataset, or choose **Import flight CSV** in the lab and select `data/sample_flight.csv`.

For development, you can optionally run a local static server from the folder root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser. No external dependencies are used.

## Publish on GitHub Pages

1. Visit [GitHub](https://github.com/new) and create a new **public** repository named `schwab-lab` (or any other name).
2. Open the repository. Select **Add file → Upload files**.
3. Drag the **contents of this folder** into GitHub: `index.html` and `lab.html` must be at the **repository root**, alongside `assets/` and `data/`.
4. Commit the files to the `main` branch.
5. Open **Settings → Pages → Build and deployment**.
6. Select **Source: Deploy from a branch**, **Branch: main**, and **Folder: /(root)**. Click **Save**.
7. When publishing is complete, GitHub shows your website URL in the Pages settings. It will normally look like:

   `https://YOUR-USERNAME.github.io/schwab-lab/`

Refer to [GitHub's official Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) if the menu changes.

### Using git instead of uploading files

From inside the `schwab-lab` directory:

```bash
git init
git branch -M main
git add .
git commit -m "Initial Schwab Lab website"
git remote add origin https://github.com/YOUR-USERNAME/schwab-lab.git
git push -u origin main
```

Create the empty GitHub repository first and replace `YOUR-USERNAME` with your GitHub username. If you create a repository with an initial README, use GitHub's upload UI or reconcile the commits before pushing.

## What Flight Lab supports

- Rotatable 2D-canvas projection of a 3D trajectory (east, north, up axes)
- Animation timeline, scrubber, playback speed, and step-by-step review
- Direction overlays for velocity, acceleration, and an optional reference vector
- Current and peak altitude, displacement, velocity components, and speed readouts
- Time series charts of altitude and speed
- Import/export CSV files locally in the browser
- Illustrative, simplified free-flight demonstration

### CSV schema

Required columns: `time` and `z` (altitude). Optional positions: `x`, `y`. Optional velocity and acceleration columns: `vx`, `vy`, `vz`, `ax`, `ay`, `az`.

- Time is in seconds and **must strictly increase**.
- Position is in meters, in an east / north / up Cartesian frame.
- Provide at least three samples.
- If vector columns are absent, the browser approximates them by finite differences.
- CSV data remains on your device; files are not sent to any server.

Example:

```csv
time,x,y,z
0,0,0,0
1,1,0,10
2,2,1,18
3,3,2,21
4,4,3,19
5,5,3,12
6,6,4,0
```

## Scope and limitations

Schwab Lab is for **educational visualization and post-flight analysis**. Its built-in example does not model a specific rocket or motor, and the 3D display is a projected drawing rather than a high-fidelity rigid-body simulator. The displayed vector arrows indicate direction, not absolute magnitude. The project does **not** provide commands for steering, targeting, guidance, or in-flight control of physical vehicles. Do not use the demonstration to determine launch conditions, expected apogee, flight safety, or deployment timing.

## Editing

- Change homepage text/markup in `index.html` and colors/layout in `assets/css/home.css`.
- Change Flight Lab controls/markup in `lab.html` and styling in `assets/css/lab.css`.
- Change data-processing and visualization logic in `assets/js/flight-lab.js`.
- Publish updates simply by committing changes to `main` after enabling Pages.