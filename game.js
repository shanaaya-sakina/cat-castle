const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40;
const COLS = canvas.width / TILE_SIZE;
const ROWS = canvas.height / TILE_SIZE;

let CASTLE_X = canvas.width - 70;
let CASTLE_Y = 70;
const CASTLE_RADIUS = 40;
const CASTLE_MOVE_INTERVAL = 3000;
let lastCastleMove = Date.now();

function drawMap() {
  ctx.fillStyle = "#3a7d3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#a9854c";
  ctx.fillRect(0, Math.floor(ROWS / 2) * TILE_SIZE, canvas.width, TILE_SIZE);

  ctx.font = `${TILE_SIZE * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const isBorder = row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1;
      const onPath = row === Math.floor(ROWS / 2);
      if (isBorder && !onPath) {
        ctx.fillText("🌲", col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
      }
    }
  }

  ctx.font = "60px serif";
  ctx.fillText("🏰", CASTLE_X, CASTLE_Y);
}

const player = {
  x: 400,
  y: 300,
  size: 48,
  speed: 4,
  color: "#e0a020",
  facingX: 1,
  facingY: 0,
  hp: 100,
  maxHp: 100,
};
const TOUCH_DAMAGE = 25;
const HIT_COOLDOWN = 1000;
let lastPlayerHitTime = 0;
let gameOver = false;
let gameWon = false;
let paused = false;

let gameStarted = false;
let playerName = "Player";
let startTime = 0;
let finishSeconds = 0;
let leaderboard = [];

async function saveScore(name, seconds) {
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, seconds }),
    });
    const data = await res.json();
    leaderboard = data.leaderboard || [];
  } catch (err) {
    console.error("Could not save score:", err);
  }
}

async function showNameScreenLeaderboard() {
  const list = document.getElementById("name-leaderboard-list");
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    const entries = data.leaderboard || [];
    list.innerHTML = entries
      .map((entry) => `<li>${entry.name} - ${entry.seconds.toFixed(1)}s</li>`)
      .join("");
  } catch (err) {
    console.error("Could not load leaderboard:", err);
  }
}

showNameScreenLeaderboard();

function startGame() {
  const input = document.getElementById("player-name");
  playerName = input.value.trim() || "Player";
  input.blur();
  document.getElementById("name-screen").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  startTime = Date.now();
  gameStarted = true;
  ensureMusicStarted();
}

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("player-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

const MAX_LEVEL = 5;
let level = 1;
let levelMessageUntil = 0;

let enemies = generateEnemies(level);
const DETECT_RADIUS = 150;

function generateEnemies(forLevel) {
  const count = 2 + forLevel;
  const baseSpeed = 2 + forLevel * 0.3;
  const arr = [];
  for (let i = 0; i < count; i++) {
    const isOgre = i % 2 === 1;
    arr.push({
      x: 100 + Math.random() * (canvas.width - 200),
      y: 100 + Math.random() * (canvas.height - 200),
      size: 32,
      speed: isOgre ? baseSpeed * 0.6 : baseSpeed,
      patrolDir: Math.random() < 0.5 ? 1 : -1,
      hp: isOgre ? 2 : 1,
      alive: true,
      type: isOgre ? "ogre" : "ghost",
    });
  }
  return arr;
}

const healItems = [
  { x: 200, y: 300, collected: false },
  { x: 650, y: 300, collected: false },
  { x: 400, y: 500, collected: false },
];
const HEAL_AMOUNT = 30;

const obstacles = [
  { x: 300, y: 200, size: 32 },
  { x: 500, y: 200, size: 32 },
  { x: 300, y: 450, size: 32 },
];
const OBSTACLE_SPAWN_INTERVAL = 15000;
let lastObstacleSpawn = Date.now();

const boosters = [];
const BOOSTER_SPAWN_INTERVAL = 5000;
const BOOSTER_TYPES = ["damage", "shield", "heal"];
const BOOSTER_ICONS = { damage: "🔥", shield: "🛡️", heal: "🧪" };
const BOOSTER_DURATION = 5000;
let lastBoosterSpawn = Date.now();
let damageBoostUntil = 0;
let shieldUntil = 0;

const MELEE_RANGE = 60;
const MELEE_COOLDOWN = 400;
let lastMeleeTime = 0;
let meleeFlashUntil = 0;

let playerDirX = 0;
let playerDirY = 0;
const CENTER_ATTACK_RADIUS = 100;

let audioCtx = null;
let musicStarted = false;
let musicPlaying = false;
let musicTimer = null;
let noteIndex = 0;
const MELODY = [220, 261.63, 329.63, 440, 392, 329.63, 261.63, 246.94];

function playNote(freq) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.7, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

function musicLoop() {
  if (!musicPlaying) return;
  playNote(MELODY[noteIndex % MELODY.length]);
  noteIndex++;
  musicTimer = setTimeout(musicLoop, 450);
}

function startMusic() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (musicPlaying) return;
  musicPlaying = true;
  musicLoop();
}

function toggleMusic() {
  if (musicPlaying) {
    musicPlaying = false;
    clearTimeout(musicTimer);
  } else {
    startMusic();
  }
}

const keys = {};
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;

  if (!musicStarted) {
    musicStarted = true;
    startMusic();
  }

  keys[e.key] = true;
  if (e.key === " ") meleeAttack();
  if (e.key === "Escape") paused = !paused;
  if (e.key === "m") toggleMusic();
  if (e.key === "ArrowUp" || e.key === "w") { playerDirX = 0; playerDirY = -1; }
  if (e.key === "ArrowDown" || e.key === "s") { playerDirX = 0; playerDirY = 1; }
  if (e.key === "ArrowLeft" || e.key === "a") { playerDirX = -1; playerDirY = 0; }
  if (e.key === "ArrowRight" || e.key === "d") { playerDirX = 1; playerDirY = 0; }
});
window.addEventListener("keyup", (e) => (keys[e.key] = false));

function ensureMusicStarted() {
  if (!musicStarted) {
    musicStarted = true;
    startMusic();
  }
}


canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  ensureMusicStarted();
  handleCanvasTouch(e.touches[0]);
}, { passive: false });

function handleCanvasTouch(touch) {
  if (!gameStarted || gameOver || gameWon || paused) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const tx = (touch.clientX - rect.left) * scaleX;
  const ty = (touch.clientY - rect.top) * scaleY;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < CENTER_ATTACK_RADIUS) {
    meleeAttack();
  } else if (Math.abs(dy) * canvas.width > Math.abs(dx) * canvas.height) {
    playerDirX = 0;
    playerDirY = dy > 0 ? 1 : -1;
  } else {
    playerDirX = dx > 0 ? 1 : -1;
    playerDirY = 0;
  }
}

document.getElementById("btn-again").addEventListener("click", () => location.reload());

function update() {
  if (!gameStarted || gameOver || gameWon || paused) return;

  if (playerDirX !== 0 || playerDirY !== 0) {
    player.facingX = playerDirX;
    player.facingY = playerDirY;
  }
  movePlayer(playerDirX, playerDirY);

  updateEnemies();
  checkPlayerHit();
  checkHealPickup();
  updateCastleMovement();
  checkCastleWin();
  updateObstacleSpawning();
  updateBoosterSpawning();
  checkBoosterPickup();
}

function updateBoosterSpawning() {
  const now = Date.now();
  if (now - lastBoosterSpawn > BOOSTER_SPAWN_INTERVAL) {
    lastBoosterSpawn = now;
    const margin = 80;
    boosters.push({
      x: margin + Math.random() * (canvas.width - margin * 2),
      y: margin + Math.random() * (canvas.height - margin * 2),
      type: BOOSTER_TYPES[Math.floor(Math.random() * BOOSTER_TYPES.length)],
    });
  }
}

function checkBoosterPickup() {
  for (let i = boosters.length - 1; i >= 0; i--) {
    const b = boosters[i];
    const dx = b.x - player.x;
    const dy = b.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < player.size / 2 + 16) {
      applyBooster(b.type);
      boosters.splice(i, 1);
    }
  }
}

function applyBooster(type) {
  const now = Date.now();
  if (type === "damage") damageBoostUntil = now + BOOSTER_DURATION;
  if (type === "shield") shieldUntil = now + BOOSTER_DURATION;
  if (type === "heal") player.hp = Math.min(player.maxHp, player.hp + 40);
}

function updateCastleMovement() {
  const now = Date.now();
  if (now - lastCastleMove > CASTLE_MOVE_INTERVAL) {
    lastCastleMove = now;
    relocateCastle();
  }
}

function movePlayer(dx, dy) {
  const newX = player.x + dx * player.speed;
  if (!collidesWithObstacle(newX, player.y)) player.x = newX;

  const newY = player.y + dy * player.speed;
  if (!collidesWithObstacle(player.x, newY)) player.y = newY;
}

function collidesWithObstacle(x, y) {
  for (const o of obstacles) {
    const dx = o.x - x;
    const dy = o.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < player.size / 2 + o.size / 2) return true;
  }
  return false;
}

function updateObstacleSpawning() {
  const now = Date.now();
  if (now - lastObstacleSpawn > OBSTACLE_SPAWN_INTERVAL) {
    lastObstacleSpawn = now;
    spawnObstacle();
  }
}

function spawnObstacle() {
  const margin = 80;
  obstacles.push({
    x: margin + Math.random() * (canvas.width - margin * 2),
    y: margin + Math.random() * (canvas.height - margin * 2),
    size: 32,
  });
}

function relocateCastle() {
  const margin = 100;
  CASTLE_X = margin + Math.random() * (canvas.width - margin * 2);
  CASTLE_Y = margin + Math.random() * (canvas.height - margin * 2);
}

function checkCastleWin() {
  const dx = CASTLE_X - player.x;
  const dy = CASTLE_Y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < CASTLE_RADIUS) {
    if (level >= MAX_LEVEL) {
      gameWon = true;
      finishSeconds = (Date.now() - startTime) / 1000;
      saveScore(playerName, finishSeconds);
      document.getElementById("btn-again").classList.remove("hidden");
    } else {
      advanceLevel();
    }
  }
}

function advanceLevel() {
  level++;
  enemies = generateEnemies(level);
  relocateCastle();
  lastCastleMove = Date.now();
  levelMessageUntil = Date.now() + 1500;
}

function checkHealPickup() {
  for (const heal of healItems) {
    if (heal.collected) continue;
    const dx = heal.x - player.x;
    const dy = heal.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < player.size / 2 + 16) {
      heal.collected = true;
      player.hp = Math.min(player.maxHp, player.hp + HEAL_AMOUNT);
    }
  }
}

function checkPlayerHit() {
  const now = Date.now();
  if (now - lastPlayerHitTime <= HIT_COOLDOWN) return;
  if (now < shieldUntil) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < player.size / 2 + enemy.size / 2) {
      lastPlayerHitTime = now;
      player.hp -= TOUCH_DAMAGE;
      if (player.hp <= 0) {
        player.hp = 0;
        gameOver = true;
        document.getElementById("btn-again").classList.remove("hidden");
      }
      break;
    }
  }
}

function updateEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DETECT_RADIUS) {
      enemy.x += (dx / dist) * enemy.speed;
      enemy.y += (dy / dist) * enemy.speed;
    } else {
      enemy.x += enemy.patrolDir * enemy.speed;
      if (enemy.x < 100 || enemy.x > 700) enemy.patrolDir *= -1;
    }
  }
}

function meleeAttack() {
  if (paused || gameOver || gameWon) return;
  const now = Date.now();
  if (now - lastMeleeTime < MELEE_COOLDOWN) return;
  lastMeleeTime = now;
  meleeFlashUntil = now + 150;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MELEE_RANGE) hitEnemy(enemy, getAttackDamage());
  }
}

function getAttackDamage() {
  return Date.now() < damageBoostUntil ? 99 : 1;
}


function hitEnemy(enemy, damage) {
  enemy.hp -= damage;
  if (enemy.hp <= 0) enemy.alive = false;
}

function drawTouchZones() {
  if (!("ontouchstart" in window)) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(0, 0); ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(0, H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(0, 0); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = "rgba(255, 80, 80, 0.18)";
  ctx.beginPath(); ctx.arc(cx, cy, CENTER_ATTACK_RADIUS, 0, Math.PI * 2); ctx.fill();

  ctx.font = "22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillText("▲", cx, cy - H / 3.5);
  ctx.fillText("▼", cx, cy + H / 3.5);
  ctx.fillText("◀", cx - W / 3.5, cy);
  ctx.fillText("▶", cx + W / 3.5, cy);
  ctx.fillText("⚔️", cx, cy);
}

function draw() {
  drawMap();
  drawTouchZones();

  ctx.font = "28px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const heal of healItems) {
    if (!heal.collected) ctx.fillText("💖", heal.x, heal.y);
  }

  ctx.font = "32px serif";
  for (const o of obstacles) {
    ctx.fillText("🪨", o.x, o.y);
  }

  ctx.font = "28px serif";
  for (const b of boosters) {
    ctx.fillText(BOOSTER_ICONS[b.type], b.x, b.y);
  }

  ctx.font = `${player.size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🐱", player.x, player.y);

  if (Date.now() < meleeFlashUntil) {
    ctx.font = "28px serif";
    ctx.fillText("⚔️", player.x + player.facingX * 40, player.y + player.facingY * 40);
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    ctx.font = `${enemy.size}px serif`;
    if (enemy.type === "ogre") {
      ctx.fillText("👹", enemy.x, enemy.y);
    } else {
      ctx.shadowColor = "#39ff14";
      ctx.shadowBlur = 20;
      ctx.fillText("👻", enemy.x, enemy.y);
      ctx.shadowBlur = 0;
    }
  }

  drawHealthBar();

  ctx.font = "20px serif";
  ctx.fillStyle = "black";
  ctx.textAlign = "left";
  ctx.fillText(`Level ${level} / ${MAX_LEVEL}`, 20, 60);

  const now = Date.now();
  let buffText = "";
  if (now < damageBoostUntil) buffText += "🔥 Power ";
  if (now < shieldUntil) buffText += "🛡️ Shield";
  if (buffText) ctx.fillText(buffText, 20, 85);

  ctx.textAlign = "center";

  if (Date.now() < levelMessageUntil) {
    ctx.font = "48px serif";
    ctx.fillStyle = "black";
    ctx.fillText(`LEVEL ${level}!`, canvas.width / 2, canvas.height / 2);
  }

  if (gameOver) {
    ctx.font = "60px serif";
    ctx.fillStyle = "black";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px serif";
    ctx.fillText("", canvas.width / 2, canvas.height / 2 + 50);
  }

  if (gameWon) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.font = "50px serif";
    ctx.fillStyle = "black";
    ctx.fillText("YOU WIN!", cx, cy - 110);
    ctx.font = "22px serif";
    ctx.fillText(`Your time: ${finishSeconds.toFixed(1)}s`, cx, cy - 70);
    ctx.font = "20px serif";
    ctx.fillText("Leaderboard", cx, cy - 35);
    leaderboard.forEach((entry, i) => {
      ctx.fillText(`${i + 1}. ${entry.name} - ${entry.seconds.toFixed(1)}s`, cx, cy - 5 + i * 24);
    });
    ctx.font = "20px serif";
  }

  if (paused) {
    ctx.font = "60px serif";
    ctx.fillStyle = "black";
    ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px serif";
    ctx.fillText("Press Escape to resume", canvas.width / 2, canvas.height / 2 + 50);
  }
}

function drawHealthBar() {
  const barWidth = 200;
  const barHeight = 20;
  const x = 20;
  const y = 20;
  const hpRatio = player.hp / player.maxHp;

  ctx.fillStyle = "#555";
  ctx.fillRect(x, y, barWidth, barHeight);

  ctx.fillStyle = hpRatio > 0.3 ? "#2ecc40" : "#e74c3c";
  ctx.fillRect(x, y, barWidth * hpRatio, barHeight);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
