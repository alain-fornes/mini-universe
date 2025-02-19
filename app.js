// Get the canvas and its drawing context
const canvas = document.getElementById('starCanvas');
const ctx = canvas.getContext('2d');

if (typeof noise !== 'undefined') {
    noise.seed(Math.random());
} else {
    console.error('NoiseJS library not loaded properly');
}

// Global mouse position (screen coordinates)
let mouseX = 0;
let mouseY = 0;

// For panning & zooming (world view transformation)
let cameraOffset = { x: 0, y: 0 };
let zoom = 1; // starts at 1

// Conversion factor: 100 pixels = 1 AU (for coordinate overlay)
const PIXELS_PER_AU = 100;

// Global state: which view are we in? "starField" or "starDetail"
let currentView = "starField";



// Transition animation state variables
let animatingTransition = false;
let transitionStartTime = 0;
const transitionDuration = 1000; // in ms
let initialCameraOffset = { x: 0, y: 0 };
let targetCameraOffset = { x: 0, y: 0 };
let initialZoom = 1;
const targetZoom = 3; // zoom factor when viewing detail

// Variables to store star-field view state so it can be restored on back.
let prevCameraOffset = { x: 0, y: 0 };
let prevZoom = 1;

// The star that was clicked for detail view
let selectedStar = null;

// --- Star Field Setup ---
const STAR_COUNT = 300;
let STAR_FIELD_SIZE = 4000; // world space range
let stars = [];

// Generate a star name
function generateStarName() {
  const syllables = ["Al", "Bel", "Cor", "Den", "Eld", "Fal", "Gal", "Hel", "Ith", "Jen", "Kel", "Lor", "Mar", "Nim", "Oph", "Pha", "Qua", "Ros", "Sol", "Tor", "Ur", "Vel", "Wen", "Xan", "Yor", "Zel"];
  const syllableCount = Math.floor(Math.random() * 2) + 2; // 2 or 3 syllables
  let name = "";
  for (let i = 0; i < syllableCount; i++) {
    name += syllables[Math.floor(Math.random() * syllables.length)];
    if (i < syllableCount - 1 && Math.random() < 0.5) {
      name += "-";
    }
  }
  name += "-" + Math.floor(Math.random() * 100);
  return name;
}

function getRandomStarColor() {
    // Randomly choose between a "warm" star and a "cool" star
    if (Math.random() < 0.5) {
        // Warm stars: red/orange/yellow hues (0° to 60°)
        let hue = Math.floor(Math.random() * 60);
        return `hsl(${hue}, 100%, 60%)`;
    } else {
        // Cool stars: blue/cyan hues (180° to 240°)
        let hue = Math.floor(180 + Math.random() * 60);
        return `hsl(${hue}, 100%, 70%)`;
    }
}

// Generate the star field (each star has x, y, radius, and a persistent name)
function generateStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        const star = {
            x: Math.random() * STAR_FIELD_SIZE - STAR_FIELD_SIZE / 2,
            y: Math.random() * STAR_FIELD_SIZE - STAR_FIELD_SIZE / 2,
            radius: Math.random() * 2 + 2, // between 2 and 4 pixels
            name: generateStarName(),
            color: getRandomStarColor()  // new: assign a random star color
        };
        stars.push(star);
    }
}
  
generateStars();

// Return a realistic planet color, favoring browns and greys (with some dark greens and blues)
function getRealisticPlanetColor() {
    const choices = [
      { color: "hsl(30, 50%, 45%)", weight: 3 },  // brown
      { color: "hsl(0, 0%, 50%)", weight: 3 },      // grey
      { color: "hsl(120, 50%, 35%)", weight: 1 },    // dark green
      { color: "hsl(210, 50%, 45%)", weight: 1 }     // blue
    ];
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    let rand = Math.random() * total;
    for (let choice of choices) {
      if (rand < choice.weight) {
        return choice.color;
      }
      rand -= choice.weight;
    }
    return choices[0].color; // fallback
}
  
  // Return a realistic noise color (mostly dark browns and greys)
