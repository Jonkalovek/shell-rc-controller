# 🏎️ Shell Motorsports Collection Web Controller Pro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Web Bluetooth API](https://img.shields.io/badge/Web%20Bluetooth-API-0082FC?logo=googlechrome&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
[![Gamepad API](https://img.shields.io/badge/Gamepad-API-107C41?logo=xbox&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Ready-brightgreen?logo=github)](https://pages.github.com/)

Nowoczesny, lekki i w 100% bezinstalacyjny kontroler przeglądarkowy dla zdalnie sterowanych modeli samochodów **Shell Motorsports Collection (QCAR)**. Zastępuje oficjalną aplikację czystym interfejsem webowym działającym bezpośrednio w Google Chrome / Microsoft Edge.

Projekt składa się **wyłącznie z dwóch plików** (`index.html` oraz `main.js`) i jest w 100% gotowy do natychmiastowego hostowania na **GitHub Pages**.

---

## ✨ Główne Funkcje

* 🎮 **Pełna obsługa Pada (Xbox One / Series / PS4 / PS5 / PC):**
  * **RT (Prawy Spust):** Płynny, analogowy gaz (proporcjonalny do siły nacisku).
  * **LT (Lewy Spust):** Hamulec i bieg wsteczny.
  * **Lewa Gałka (L-Stick) & D-Pad:** Płynne sterowanie kołami (skręt lewo/prawo).
  * **RB / LB:** Zmiana biegów w górę i w dół (Biegi 1–4).
  * **Przycisk Y:** Turbo (100% mocy).
  * **Przycisk X:** Światła LED WŁ / WYŁ.
  * **Przycisk A:** Tryb Stroboskop / Światła awaryjne (Safety Car).
  * **Przycisk B:** Klakson / Błysk ostrzegawczy.
  * **Menu (Start) / View (Back):** Natychmiastowe zatrzymanie awaryjne (Emergency Stop).
  * 📳 **Wibracje Dual-Rumble:** Wibracje pada przy przyspieszaniu, zmianie biegów i trikach.

* ⚡ **Regulacja Mocy Silnika i 4 Wirtualne Biegi:**
  * Płynny suwak wypełnienia PWM silników od **20% do 100%**.
  * 4 biegi: **1: Eco (40%)**, **2: Normal (65%)**, **3: Sport (85%)**, **4: Max/Turbo (100%)**.
  * Wirtualny obrotomierz / pasek mocy (Power Gauge).

* 💡 **Kompletne Sterowanie Oświetleniem LED:**
  * Prawidłowa obsługa bajtu 8 protokołu (`0 = WŁ`, `1 = WYŁ`).
  * Tryb świateł ciągłych, stroboskopu awaryjnego i klaksonu świetlnego.

* 🏎️ **10 Gotowych Trików Kaskaderskich (100% Mocy + Światła):**
  * `[1]` **Bączek 360° w prawo** (z kontrą wyhamowującą)
  * `[2]` **Bączek 360° w lewo** (z kontrą wyhamowującą)
  * `[3]` **Podwójny Bączek 720°** (dwa pełne obroty w miejscu)
  * `[4]` **Szybki Slalom** (szerokie łuki omijające pachołki)
  * `[5]` **Nawrotka J-Turn 180°** (ucieczka tyłem i obrót przodem)
  * `[6]` **Ósemka (Figure 8)** (symetryczne pętle)
  * `[7]` **Launch Control F1** (odliczanie świateł, przegazówki i start 100%)
  * `[8]` **Awaryjne Hamowanie i Odskok** (sprint przód, kontra tył)
  * `[9]` **Slalom Wsteczny** (precyzyjne cofanie łukami)
  * `[0]` **Taniec Kaskaderski** (dyskoteka świateł, ruch wahadłowy i piruet)

* 🔋 **Wskaźnik Baterii w Czasie Rzeczywistym:**
  * Odczyt powiadomień BLE GATT z deszyfrowaniem AES-128 ECB i wskaźnikiem procentowym.

---

## 🚀 Jak uruchomić na GitHub Pages (W 2 minuty)

1. **Utwórz nowe repozytorium na GitHubie** (np. `shell-rc-controller`).
2. **Wypchnij ten projekt do repozytorium:**
   ```bash
   git remote add origin https://github.com/TWOJA_NAZWA/shell-rc-controller.git
   git branch -M main
   git push -u origin main
   ```
3. **Włącz darmowy hosting GitHub Pages:**
   * W repozytorium na GitHubie wejdź w: **Settings** ➔ **Pages**.
   * W sekcji **Build and deployment** wybierz:
     * Source: **Deploy from a branch**
     * Branch: **main** / folder: `/(root)`
   * Kliknij **Save**.
4. Po chwili Twoja strona będzie dostępna pod adresem:  
   `https://TWOJA_NAZWA.github.io/shell-rc-controller/`

> ⚠️ **Ważne:** Web Bluetooth API wymaga połączenia szyfrowanego **HTTPS** (zapewnianego automatycznie przez GitHub Pages) lub `localhost` oraz przeglądarki **Google Chrome** lub **Microsoft Edge**.

---

## 🎮 Klawiszologia (Keybinds)

### Kontroler Pad (Xbox One S / Series / PS):
| Przycisk | Akcja |
|---|---|
| **RT (Prawy Spust)** | Płynny gaz analogowy (Przód) |
| **LT (Lewy Spust)** | Hamulec / Wsteczny |
| **Lewa Gałka / D-Pad** | Skręt w lewo / w prawo |
| **RB / LB** | Zmiana biegu w górę / w dół (1–4) |
| **Y (lub RS)** | TURBO (100% mocy) |
| **X** | Włącz / Wyłącz światła |
| **A** | Stroboskop / Światła awaryjne |
| **B** | Klakson / Błysk ostrzegawczy |
| **Menu / View** | Natychmiastowe zatrzymanie (Emergency Stop) |

### Klawiatura:
| Klawisze | Akcja |
|---|---|
| **W / A / S / D** lub strzałki | Jazda (przód, tył, skręt) |
| **Q / E** | Zmiana biegu w dół / w górę |
| **T** | Przełącznik Turbo |
| **L** | Przełącznik Świateł |
| **H** | Przełącznik Stroboskopu |
| **K** | Klakson / Błysk |
| **1 – 9, 0** | Uruchomienie jednego z 10 trików |
| **Spacja** | Natychmiastowe zatrzymanie / przerwanie tricku |

---

## 🔧 Szczegóły Protokołu BLE

* **Prefix nazwy BLE:** `QCAR-*`
* **Service UUID:** `0000fff0-0000-1000-8000-00805f9b34fb`
* **Control Characteristic UUID:** `d44bc439-abfd-45a2-b575-925416129600`
* **Battery Characteristic UUID:** `d44bc439-abfd-45a2-b575-925416129601`
* **Szyfrowanie:** AES-128 ECB (NoPadding) z kluczem `34522a5b7a6e492c08090a9d8d2a23f8`

### Format Ramki Danych (16 bajtów):
| Bajt | Wartość | Opis |
|---|---|---|
| `[1..3]` | `0x43, 0x54, 0x4C` | Nagłówek ASCII `"CTL"` |
| `[4]` | `0` lub `1` | Bieg w przód |
| `[5]` | `0` lub `1` | Bieg wsteczny |
| `[6]` | `0` lub `1` | Skręt w lewo |
| `[7]` | `0` lub `1` | Skręt w prawo |
| `[8]` | `0` (WŁ) / `1` (WYŁ) | Przednie światła LED |
| `[9]` | `0x14` do `0x64` | Wypełnienie mocy silnika (20% – 100%) |

---

## 📄 Licencja

Projekt udostępniony na licencji [MIT](LICENSE).
