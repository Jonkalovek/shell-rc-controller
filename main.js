// =============================================================================
// Shell Motorsports RC Car - Zaawansowany Kontroler (Pad Xbox + Moc + Światła + 10 Tricków)
// =============================================================================

const AES_KEY = "34522a5b7a6e492c08090a9d8d2a23f8";
const BLE_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
const BLE_CTRL_UUID    = "d44bc439-abfd-45a2-b575-925416129600";
const BLE_BATT_UUID    = "d44bc439-abfd-45a2-b575-925416129601";

// --- AES-128 Encryption & Hex Helpers ---
function toHex(uint8arr) {
    return [...uint8arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hexString) {
    return Uint8Array.from(hexString.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function encryptHex(hexString) {
    if (typeof CryptoJS === 'undefined') {
        throw new Error("Biblioteka CryptoJS nie jest załadowana.");
    }
    const data = CryptoJS.enc.Hex.parse(hexString);
    const key = CryptoJS.enc.Hex.parse(AES_KEY);
    const encrypted = CryptoJS.AES.encrypt(data, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
    });
    return encrypted.ciphertext.toString();
}

function decryptHex(hexString) {
    if (typeof CryptoJS === 'undefined') {
        throw new Error("Biblioteka CryptoJS nie jest załadowana.");
    }
    const data = CryptoJS.enc.Hex.parse(hexString);
    const key = CryptoJS.enc.Hex.parse(AES_KEY);
    const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: data },
        key,
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding }
    );
    return decrypted.toString();
}

// --- Kompletny Builder Komend (Z obsługą świateł i płynnej mocy) ---
// Byte 8: 0 = Światła WŁĄCZONE, 1 = Światła WYŁĄCZONE (wg specyfikacji protokołu Shell)
// Byte 9: Moc w procentach (0x00 do 0x64 = 0 do 100%)
function buildCommand(forward, backward, left, right, powerPercent, lightsOn) {
    const cmd = new Uint8Array(16);
    cmd[1] = 0x43; // 'C'
    cmd[2] = 0x54; // 'T'
    cmd[3] = 0x4c; // 'L'
    if (forward)  cmd[4] = 1;
    if (backward) cmd[5] = 1;
    if (left)     cmd[6] = 1;
    if (right)    cmd[7] = 1;

    // Obsługa świateł (Byte 8: 0 = WŁ, 1 = WYŁ)
    cmd[8] = lightsOn ? 0 : 1;

    // Płynna regulacja mocy silników (Byte 9)
    const clampedPower = Math.max(0, Math.min(100, Math.round(powerPercent)));
    cmd[9] = clampedPower;

    return cmd;
}

// --- Wibracje Haptyczne (Smartfon + Pad Xbox) ---
const vibration = {
    press: 20,
    release: 10,
    turbo: [50, 40, 50],
    gear: 30,
    light: [25, 25, 25],
    connect: [60, 40, 90],
    disconnect: 70,
    trickStart: [50, 40, 50],
    trickEnd: [30, 30, 30]
};

function triggerVibrate(pattern) {
    if (navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (_) {}
    }
}

// Wibracje kontrolera (Xbox / PlayStation DualRumble)
function rumbleGamepad(strong = 0.4, weak = 0.5, duration = 120) {
    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
        if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
            try {
                gp.vibrationActuator.playEffect('dual-rumble', {
                    startDelay: 0,
                    duration: duration,
                    weakMagnitude: weak,
                    strongMagnitude: strong
                });
            } catch (_) {}
        }
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Stan Systemu ---
let server = null;
let ctrlChar = null;
let battChar = null;
let connected = false;

// Klawisze ruchu (Klawiatura / Dotyk)
const userKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// Ruch z Kontrolera (Pad)
const padState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    analogPower: null, // Jeśli używany jest analogowy spust RT/LT
    connected: false,
    name: ""
};

// Zaawansowana kontrola mocy i prędkości
let basePower = 85;        // Domyślna moc: 85%
let currentGear = 3;       // Bieg 1..4
let userTurbo = false;     // Turbo wymusza 100% mocy

// Światła
let lightsEnabled = true;  // Domyślnie światła włączone
let strobeActive = false;  // Tryb stroboskopu / awaryjnych
let strobeTick = false;    // Flaga mrugania

// Stan wykonywania tricku
let activeTrickId = null;
let trickCancelFlag = false;