function getRealisticNoiseColor() {
    const choices = [
      { color: "hsl(30, 50%, 30%)", weight: 3 },  // dark brown
      { color: "hsl(0, 0%, 30%)", weight: 3 },      // dark grey
      { color: "hsl(210, 50%, 30%)", weight: 1 }     // dark blue
    ];
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    let rand = Math.random() * total;
    for (let choice of choices) {
      if (rand < choice.weight) {
        return choice.color;
      }
      rand -= choice.weight;
    }
    return choices[0].color;
}
  
  // Create a static noise pattern with larger blotches.
  // Here we use an offscreen canvas divided into a 5x5 grid and randomly fill blocks.
function createStaticNoisePattern(width, height, noiseColor) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
  
    const blocks = 50;
    const blockWidth = width / blocks;
    const blockHeight = height / blocks;
    
    for (let i = 0; i < blocks; i++) {
      for (let j = 0; j < blocks; j++) {
        if (Math.random() < 0.5) {
          offCtx.fillStyle = noiseColor;
          offCtx.fillRect(i * blockWidth, j * blockHeight, blockWidth, blockHeight);
        }
      }
    }
    // Return a repeating pattern created from the offscreen canvas.
    return ctx.createPattern(offCanvas, 'repeat');
}
  
function generateLandmassNoiseCanvas(width, height, noiseColor, offset = { x: 0, y: 0 }) {
    if (typeof noise === 'undefined') {
      console.error('NoiseJS not available');
      return null;
    }
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
  
    const imageData = offCtx.createImageData(width, height);
    const data = imageData.data;
  
    const scale = 30;       // Larger scale for smoother, larger features.
    const threshold = 0.1;  // Lower threshold so more pixels get opacity.
  
    const rgb = hslToRgb(noiseColor);
  
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Add the offset to x and y.
        let sampleX = (x + offset.x) / scale;
        let sampleY = (y + offset.y) / scale;
        let value = (noise.perlin2(sampleX, sampleY) + 1) / 2;
        
        let alpha = 0;
        if (value > threshold) {
          alpha = Math.floor(((value - threshold) / (1 - threshold)) * 255);
          if (alpha < 30) alpha = 30;
        }
        
        const index = (y * width + x) * 4;
        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
        data[index + 3] = alpha;
      }
    }
  
    offCtx.putImageData(imageData, 0, 0);
    return offCanvas; // Return the canvas
}

  
  
  
  
  
  
  
  
  
  
  // Helper: Convert HSL string (formatted as "hsl(h, s%, l%)") to an {r, g, b} object.
  // We'll implement a simple converter.
function hslToRgb(hslString) {
    // Extract h, s, l values from the string.
    // Example: "hsl(210, 80%, 60%)"
    let [h, s, l] = hslString
      .replace(/hsl\(|\)/g, '')
      .split(',')
      .map(v => parseFloat(v));
    s /= 100;
    l /= 100;
    
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = l - c / 2;
    let r1, g1, b1;
    if (h < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255)
    };
}
  
