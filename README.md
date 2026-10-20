# Schwab Lab 🚀

**Research in motion.** A responsive, browser-based website for educational rocket flight visualization, 3D trajectory plotting and post-flight vector analysis.

> No server, installation, API key, or npm build required. This project uses plain HTML, CSS and JavaScript, and can be hosted on GitHub Pages.

## Project structure

```text
schwab-lab/
├── index.html                 # Landing page (required at the publishing root)
├── lab.html                   # Flight Lab interface
├── physics.html               # Model physics, OpenRocket inspection, saving
├── assets/
│   ├── css/
│   │   ├── home.css           # Landing page styles
│   │   ├── lab.css            # Flight Lab styles
│   │   └── physics.css        # Design Archive styles
│   ├── js/
│   │   ├── flight-lab.js      # Flight playback, charting and CSV parsing
│   │   ├── physics-lab.js     # OpenRocket inspection and project saving
│   │   ├── simulation-viewer.js # Saved OpenRocket data visualization
│   │   └── jszip.min.js       # Locally bundled JSZip ZIP reader
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


## Design Archive (version 2.1)

The `physics.html` workspace inspects previously saved OpenRocket `.ork` or uncompressed XML design files locally. It lists rocket components, recorded motor selections, and saved OpenRocket simulation summaries when present. It allows you to document recorded mass, aerodynamic drag coefficient, impulse and burn time without creating a powered-flight prediction or guidance output.

- **Import .ork**: unpack the ZIP in the browser with a locally bundled copy of JSZip and read `rocket.ork` metadata. Files are limited to 8 MB; XML is capped at 12 MB.
- **Save to browser**: local IndexedDB project library.
- **Export project**: portable `.schwab.json` file, including notes, recorded properties and any attached original `.ork` bytes.
- **Open project**: restore from exported `.schwab.json` files.
- **Download original .ork**: recover the unmodified source file.
- **Flight Lab**: save and reload one trajectory locally, import recorded CSV trajectories, visualize measured motion, and export CSV.

All data stays in the browser. Browser storage can be cleared, so export backups. The site is an educational inspection/analysis tool and does **not** predict powered rocket performance, control hardware, or provide flight guidance.

### Replay saved OpenRocket simulation results

In **Design Archive**, import a `.ork` file and scroll down to **Saved Flight Replay**. Select a simulation and, where applicable, a flight-data branch (for example, a separated stage).

The viewer reads existing OpenRocket XML `<flightdata><databranch types="..."><datapoint>...` entries and displays **only recorded data** in four customizable graphs. Available fields may include altitude, total or vertical velocity, acceleration, drag, thrust, mass, and other fields already saved in the file. The time scrubber displays a moving cursor and nearby recorded event labels. You can click a chart to inspect a saved timestamp and export the selected branch as CSV. The selected plot/time position is included in Schwab Lab project saves.

Not all `.ork` files contain the full time series: OpenRocket may store only summary metadata depending on its save settings. When no data points are embedded, Schwab Lab displays a clear summary-only message rather than generating values. Up to 12 flight-data branches and 12,000 displayed samples per branch are parsed; longer time series are *downsampled for viewing and CSV export*, while the original `.ork` is preserved in the project file.

**This is a read-only viewer, not a replacement for OpenRocket's physics simulation engine.** It does not calculate expected launch behavior or provide active guidance or control.

## Launch Environment & conservative federal flags (version 2.2)

Design Archive now stores launch-location reference coordinates selected from a map or typed manually, date and time, recorded launch angle, temperature, pressure, and wind. The map is for documenting a site **only**, not choosing a safe launch site. It uses Leaflet and OpenStreetMap tiles over the network; the rest of the app works offline without the map. Nothing is geolocated automatically. These fields are included in browser saves and exported `.schwab.json` projects, and old archive files still open.

An automatic **Regulatory Flags** panel compares recorded entries with selected FAA amateur-rocket rules in 14 CFR Part 101. It flags missing data, Class 1 classification conflicts (loaded mass, propellant mass, materials, and propellant type), self-reported hazards, and additional review obligations potentially relevant to non-Class 1 activities. All flags cite official sources.

**Critical limits:** This is not legal advice, a regulatory clearance, a live airspace check, or a launch-safety determination. It never returns approval or 'safe to launch'. It does not query FAA NOTAMs, airport boundaries, temporary flight restrictions, restricted airspace, or local laws. Separately consult FAA resources and qualified adult supervision. An imported `.ork` is not proof its entered materials or motor are compliant; undocumented inputs remain unknown.

## Guidance Research

`guidance.html` holds the future passive research roadmap, reference-frame concepts and measurement notes. It does not produce steering commands, motor selection advice, live guidance, or in-flight control.

Official sources: [14 CFR Part 101 Subpart C](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-101/subpart-C), [FAA airspace restrictions](https://www.faa.gov/air_traffic/publications/us_restrictions), [FAA NOTAMs and TFRs](https://www.faa.gov/pilots/safety/notams_tfr).

## Site Conditions, Regulatory Flags & Guidance Research (v2.2)

In **Design Archive → Site Conditions & Safety Review**, record a place and date associated with an experiment or existing design, including a point selected from an OpenStreetMap map (Leaflet), site elevation, observed atmospheric values, and the angle noted in a prior report. Entries are **documentation only** and are never fed into launch commands, launch-angle optimization, or a new rocket flight prediction. All these fields are included in **Save to browser**, **Export project**, and **Open project**. Previously exported v1 archives without the site fields remain readable.

The **Automatic regulatory flagger** is a conservative, offline screening tool based on selected provisions of [14 CFR Part 101 Subpart C](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-101/subpart-C) (reviewed October 2026):

- Highlights recorded mass above 1,500 grams including propellant, or propellant above 125 grams, as **possible Class 1 classification mismatches** under § 101.22.
- Flags uncertainty about structural materials, substantial metal parts, and slow-burning propellant.
- Records whether airspace, site permission and hazard reviews have been separately documented.
- Always warns that applicable FAA restrictions and ATC requirements may need independent review.

**It never returns a launch authorization or a legal compliance certificate.** Being outside the Class 1 definition does **not** mean that an operation is necessarily unlawful; it may be in a different class with different requirements. This app has no live FAA/NOTAM, airport-boundary, restricted-airspace, or governmental approval feed. The interactive map is for a reference point **only**. OpenStreetMap map tiles require internet access and receive map tile requests; manual coordinate input and project data processing are local. Future weather is not retrieved or forecast. Regulations may change—always review the official sources and consult qualified personnel.

**Guidance Research** is a reserved, read-only educational section about coordinate frames, measurement uncertainty, and comparing previously recorded data. It contains no steering logic, flight control outputs, targeting, or actuator interfaces.