// --- Elementy DOM ---
const connectBtn = document.getElementById("connect");
const turboBtn = document.getElementById("turbo");
const lightsBtn = document.getElementById("lightsBtn");
const strobeBtn = document.getElementById("strobeBtn");
const hornBtn = document.getElementById("hornBtn");
const controls = document.getElementById("controls");
const batteryContainer = document.getElementById("batteryContainer");
const batteryDisplay = document.getElementById("batteryDisplay");
const batteryFill = document.getElementById("batteryFill");
const connectionStatus = document.getElementById("connectionStatus");
const trickStatusText = document.getElementById("trickStatusText");
const stopTrickBtn = document.getElementById("stopTrickBtn");
const tricksContainer = document.getElementById("tricksGrid");

const powerSlider = document.getElementById("powerSlider");
const powerValueLabel = document.getElementById("powerValueLabel");
const powerGaugeBar = document.getElementById("powerGaugeBar");
const gearBadge = document.getElementById("gearBadge");

const gamepadStatus = document.getElementById("gamepadStatus");
const gamepadName = document.getElementById("gamepadName");

// Timer stroboskopu (mruganie co 150ms jeśli aktywny stroboskop)
setInterval(() => {
    if (strobeActive) {
        strobeTick = !strobeTick;
    }
}, 150);

// Wyznaczanie efektywnego stanu świateł
function getEffectiveLights() {
    if (strobeActive) {
        return strobeTick;
    }
    return lightsEnabled;
}

// Wyznaczanie efektywnej mocy silników
function getEffectivePower() {
    if (userTurbo) return 100;
    if (padState.analogPower !== null) return padState.analogPower;
    return basePower;
}

// --- Bezpośrednie Wysyłanie Pakietów (Ultra-Low Latency) ---
async function sendPacket(forward, backward, left, right, power, lights) {
    if (!ctrlChar || !connected) return;
    try {
        const rawCmd = buildCommand(forward, backward, left, right, power, lights);
        const encryptedHex = encryptHex(toHex(rawCmd));
        const data = fromHex(encryptedHex);

        if (ctrlChar.writeValueWithoutResponse && ctrlChar.properties && ctrlChar.properties.writeWithoutResponse) {
            await ctrlChar.writeValueWithoutResponse(data);
        } else {
            await ctrlChar.writeValue(data);
        }
    } catch (_) {}
}

// --- Wykonywanie Kroków Tricku z Ciągłym Zasilaniem Silników ---
async function runTrickStep(desc, forward, backward, left, right, power, lights, durationMs) {
    if (trickCancelFlag || !connected) throw new Error("TRICK_CANCELLED");

    if (trickStatusText) {
        trickStatusText.textContent = desc;
    }

    const startTime = performance.now();
    while (performance.now() - startTime < durationMs) {
        if (trickCancelFlag || !connected) throw new Error("TRICK_CANCELLED");
        await sendPacket(forward, backward, left, right, power, lights);
        await delay(55);
    }
}