// --- Planet Generation for Star Detail View ---
// Generate a planet name (different style from star names)
function generatePlanetName() {
  const parts = ["Xen", "Arg", "Neb", "Cryo", "Gal", "Zor", "Lun", "Hel", "Ter", "Pol", "Or"];
  const suffixes = ["us", "ion", "ar", "en", "ex", "os"];
  let name = parts[Math.floor(Math.random() * parts.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
  name += "-" + (Math.floor(Math.random() * 10) + 1);
  return name;
}

// Generate an array of planet objects for the selected star.
function generatePlanetsForStar() {
    const planetCount = Math.floor(Math.random() * 8) + 1; // 1 to 8 planets
    const planets = [];
    for (let i = 0; i < planetCount; i++) {
      const planetColor = getRealisticPlanetColor();
      const noiseColor = getRealisticNoiseColor();
      planets.push({
        distance: Math.random() * 100 + 50,  // between 50 and 150 pixels
        orbitalSpeed: Math.random() * 0.005 + 0.002, // 0.002 to 0.007 radians per frame
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 5 + 5,  // between 5 and 10 pixels
        name: generatePlanetName(),
        planetColor: planetColor,          // base color
        noiseColor: noiseColor,            // noise tint
        noisePattern: null,                // will be generated below
        noiseOffset: { x: Math.random() * 1000, y: Math.random() * 1000 } // new: random offset
      });
    }
    // For each planet, generate its static noise pattern once.
    for (let planet of planets) {
      // Using a fixed offscreen canvas size (e.g., 50x50) for the pattern.
      planet.noisePattern = createStaticNoisePattern(50, 50, planet.noiseColor);
    }
    return planets;
}

  
  

// --- Canvas Resize ---
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Drag-to-Pan & Mouse Tracking (only in starField view) ---
let isDragging = false;
let lastX = 0;
let lastY = 0;
canvas.style.cursor = "default";

canvas.addEventListener('mousedown', (e) => {
  if (currentView !== "starField") return;
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  
  if (isDragging && currentView === "starField") {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    cameraOffset.x += dx / zoom;
    cameraOffset.y += dy / zoom;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

canvas.addEventListener('mouseup', () => {
  if (currentView === "starField") {
    isDragging = false;
    canvas.style.cursor = 'default';
  }
});

canvas.addEventListener('mouseleave', () => {
  if (currentView === "starField") {
    isDragging = false;
    canvas.style.cursor = 'default';
  }
});

// --- Click to Transition to Star Detail View ---
canvas.addEventListener('click', (e) => {
    if (currentView === "starField" && !animatingTransition) {
      // (Existing logic for clicking on a star in star field)
      const clickX = e.clientX;
      const clickY = e.clientY;
      for (let star of stars) {
        const globalX = canvas.width / 2 + zoom * (cameraOffset.x + star.x);
        const globalY = canvas.height / 2 + zoom * (cameraOffset.y + star.y);
        const dx = clickX - globalX;
        const dy = clickY - globalY;
        if (Math.sqrt(dx * dx + dy * dy) < star.radius * zoom + 5) {
          startTransition(star);
          break;
        }
      }
    } else if (currentView === "starDetail") {
      // In star detail view, check if a planet was clicked.
      const detailMouseX = e.clientX - canvas.width / 2;
      const detailMouseY = e.clientY - canvas.height / 2;
      for (let planet of selectedStar.planets) {
        // Calculate planet position (as drawn in drawStarDetail).
        const planetX = planet.distance * Math.cos(planet.angle);
        const planetY = planet.distance * Math.sin(planet.angle);
        const dx = detailMouseX - planetX;
        const dy = detailMouseY - planetY;
        if (Math.sqrt(dx * dx + dy * dy) < planet.radius + 5) {
          startPlanetDetailTransition(planet);
          break;
        }
      }
    }
});
  

// --- Transition Animation to Star Detail View ---
function startTransition(star) {
  selectedStar = star;
  // Store the current starField camera state so we can restore it later.
  prevCameraOffset = { x: cameraOffset.x, y: cameraOffset.y };
  prevZoom = zoom;
  
  // Set target camera so that the selected star becomes centered.
  initialCameraOffset = { x: cameraOffset.x, y: cameraOffset.y };
  targetCameraOffset = { x: -star.x, y: -star.y };
  initialZoom = zoom;
  transitionStartTime = performance.now();
  animatingTransition = true;
}

function startPlanetDetailTransition(planet) {
    console.log("Transitioning to planet view for:", planet.name);
    selectedPlanet = planet;
    if (!selectedPlanet.detailNoiseCanvas) {
      // Pass the planet's noiseOffset to the noise generator.
      selectedPlanet.detailNoiseCanvas = generateLandmassNoiseCanvas(200, 200, selectedPlanet.noiseColor, selectedPlanet.noiseOffset);
      if (!selectedPlanet.detailNoiseCanvas) {
        console.error("Failed to generate detail noise canvas.");
      }
    }
    currentView = "planetDetail";
}


  

function animateTransition() {
  const now = performance.now();
  let progress = (now - transitionStartTime) / transitionDuration;
  if (progress >= 1) {
    progress = 1;
    animatingTransition = false;
    currentView = "starDetail";
    // Generate planets if not already generated.
    if (!selectedStar.planets) {
      selectedStar.planets = generatePlanetsForStar();
    }
  }
  // Linear interpolation (easing can be added later)
  cameraOffset.x = initialCameraOffset.x + (targetCameraOffset.x - initialCameraOffset.x) * progress;
  cameraOffset.y = initialCameraOffset.y + (targetCameraOffset.y - initialCameraOffset.y) * progress;
  zoom = initialZoom + (targetZoom - initialZoom) * progress;
}

// --- Back Button Functionality ---
const backButton = document.getElementById('backButton');

let selectedPlanet = null;
backButton.addEventListener('click', () => {
    if (currentView === "planetDetail") {
      // If in planet view, go back to star detail view.
      currentView = "starDetail";
    } else if (currentView === "starDetail") {
      // If in star detail view, return to star field (restore previous camera state).
      currentView = "starField";
      cameraOffset = { ...prevCameraOffset };
      zoom = prevZoom;
    }
    backButton.style.display = "none";
  });

  function drawPlanetDetail() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Define the area for the planet view: left half of the screen.
    const leftWidth = canvas.width / 2;
    const availableHeight = canvas.height;
    
    // Center the planet in the left half.
    const centerX = leftWidth / 2;
    const centerY = availableHeight / 2;
    
    // Decide on a target radius for the planet.
    const targetRadius = Math.min(leftWidth, availableHeight) * 0.4;
    
    ctx.save();
    // Create a clipping region for the planet's circle.
    ctx.beginPath();
    ctx.arc(centerX, centerY, targetRadius, 0, Math.PI * 2);
    ctx.clip();
    
    // Fill with the planet's base color.
    ctx.fillStyle = selectedPlanet.planetColor;
    ctx.fillRect(centerX - targetRadius, centerY - targetRadius, targetRadius * 2, targetRadius * 2);
    
    // Generate or reuse the fractal noise canvas.
    if (!selectedPlanet.detailNoiseCanvas) {
      // Here we generate a fractal noise canvas. You can adjust width/height as needed.
      selectedPlanet.detailNoiseCanvas = generateLandmassNoiseCanvas(200, 200, selectedPlanet.noiseColor);
    }
    
    // Draw the noise canvas image stretched over the entire planet.
    ctx.drawImage(selectedPlanet.detailNoiseCanvas, centerX - targetRadius, centerY - targetRadius, targetRadius * 2, targetRadius * 2);
    ctx.restore();
    
    // Optionally, draw a border around the planet.
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, targetRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw the planet's name on the right half (for later description).
    ctx.font = "24px 'Open Sans'";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(selectedPlanet.name, canvas.width / 2 + 20, 50);
    
    document.getElementById('coordinates').innerText = `Planet View: ${selectedPlanet.name}`;
  }
  
  
  
// --- Main Draw Loop ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (currentView === "starField") {
    if (animatingTransition) {
      animateTransition();
    }
    // Set up starField transform
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(cameraOffset.x, cameraOffset.y);
    
    // Draw stars with hover glow and names (if hovered)
    for (let star of stars) {
        const globalX = canvas.width / 2 + zoom * (cameraOffset.x + star.x);
        const globalY = canvas.height / 2 + zoom * (cameraOffset.y + star.y);
        const dx = globalX - mouseX;
        const dy = globalY - mouseY;
        const hovered = Math.sqrt(dx * dx + dy * dy) < star.radius * zoom + 5;
      
        if (hovered) {
            let colorInner = star.color.replace("hsl(", "hsla(").replace(")", ",1)");
            let colorOuter = star.color.replace("hsl(", "hsla(").replace(")", ",0)");
            let grad = ctx.createRadialGradient(star.x, star.y, star.radius, star.x, star.y, star.radius * 2);
            grad.addColorStop(0, colorInner);
            grad.addColorStop(1, colorOuter);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.font = "16px 'Open Sans'";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(star.name, star.x, star.y - star.radius - 10);
            ctx.restore();
        }
      
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    
    // Update coordinate overlay for starField view.
    const centerX_AU = (-cameraOffset.x / PIXELS_PER_AU).toFixed(2);
    const centerY_AU = (-cameraOffset.y / PIXELS_PER_AU).toFixed(2);
    document.getElementById('coordinates').innerText = `Center: (${centerX_AU} AU, ${centerY_AU} AU)`;
    
    // Hide back button in starField view.
    backButton.style.display = "none";
    
  } else if (currentView === "starDetail") {
    // Show back button in detail view.
    backButton.style.display = "block";
    drawStarDetail();
  } else  if (currentView === "planetDetail") {
    backButton.style.display = "block";
    drawPlanetDetail();
  }
  
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// --- Draw Star Detail View ---
// In detail view, the selected star is centered with its orbiting planets.
function drawStarDetail() {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    
    // Draw the central star using its stored color and a larger size.
    const detailStarRadius = selectedStar.radius * 3; // scale factor; adjust as needed
    ctx.fillStyle = selectedStar.color;
    ctx.beginPath();
    ctx.arc(0, 0, detailStarRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Translate mouse to detail-view coordinates.
    const detailMouseX = mouseX - canvas.width / 2;
    const detailMouseY = mouseY - canvas.height / 2;
    
    if (selectedStar.planets) {
        for (let planet of selectedStar.planets) {
          // Update planet's orbital angle.
          planet.angle += planet.orbitalSpeed;
          const planetX = planet.distance * Math.cos(planet.angle);
          const planetY = planet.distance * Math.sin(planet.angle);
          
          // Hover detection for planet.
          const dx = planetX - detailMouseX;
          const dy = planetY - detailMouseY;
          const hovered = Math.sqrt(dx * dx + dy * dy) < planet.radius + 5;
          
          ctx.save();
          // Create a clipping region in the shape of the planet.
          ctx.beginPath();
          ctx.arc(planetX, planetY, planet.radius, 0, Math.PI * 2);
          ctx.clip();
          
          // Fill the planet's circle with its base color.
          ctx.fillStyle = planet.planetColor;
          ctx.fillRect(planetX - planet.radius, planetY - planet.radius, planet.radius * 2, planet.radius * 2);
          
          // Overlay the pre-generated noise pattern.
          ctx.fillStyle = planet.noisePattern;
          ctx.fillRect(planetX - planet.radius, planetY - planet.radius, planet.radius * 2, planet.radius * 2);
          ctx.restore();
          
          // If hovered, draw a glow effect and the planet's name.
          if (hovered) {
            let grad = ctx.createRadialGradient(planetX, planetY, planet.radius, planetX, planetY, planet.radius * 2);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(planetX, planetY, planet.radius * 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.save();
            ctx.font = "16px 'Open Sans'";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(planet.name, planetX, planetY - planet.radius - 10);
            ctx.restore();
          }
        }
    }
      
      
    
    // Draw the star's name below the star.
    ctx.font = "20px 'Open Sans'";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(selectedStar.name, 0, detailStarRadius + 30);
    ctx.restore();
    
    // Update coordinate overlay for detail view.
    document.getElementById('coordinates').innerText = `Detail View: ${selectedStar.name}`;
}
  
