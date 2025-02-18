// Get the canvas and its drawing context
const canvas = document.getElementById('starCanvas');
const ctx = canvas.getContext('2d');

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

// Generate the star field (each star has x, y, radius, and a persistent name)
function generateStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = {
      x: Math.random() * STAR_FIELD_SIZE - STAR_FIELD_SIZE / 2,
      y: Math.random() * STAR_FIELD_SIZE - STAR_FIELD_SIZE / 2,
      radius: Math.random() * 2 + 2, // between 2 and 4 pixels
      name: generateStarName()
    };
    stars.push(star);
  }
}
generateStars();

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
    planets.push({
      distance: Math.random() * 100 + 50,  // between 50 and 150 pixels
      orbitalSpeed: Math.random() * 0.005 + 0.002, // slower: 0.002 to 0.007 radians per frame
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * 5 + 5,  // between 5 and 10 pixels
      name: generatePlanetName()
    });
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
  if (currentView !== "starField" || animatingTransition) return;
  
  const clickX = e.clientX;
  const clickY = e.clientY;
  
  // In starField view, the global position of a star is:
  // globalX = canvas.width/2 + zoom*(cameraOffset.x + star.x)
  // globalY = canvas.height/2 + zoom*(cameraOffset.y + star.y)
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
backButton.addEventListener('click', () => {
  // Switch back to starField view and restore previous camera state.
  currentView = "starField";
  cameraOffset = { ...prevCameraOffset };
  zoom = prevZoom;
  // Optionally, clear selectedStar (or keep it for persistence)
  // selectedStar = null;
  backButton.style.display = "none";
});

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
        let grad = ctx.createRadialGradient(star.x, star.y, star.radius, star.x, star.y, star.radius * 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
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
      
      ctx.fillStyle = "#fff";
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
  }
  
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// --- Draw Star Detail View ---
// In detail view, the selected star is centered with its orbiting planets.
function drawStarDetail() {
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  
  // Draw the central star.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, selectedStar.radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Translate mouse to detail-view coordinates.
  const detailMouseX = mouseX - canvas.width / 2;
  const detailMouseY = mouseY - canvas.height / 2;
  
  if (selectedStar.planets) {
    for (let planet of selectedStar.planets) {
      // Update planet's orbital angle (orbit slower).
      planet.angle += planet.orbitalSpeed;
      const planetX = planet.distance * Math.cos(planet.angle);
      const planetY = planet.distance * Math.sin(planet.angle);
      
      // Hover detection for planet.
      const dx = planetX - detailMouseX;
      const dy = planetY - detailMouseY;
      const hovered = Math.sqrt(dx * dx + dy * dy) < planet.radius + 5;
      
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
      
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(planetX, planetY, planet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Draw the star's name below it.
  ctx.font = "20px 'Open Sans'";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(selectedStar.name, 0, selectedStar.radius + 30);
  ctx.restore();
  
  // Update coordinate overlay for detail view.
  document.getElementById('coordinates').innerText = `Detail View: ${selectedStar.name}`;
}