// --- 10 Gotowych Trików (Ze 100% mocą i synchronizacją świateł) ---
const TRICKS = [
    {
        id: 1,
        key: "1",
        name: "Bączek w prawo (Donut 360° R)",
        desc: "Pełny obrót 360° na 100% mocy ze światłami i mocną kontrą.",
        icon: "🔄",
        run: async () => {
            rumbleGamepad(0.6, 0.8, 2200);
            await runTrickStep("Obrót 360° w prawo na 100% mocy...", true, false, false, true, 100, true, 2200);
            await runTrickStep("Kontra w lewo...", false, false, true, false, 75, true, 200);
            await runTrickStep("Zatrzymanie", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 2,
        key: "2",
        name: "Bączek w lewo (Donut 360° L)",
        desc: "Pełny obrót 360° w lewo na 100% mocy z kontrą stabilizującą.",
        icon: "🔄",
        run: async () => {
            rumbleGamepad(0.6, 0.8, 2200);
            await runTrickStep("Obrót 360° w lewo na 100% mocy...", true, false, true, false, 100, true, 2200);
            await runTrickStep("Kontra w prawo...", false, false, false, true, 75, true, 200);
            await runTrickStep("Zatrzymanie", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 3,
        key: "3",
        name: "Podwójny Bączek 720° (Double Spin)",
        desc: "Dwa pełne obroty w miejscu na pełnej mocy 100%!",
        icon: "🌪️",
        run: async () => {
            rumbleGamepad(0.7, 0.9, 4000);
            await runTrickStep("Pierwszy obrót (360°)...", true, false, false, true, 100, true, 2000);
            await runTrickStep("Drugi obrót (720°)...", true, false, false, true, 100, false, 2000);
            await runTrickStep("Kontra i światła...", false, false, true, false, 80, true, 250);
            await runTrickStep("Zatrzymanie", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 4,
        key: "4",
        name: "Szybki Slalom (Prawdziwy Wąż)",
        desc: "Mocne, dynamiczne łuki lewo-prawo omijające pachołki.",
        icon: "⚡",
        run: async () => {
            await runTrickStep("Łuk lewo...", true, false, true, false, 95, true, 550);
            await runTrickStep("Łuk prawo...", true, false, false, true, 95, true, 550);
            await runTrickStep("Łuk lewo...", true, false, true, false, 95, true, 550);
            await runTrickStep("Łuk prawo...", true, false, false, true, 95, true, 550);
            await runTrickStep("Wyjście z Turbo!", true, false, false, false, 100, true, 400);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 5,
        key: "5",
        name: "Nawrotka J-Turn 180°",
        desc: "Sprint tyłem, podcięcie kół i wystrzał przodem ze światłami.",
        icon: "↩️",
        run: async () => {
            rumbleGamepad(0.5, 0.5, 800);
            await runTrickStep("Ucieczka tyłem...", false, true, false, false, 100, false, 900);
            await runTrickStep("Obrót tył-skręt...", false, true, true, false, 100, true, 750);
            rumbleGamepad(0.8, 0.8, 400);
            await runTrickStep("Wystrzał przodem na 100%!", true, false, false, true, 100, true, 550);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 6,
        key: "6",
        name: "Ósemka (Figure 8)",
        desc: "Pełna i symetryczna figura ósemki: lewe i prawe koło.",
        icon: "♾️",
        run: async () => {
            await runTrickStep("Lewe koło ósemki...", true, false, true, false, 85, true, 1600);
            await runTrickStep("Prosta przez środek...", true, false, false, false, 90, true, 450);
            await runTrickStep("Prawe koło ósemki...", true, false, false, true, 85, true, 1600);
            await runTrickStep("Powrót na prostą...", true, false, false, false, 90, true, 450);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 7,
        key: "7",
        name: "Launch Control F1 (Start)",
        desc: "Mrugające światła startowe, 3 przegazówki i wystrzał na 100% mocy!",
        icon: "🚀",
        run: async () => {
            rumbleGamepad(0.3, 0.3, 100);
            await runTrickStep("🔴 Światła startowe 1...", true, false, false, false, 60, true, 150);
            await runTrickStep("⚪ Pauza...", false, false, false, false, 0, false, 130);
            rumbleGamepad(0.4, 0.4, 100);
            await runTrickStep("🔴 Światła startowe 2...", true, false, false, false, 75, true, 150);
            await runTrickStep("⚪ Pauza...", false, false, false, false, 0, false, 130);
            rumbleGamepad(0.6, 0.6, 150);
            await runTrickStep("🔴 GOTOWY DO STARTU...", true, false, false, false, 85, true, 200);
            await runTrickStep("⚪ ZGAŚNIĘCIE ŚWIATEŁ...", false, false, false, false, 0, false, 180);
            rumbleGamepad(1.0, 1.0, 1800);
            await runTrickStep("🟢 START 100% MOCY!", true, false, false, false, 100, true, 2000);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 8,
        key: "8",
        name: "Awaryjne Hamowanie i Odskok",
        desc: "Sprint naprzód, natychmiastowe zablokowanie kół i odwrót wsteczny.",
        icon: "🛑",
        run: async () => {
            await runTrickStep("Pełny bieg w przód...", true, false, false, false, 100, true, 1100);
            rumbleGamepad(1.0, 0.5, 300);
            await runTrickStep("HAMOWANIE AWARYJNE!", false, true, false, false, 100, false, 350);
            await runTrickStep("Ucieczka tyłem...", false, true, false, false, 100, true, 1000);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 9,
        key: "9",
        name: "Slalom Wsteczny (Cofanie)",
        desc: "Precyzyjne, naprzemienne cofanie łukami lewo-prawo.",
        icon: "🔙",
        run: async () => {
            await runTrickStep("Tył w lewo...", false, true, true, false, 85, true, 600);
            await runTrickStep("Tył w prawo...", false, true, false, true, 85, true, 600);
            await runTrickStep("Tył w lewo...", false, true, true, false, 85, true, 600);
            await runTrickStep("Tył w prawo...", false, true, false, true, 85, true, 600);
            await runTrickStep("Kontra w przód...", true, false, false, false, 60, true, 150);
            await runTrickStep("Stop", false, false, false, false, 0, true, 100);
        }
    },
    {
        id: 10,
        key: "0",
        name: "Taniec Kaskaderski (Freestyle)",
        desc: "Dyskoteka świateł, machanie kołami, krok przód-tył i piruet 360°!",
        icon: "🏆",
        run: async () => {
            await runTrickStep("Machanie lewo...", false, false, true, false, 0, true, 180);
            await runTrickStep("Machanie prawo...", false, false, false, true, 0, false, 180);
            await runTrickStep("Machanie lewo...", false, false, true, false, 0, true, 180);
            await runTrickStep("Machanie prawo...", false, false, false, true, 0, false, 180);
            await runTrickStep("Krok przód...", true, false, false, false, 75, true, 300);
            await runTrickStep("Krok tył...", false, true, false, false, 75, false, 300);
            rumbleGamepad(0.8, 0.8, 1800);
            await runTrickStep("PIRUET 360° (100% MOCY)!", true, false, false, true, 100, true, 1900);
            await runTrickStep("Finałowy ukłon lewo...", false, false, true, false, 0, false, 200);
            await runTrickStep("Finałowy ukłon prawo...", false, false, false, true, 0, true, 200);
            await runTrickStep("Koniec!", false, false, false, false, 0, true, 100);
        }
    }
];

// --- Obsługa Tricków ---
async function startTrick(trick) {
    if (!connected || !ctrlChar) return;

    if (activeTrickId !== null) {
        stopActiveTrick();
        await delay(80);
    }

    activeTrickId = trick.id;
    trickCancelFlag = false;
    updateTrickUI(true, `${trick.icon} Wykonywanie: ${trick.name}`);
    triggerVibrate(vibration.trickStart);

    try {
        await trick.run();
        triggerVibrate(vibration.trickEnd);
    } catch (err) {
        if (err.message !== "TRICK_CANCELLED") {
            console.error("Błąd tricku:", err);
        }
    } finally {
        activeTrickId = null;
        updateTrickUI(false, "Gotowy do jazdy");
        await sendPacket(false, false, false, false, 0, getEffectiveLights());
    }
}

function stopActiveTrick() {
    trickCancelFlag = true;
    activeTrickId = null;
    updateTrickUI(false, "Zatrzymano trick");
    sendPacket(false, false, false, false, 0, getEffectiveLights());
    triggerVibrate(vibration.release);
    rumbleGamepad(0.3, 0.3, 100);
}

function updateTrickUI(isRunning, text) {
    if (trickStatusText) {
        trickStatusText.textContent = text;
    }
    if (stopTrickBtn) {
        stopTrickBtn.classList.toggle("visible", isRunning);
    }
    document.querySelectorAll(".trick-btn").forEach(btn => {
        const id = parseInt(btn.dataset.id, 10);
        btn.classList.toggle("active-trick", isRunning && activeTrickId === id);
    });
}

function initTrickButtons() {
    if (!tricksContainer) return;
    tricksContainer.innerHTML = "";
    TRICKS.forEach(trick => {
        const btn = document.createElement("button");
        btn.className = "trick-btn disabled";
        btn.dataset.id = trick.id;
        btn.innerHTML = `
            <div class="trick-badge">[${trick.key}]</div>
            <div class="trick-icon">${trick.icon}</div>
            <div class="trick-info">
                <strong>${trick.name}</strong>
                <span>${trick.desc}</span>
            </div>
        `;
        btn.addEventListener("click", () => {
            if (!connected) return;
            startTrick(trick);
        });
        tricksContainer.appendChild(btn);
    });
}

// --- Główna Pętla Jazdy Manualnej ---
let manualLoopRunning = false;
async function startManualDriveLoop() {
    if (manualLoopRunning) return;
    manualLoopRunning = true;

    while (connected && ctrlChar) {
        if (activeTrickId === null) {
            // Połączenie wejść z klawiatury/ekranu ORAZ z kontrolera Pad
            const f = userKeys.forward  || padState.forward;
            const b = userKeys.backward || padState.backward;
            const l = userKeys.left     || padState.left;
            const r = userKeys.right    || padState.right;

            const power = getEffectivePower();
            const lights = getEffectiveLights();

            await sendPacket(f, b, l, r, power, lights);
        }
        await delay(55);
    }
    manualLoopRunning = false;
}

// --- Funkcje Kontroli Mocy i Biegów ---
function setPower(val) {
    basePower = Math.max(20, Math.min(100, Math.round(val)));
    if (powerSlider) powerSlider.value = basePower;
    if (powerValueLabel) powerValueLabel.textContent = `${basePower}%`;
    if (powerGaugeBar) powerGaugeBar.style.width = `${basePower}%`;

    // Aktualizacja wybranego biegu
    if (basePower <= 45) currentGear = 1;
    else if (basePower <= 70) currentGear = 2;
    else if (basePower <= 90) currentGear = 3;
    else currentGear = 4;

    updateGearUI();
}

function updateGearUI() {
    if (gearBadge) {
        gearBadge.textContent = userTurbo ? "TURBO (100%)" : `BIEG ${currentGear} (${basePower}%)`;
    }
    document.querySelectorAll(".gear-btn").forEach(btn => {
        const g = parseInt(btn.dataset.gear, 10);
        btn.classList.toggle("active-gear", !userTurbo && currentGear === g);
    });
}

function setGear(gearNum) {
    currentGear = Math.max(1, Math.min(4, gearNum));
    userTurbo = false;
    updateTurboUI();
    if (currentGear === 1) setPower(40);       // Eco / precyzja
    else if (currentGear === 2) setPower(65);  // Średni
    else if (currentGear === 3) setPower(85);  // Sport (standard)
    else if (currentGear === 4) setPower(100); // Max
    triggerVibrate(vibration.gear);
    rumbleGamepad(0.2, 0.4, 80);
}

function toggleTurbo() {
    if (!connected) return;
    userTurbo = !userTurbo;
    updateTurboUI();
    triggerVibrate(vibration.turbo);
    rumbleGamepad(userTurbo ? 0.7 : 0.2, userTurbo ? 0.8 : 0.2, 140);
}

function updateTurboUI() {
    turboBtn.textContent = userTurbo ? "TURBO 100% [T / Y]" : "TURBO OFF [T / Y]";
    turboBtn.classList.toggle("turbo-on", userTurbo);
    updateGearUI();
}

// --- Funkcje Kontroli Świateł ---
function toggleLights() {
    lightsEnabled = !lightsEnabled;
    updateLightsUI();
    triggerVibrate(vibration.light);
    rumbleGamepad(0.2, 0.2, 60);
}

function toggleStrobe() {
    strobeActive = !strobeActive;
    updateLightsUI();
    triggerVibrate(vibration.light);
    rumbleGamepad(0.4, 0.4, 80);
}

function updateLightsUI() {
    if (lightsBtn) {
        lightsBtn.textContent = lightsEnabled ? "💡 Światła: WŁ [L / X]" : "💡 Światła: WYŁ [L / X]";
        lightsBtn.classList.toggle("light-active", lightsEnabled);
    }
    if (strobeBtn) {
        strobeBtn.textContent = strobeActive ? "🚨 Stroboskop: WŁ [H / A]" : "🚨 Stroboskop: WYŁ [H / A]";
        strobeBtn.classList.toggle("strobe-active", strobeActive);
    }
}

// Błysk klaksonu / świateł
async function triggerHorn() {
    triggerVibrate([40, 30, 80]);
    rumbleGamepad(0.6, 0.8, 250);
    const oldLights = lightsEnabled;
    for (let i = 0; i < 4; i++) {
        lightsEnabled = !lightsEnabled;
        updateLightsUI();
        await delay(80);
    }
    lightsEnabled = oldLights;
    updateLightsUI();
}

// =============================================================================
// OBSŁUGA KONTROLERA PAD (HTML5 Gamepad API - Xbox / PlayStation / Generic)
// =============================================================================
let prevPadButtons = {};

function initGamepad() {
    window.addEventListener("gamepadconnected", (e) => {
        padState.connected = true;
        padState.name = e.gamepad.id || "Kontroler Gamepad";
        updateGamepadStatusUI(true, padState.name);
        rumbleGamepad(0.5, 0.5, 200);
    });

    window.addEventListener("gamepaddisconnected", () => {
        padState.connected = false;
        padState.name = "";
        resetPadMovement();
        updateGamepadStatusUI(false, "");
    });

    // Pętla odpytywania stanu pada (requestAnimationFrame dla 60-120fps)
    requestAnimationFrame(pollGamepadLoop);
}

function updateGamepadStatusUI(isConnected, name) {
    if (gamepadStatus) {
        gamepadStatus.className = isConnected ? "pad-status-online" : "pad-status-offline";
    }
    if (gamepadName) {
        gamepadName.textContent = isConnected ? `Połączono: ${cleanGamepadName(name)}` : "Nie wykryto (Wciśnij dowolny przycisk na padzie)";
    }
}

function cleanGamepadName(rawName) {
    if (!rawName) return "Gamepad";
    if (rawName.toLowerCase().includes("xbox")) return "Xbox Controller";
    if (rawName.toLowerCase().includes("playstation") || rawName.toLowerCase().includes("dual")) return "PlayStation Controller";
    return rawName.slice(0, 30);
}

function resetPadMovement() {
    padState.forward = false;
    padState.backward = false;
    padState.left = false;
    padState.right = false;
    padState.analogPower = null;
}

// Główna pętla Gamepada
function pollGamepadLoop() {
    if (navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        let activePad = null;
        for (const gp of gamepads) {
            if (gp && gp.connected) {
                activePad = gp;
                break;
            }
        }

        if (activePad) {
            if (!padState.connected) {
                padState.connected = true;
                padState.name = activePad.id;
                updateGamepadStatusUI(true, activePad.id);
            }
            processGamepadInputs(activePad);
        } else if (padState.connected) {
            padState.connected = false;
            resetPadMovement();
            updateGamepadStatusUI(false, "");
        }
    }
    requestAnimationFrame(pollGamepadLoop);
}

// Przetwarzanie wejść z pada Xbox
function processGamepadInputs(gp) {
    const buttons = gp.buttons;
    const axes = gp.axes;

    // Helper do detekcji pojedynczego kliknięcia (edge trigger)
    const isJustPressed = (btnIndex) => {
        const isDown = buttons[btnIndex] && buttons[btnIndex].pressed;
        const wasDown = !!prevPadButtons[btnIndex];
        return isDown && !wasDown;
    };

    // 1. GAZ (Spust RT - buttons[7])
    const rtVal = buttons[7] ? buttons[7].value : 0;
    const isRT = rtVal > 0.12;

    // 2. HAMULEC / WSTECZNY (Spust LT - buttons[6])
    const ltVal = buttons[6] ? buttons[6].value : 0;
    const isLT = ltVal > 0.12;

    // 3. SKRĘT (Lewa Gałka - axes[0] LUB Krzyżak D-Pad buttons[14],[15])
    const stickX = axes[0] || 0;
    const dpadLeft = buttons[14] && buttons[14].pressed;
    const dpadRight = buttons[15] && buttons[15].pressed;
    const dpadUp = buttons[12] && buttons[12].pressed;
    const dpadDown = buttons[13] && buttons[13].pressed;

    const isLeft = (stickX < -0.22) || dpadLeft;
    const isRight = (stickX > 0.22) || dpadRight;
    const isForward = isRT || dpadUp;
    const isBackward = (!isForward && (isLT || dpadDown));

    // Jeśli użytkownik poruszy padem w trakcie tricku -> natychmiast przerywamy trick
    if (activeTrickId !== null && (isForward || isBackward || isLeft || isRight)) {
        stopActiveTrick();
    }

    // Aktualizacja stanu ruchu
    padState.forward = isForward;
    padState.backward = isBackward;
    padState.left = isLeft;
    padState.right = isRight;

    // Analogowa moc silników na podstawie wciśnięcia RT/LT (jeśli użytkownik steruje spustem)
    if (isRT && !userTurbo) {
        // Płynne skalowanie mocy od 30% do basePower w zależności od głębokości wciśnięcia RT
        padState.analogPower = Math.round(30 + (basePower - 30) * Math.max(0, (rtVal - 0.12) / 0.88));
    } else if (isLT && !userTurbo) {
        padState.analogPower = Math.round(30 + (basePower - 30) * Math.max(0, (ltVal - 0.12) / 0.88));
    } else {
        padState.analogPower = null;
    }

    // 4. BIEGI: RB (buttons[5]) = Bieg w górę, LB (buttons[4]) = Bieg w dół
    if (isJustPressed(5)) {
        setGear(currentGear + 1);
    }
    if (isJustPressed(4)) {
        setGear(currentGear - 1);
    }

    // 5. TURBO: Przycisk Y (buttons[3]) lub wciśnięcie prawej gałki (RS buttons[11])
    if (isJustPressed(3) || isJustPressed(11)) {
        toggleTurbo();
    }

    // 6. ŚWIATŁA: Przycisk X (buttons[2])
    if (isJustPressed(2)) {
        toggleLights();
    }

    // 7. STROBOSKOP: Przycisk A (buttons[0])
    if (isJustPressed(0)) {
        toggleStrobe();
    }

    // 8. KLAKSON: Przycisk B (buttons[1])
    if (isJustPressed(1)) {
        triggerHorn();
    }

    // 9. EMERGENCY STOP / PRZERWIJ TRICK: Menu/Start (buttons[9]) lub View/Back (buttons[8])
    if (isJustPressed(9) || isJustPressed(8)) {
        if (activeTrickId !== null) {
            stopActiveTrick();
        } else {
            resetPadMovement();
            Object.keys(userKeys).forEach(k => userKeys[k] = false);
            sendPacket(false, false, false, false, 0, getEffectiveLights());
            rumbleGamepad(0.6, 0.6, 150);
        }
    }

    // Aktualizacja wskaźników aktywności przycisków w UI
    updatePadVisualButtons(gp, isForward, isBackward, isLeft, isRight);

    // Zapis stanu do detekcji kolejnych kliknięć
    for (let i = 0; i < buttons.length; i++) {
        prevPadButtons[i] = buttons[i].pressed;
    }
}

// Podświetlanie aktywnych przycisków pada w UI
function updatePadVisualButtons(gp, f, b, l, r) {
    const setElemActive = (id, active) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("pad-btn-active", active);
    };

    setElemActive("pad-rt", f);
    setElemActive("pad-lt", b);
    setElemActive("pad-stick", l || r);
    setElemActive("pad-rb", gp.buttons[5]?.pressed);
    setElemActive("pad-lb", gp.buttons[4]?.pressed);
    setElemActive("pad-y", gp.buttons[3]?.pressed || userTurbo);
    setElemActive("pad-x", gp.buttons[2]?.pressed || lightsEnabled);
    setElemActive("pad-b", gp.buttons[1]?.pressed);
    setElemActive("pad-a", gp.buttons[0]?.pressed || strobeActive);
}

// --- Połączenie Web Bluetooth ---
async function connectQcar() {
    const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "QCAR-" }],
        optionalServices: [BLE_SERVICE_UUID]
    });

    const gattServer = await device.gatt.connect();
    const service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
    const controlChar = await service.getCharacteristic(BLE_CTRL_UUID);
    const batteryChar = await service.getCharacteristic(BLE_BATT_UUID);

    try {
        await batteryChar.startNotifications();
        batteryChar.addEventListener("characteristicvaluechanged", (e) => {
            try {
                const hex = toHex(new Uint8Array(e.target.value.buffer));
                const decrypted = fromHex(decryptHex(hex));
                const percentage = decrypted[4];
                updateBattery(percentage);
            } catch (_) {}
        });
    } catch (_) {}

    return { server: gattServer, ctrlChar: controlChar, battChar: batteryChar };
}

function updateBattery(pct) {
    if (!batteryDisplay || !batteryFill) return;
    const clamped = Math.max(0, Math.min(100, pct));
    batteryDisplay.textContent = clamped + "%";
    batteryFill.style.width = clamped + "%";
    batteryFill.style.background = clamped > 60 ? "#22c55e" : clamped > 25 ? "#eab308" : "#ef4444";
}

function setConnectedState(isConnected) {
    connected = isConnected;
    connectBtn.textContent = isConnected ? "Rozłącz" : "Połącz z samochodem";
    connectBtn.classList.toggle("connected", isConnected);
    controls.classList.toggle("disabled", !isConnected);
    turboBtn.classList.toggle("disabled", !isConnected);
    if (lightsBtn) lightsBtn.classList.toggle("disabled", !isConnected);
    if (strobeBtn) strobeBtn.classList.toggle("disabled", !isConnected);
    if (hornBtn) hornBtn.classList.toggle("disabled", !isConnected);
    batteryContainer.style.display = isConnected ? "flex" : "none";

    if (connectionStatus) {
        connectionStatus.textContent = isConnected ? "POŁĄCZONO" : "ROZŁĄCZONO";
        connectionStatus.className = isConnected ? "status-online" : "status-offline";
    }

    document.querySelectorAll(".trick-btn, .gear-btn").forEach(btn => {
        btn.classList.toggle("disabled", !isConnected);
    });

    if (!isConnected) {
        stopActiveTrick();
    }
}

// --- Obsługa Przycisków Ruchu i Klawiatury ---
const keyMap = {
    'ArrowUp': 'forward',
    'ArrowDown': 'backward',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'w': 'forward',
    's': 'backward',
    'a': 'left',
    'd': 'right',
    'W': 'forward',
    'S': 'backward',
    'A': 'left',
    'D': 'right'
};

function pressMovementKey(key, el) {
    if (!connected) return;
    if (activeTrickId !== null) {
        stopActiveTrick();
    }
    userKeys[key] = true;
    if (el) el.classList.add('active');
    triggerVibrate(vibration.press);
}

function releaseMovementKey(key, el) {
    userKeys[key] = false;
    if (el) el.classList.remove('active');
    triggerVibrate(vibration.release);
}

// --- Inicjalizacja Aplikacji ---
document.addEventListener("DOMContentLoaded", () => {
    initTrickButtons();
    initGamepad();
    setPower(85);
    updateLightsUI();

    // Suwak mocy silników
    if (powerSlider) {
        powerSlider.addEventListener("input", (e) => {
            setPower(parseFloat(e.target.value));
        });
    }

    // Przyciski 4 Biegów
    document.querySelectorAll(".gear-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!connected) return;
            const gear = parseInt(btn.dataset.gear, 10);
            setGear(gear);
        });
    });

    // Przyciski Świateł i Klaksonu
    if (lightsBtn) lightsBtn.addEventListener("click", toggleLights);
    if (strobeBtn) strobeBtn.addEventListener("click", toggleStrobe);
    if (hornBtn) hornBtn.addEventListener("click", triggerHorn);
    turboBtn.addEventListener("click", toggleTurbo);

    if (stopTrickBtn) {
        stopTrickBtn.addEventListener("click", stopActiveTrick);
    }

    // Przyciski dotykowe kierunków
    document.querySelectorAll('#controls button').forEach(btn => {
        const key = btn.dataset.key;
        btn.addEventListener('mousedown', () => pressMovementKey(key, btn));
        btn.addEventListener('mouseup', () => releaseMovementKey(key, btn));
        btn.addEventListener('touchstart', e => { e.preventDefault(); pressMovementKey(key, btn); });
        btn.addEventListener('touchend', e => { e.preventDefault(); releaseMovementKey(key, btn); });
        btn.addEventListener("mouseleave", () => {
            if (userKeys[key]) releaseMovementKey(key, btn);
        });
    });

    // Przycisk Połącz / Rozłącz
    connectBtn.addEventListener("click", async () => {
        if (!connected) {
            try {
                connectBtn.disabled = true;
                connectBtn.textContent = "Wyszukiwanie...";
                const result = await connectQcar();
                server = result.server;
                ctrlChar = result.ctrlChar;
                battChar = result.battChar;

                server.device.addEventListener('gattserverdisconnected', () => {
                    ctrlChar = null;
                    server = null;
                    setConnectedState(false);
                });

                await delay(300);
                setConnectedState(true);
                startManualDriveLoop();
                triggerVibrate(vibration.connect);
                rumbleGamepad(0.6, 0.8, 300);
            } catch (err) {
                console.error("Błąd BLE:", err);
                setConnectedState(false);
                ctrlChar = null;
                server = null;
            } finally {
                connectBtn.disabled = false;
            }
        } else {
            try {
                if (server && server.connected) {
                    server.device.gatt.disconnect();
                }
            } catch (err) {
                console.error(err);
            }
            ctrlChar = null;
            server = null;
            setConnectedState(false);
            triggerVibrate(vibration.disconnect);
            rumbleGamepad(0.4, 0.4, 150);
        }
    });

    // Klawiatura
    document.addEventListener('keydown', e => {
        // Spacja = natychmiastowe zatrzymanie / przerwanie tricku
        if (e.code === 'Space') {
            e.preventDefault();
            if (activeTrickId !== null) {
                stopActiveTrick();
            } else {
                Object.keys(userKeys).forEach(k => {
                    userKeys[k] = false;
                    const btn = document.querySelector(`[data-key="${k}"]`);
                    if (btn) btn.classList.remove('active');
                });
                resetPadMovement();
                sendPacket(false, false, false, false, 0, getEffectiveLights());
            }
            return;
        }

        // Klawisze ruchu WASD i strzałki
        const mappedMovement = keyMap[e.key];
        if (mappedMovement) {
            e.preventDefault();
            const btn = document.querySelector(`[data-key="${mappedMovement}"]`);
            pressMovementKey(mappedMovement, btn);
            return;
        }

        // T = Turbo
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            toggleTurbo();
            return;
        }

        // L = Przełącznik Świateł
        if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            toggleLights();
            return;
        }

        // H = Stroboskop / Awaryjne
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            toggleStrobe();
            return;
        }

        // K = Klakson / Błysk
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            triggerHorn();
            return;
        }

        // Q / E = Bieg w dół / w górę
        if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            if (currentGear > 1) setGear(currentGear - 1);
            return;
        }
        if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            if (currentGear < 4) setGear(currentGear + 1);
            return;
        }

        // Klawisze numeryczne 1-9 oraz 0 = 10 Tricków
        const matchingTrick = TRICKS.find(t => t.key === e.key);
        if (matchingTrick && connected) {
            e.preventDefault();
            startTrick(matchingTrick);
        }
    });

    document.addEventListener('keyup', e => {
        const mappedMovement = keyMap[e.key];
        if (mappedMovement) {
            e.preventDefault();
            const btn = document.querySelector(`[data-key="${mappedMovement}"]`);
            releaseMovementKey(mappedMovement, btn);
        }
    });
});
