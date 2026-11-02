// ==========================================
// TIMELINE GAME MODE (Hitster-Style)
// ==========================================

let timelineState = {
    active: false,
    mode: 'challenge',          // 'challenge' (10 Runden) | 'endless' (Endlos, max 10 Karten)
    difficulty: 'standard',     // 'standard' | 'profi' | 'experte'
    pool: [],                   // Gefilterte Songs mit gültigem Erscheinungsjahr
    usedKeys: new Set(),        // Verhindert doppelte Songs in einer Sitzung
    timelineCards: [],          // Array aus { song, addedOrder, isNewlyPlaced }
    nextOrderCounter: 0,        // Zählt hoch für FIFO-Entfernung im Endlos-Modus
    currentSong: null,          // Aktuell zu erratender Song
    currentStartSec: 0,         // Startsekunde des aktuellen Songs
    isPaused: false,
    round: 1,                   // Aktuelle Runde (Challenge: 1..10, Endlos: 1..n)
    totalPlaced: 0,             // Anzahl erfolgreich eingeordneter Songs
    currentStreak: 0,           // Aktuelle fehlerfreie Serie (Endlos-Modus)
    bestStreak: 0,              // Längste Serie in dieser Runde (Endlos-Modus)
    mistakesThisRound: 0,       // Fehlversuche beim aktuellen Song
    phase: 'idle',              // 'guessing' | 'round_won' | 'gameover'
    playTimer: null
};

// Geometrie-Snapshot für butterweiches Drag & Drop ohne Flackern
let dragSnapshot = {
    active: false,
    cardCenters: [],
    slotPositions: [],
    hoveredSlot: null
};

// Hilfsfunktion: Eindeutiger Key für einen Song
function getSongKey(song) {
    return song.spotifyUri || `${song.artist}___${song.title}___${song.year}`;
}

// Hilfsfunktion: Sauberer Songtitel für kompakte Kartenanzeige (optional mit vollem Tooltip)
function formatCardTitle(rawTitle) {
    if (typeof cleanTitleString === 'function') {
        const cleaned = cleanTitleString(rawTitle);
        return cleaned.length > 0 ? cleaned : rawTitle;
    }
    return rawTitle;
}

// ==========================================
// 1. NAVIGATION & SUB-DASHBOARD
// ==========================================

function openTimelineDashboard() {
    if (typeof stoppeSpotify === 'function') stoppeSpotify();
    if (typeof stoppeLyricsInstrumental === 'function') stoppeLyricsInstrumental();

    if (typeof songs === 'undefined' || songs.length === 0) {
        alert("Songs werden noch geladen. Bitte einen kurzen Moment warten!");
        return;
    }

    // Aktuelle Filter vom Hauptdashboard übernehmen
    if (typeof calculateFilteredSongs === 'function') {
        const calculated = calculateFilteredSongs();
        if (!calculated) return; // Warnung wurde bereits von calculateFilteredSongs gezeigt
        filteredSongs = calculated;
    } else if (typeof filteredSongs === 'undefined' || filteredSongs.length === 0) {
        filteredSongs = [...songs];
    }

    const validYearSongs = filteredSongs.filter(s => s.year && !isNaN(parseInt(s.year)));
    if (validYearSongs.length < 12) {
        alert(`Für den Timeline-Modus werden mindestens 12 Songs mit gültigem Erscheinungsjahr benötigt (aktuell gefunden: ${validYearSongs.length}). Bitte lockere deine Filter ein wenig!`);
        return;
    }

    const badge = document.getElementById('timeline-filter-pool-badge');
    if (badge) {
        badge.innerText = `🎵 ${validYearSongs.length} Songs im aktuellen Filter-Pool`;
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('song-list-screen').classList.add('hidden');
    document.getElementById('lyrics-mode-screen').classList.add('hidden');
    document.getElementById('timeline-game-screen').classList.add('hidden');
    document.getElementById('timeline-dashboard-screen').classList.remove('hidden');

    updateTimelineDifficultyUI();
}

function closeTimelineDashboard() {
    if (timelineState.playTimer) clearTimeout(timelineState.playTimer);
    if (typeof stoppeSpotify === 'function') stoppeSpotify(true);
    timelineState.active = false;

    document.getElementById('timeline-dashboard-screen').classList.add('hidden');
    document.getElementById('timeline-game-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

function returnToTimelineDashboard() {
    if (timelineState.playTimer) clearTimeout(timelineState.playTimer);
    if (typeof stoppeSpotify === 'function') stoppeSpotify(true);
    timelineState.active = false;
    timelineState.phase = 'idle';

    document.getElementById('timeline-game-screen').classList.add('hidden');
    document.getElementById('timeline-dashboard-screen').classList.remove('hidden');
}

function updateTimelineDifficultyUI() {
    const selected = document.querySelector('input[name="tl-difficulty"]:checked');
    const val = selected ? selected.value : 'standard';
    timelineState.difficulty = val;

    ['standard', 'profi', 'experte'].forEach(diff => {
        const label = document.getElementById(`tl-diff-label-${diff}`);
        if (label) {
            if (diff === val) label.classList.add('active');
            else label.classList.remove('active');
        }
    });
}

// ==========================================
// 2. SPIEL STARTEN & SONGS ZIEHEN
// ==========================================

function drawWeightedTimelineSong() {
    const onBoardKeys = new Set(timelineState.timelineCards.map(c => getSongKey(c.song)));
    let available = timelineState.pool.filter(s => !timelineState.usedKeys.has(getSongKey(s)));

    // Falls in einer extrem langen Endlos-Runde alle Songs aufgebraucht wurden -> Pool recyceln (außer Karten auf dem Board)
    if (available.length === 0) {
        timelineState.usedKeys = new Set(onBoardKeys);
        available = timelineState.pool.filter(s => !timelineState.usedKeys.has(getSongKey(s)));
    }

    if (available.length === 0) {
        available = [...timelineState.pool];
    }

    let chosen = null;

    // Jahrzehnt-Gewichtung aus radar.js berücksichtigen
    if (typeof radarValues !== 'undefined' && Array.isArray(radarValues) && radarValues.length === 7) {
        let pools = [[], [], [], [], [], [], []];
        available.forEach(s => {
            let y = s.year;
            if (y < 1970) pools[0].push(s);
            else if (y < 1980) pools[1].push(s);
            else if (y < 1990) pools[2].push(s);
            else if (y < 2000) pools[3].push(s);
            else if (y < 2010) pools[4].push(s);
            else if (y < 2020) pools[5].push(s);
            else pools[6].push(s);
        });

        let activeWeights = radarValues.map((w, i) => pools[i].length > 0 ? w : 0);
        let totalWeight = activeWeights.reduce((a, b) => a + b, 0);

        if (totalWeight > 0) {
            let rand = Math.random() * totalWeight;
            let cumulative = 0;
            let selectedDecade = 0;
            for (let i = 0; i < activeWeights.length; i++) {
                cumulative += activeWeights[i];
                if (rand <= cumulative) {
                    selectedDecade = i;
                    break;
                }
            }
            const winningPool = pools[selectedDecade];
            chosen = winningPool[Math.floor(Math.random() * winningPool.length)];
        }
    }

    if (!chosen) {
        chosen = available[Math.floor(Math.random() * available.length)];
    }

    if (chosen) {
        timelineState.usedKeys.add(getSongKey(chosen));
    }
    return chosen;
}

function startTimelineGame(mode) {
    updateTimelineDifficultyUI();

    const validPool = (filteredSongs && filteredSongs.length > 0 ? filteredSongs : songs)
        .filter(s => s.year && !isNaN(parseInt(s.year)));

    if (validPool.length < 12) {
        alert("Zu wenige Songs im Filter-Pool! Bitte passe die Filter im Hauptdashboard an.");
        return;
    }

    timelineState.active = true;
    timelineState.mode = mode;
    timelineState.pool = validPool;
    timelineState.usedKeys = new Set();
    timelineState.timelineCards = [];
    timelineState.nextOrderCounter = 0;
    timelineState.currentSong = null;
    timelineState.round = 1;
    timelineState.totalPlaced = 0;
    timelineState.currentStreak = 0;
    timelineState.bestStreak = 0;
    timelineState.mistakesThisRound = 0;
    timelineState.phase = 'guessing';

    // Start-Referenzkarte für den Zeitstrahl ziehen
    const starterSong = drawWeightedTimelineSong();
    timelineState.timelineCards.push({
        song: starterSong,
        addedOrder: ++timelineState.nextOrderCounter,
        isNewlyPlaced: false
    });

    // UI umschalten
    document.getElementById('timeline-dashboard-screen').classList.add('hidden');
    document.getElementById('timeline-game-screen').classList.remove('hidden');

    // Header-Badges setzen
    const modeBadge = document.getElementById('tl-mode-badge');
    const diffBadge = document.getElementById('tl-diff-badge');
    const endEndlessBtn = document.getElementById('tl-end-endless-btn');

    if (mode === 'challenge') {
        modeBadge.innerText = '🏆 Challenge Modus (10 Runden)';
        endEndlessBtn.classList.add('hidden');
    } else {
        modeBadge.innerText = '♾️ Endlos Modus';
        endEndlessBtn.classList.remove('hidden');
    }

    const diffNames = { standard: '⭐ Standard', profi: '🔥 Profi', experte: '💎 Experte' };
    diffBadge.innerText = diffNames[timelineState.difficulty] || '⭐ Standard';

    // Erste Runde starten
    beginTimelineRound();
}

function restartCurrentTimelineMode() {
    startTimelineGame(timelineState.mode);
}

function beginTimelineRound() {
    timelineState.phase = 'guessing';
    timelineState.mistakesThisRound = 0;
    timelineState.isPaused = false;

    // Markierung der zuletzt platzierten Karte nach Rundenwechsel sanft zurücksetzen
    timelineState.timelineCards.forEach(c => c.isNewlyPlaced = false);

    // Nächsten zu erratenden Song ziehen
    const nextSong = drawWeightedTimelineSong();
    timelineState.currentSong = nextSong;
    currentSong = nextSong; // Globale Referenz für Admin-Kompatibilität

    // UI-Bereiche ein-/ausblenden
    document.getElementById('tl-mystery-stage').classList.remove('hidden');
    document.getElementById('tl-feedback-banner').classList.add('hidden');
    document.getElementById('tl-round-success-box').classList.add('hidden');
    document.getElementById('tl-gameover-box').classList.add('hidden');

    const pauseBtn = document.getElementById('tl-pause-btn');
    if (pauseBtn) pauseBtn.innerText = '⏸️ Pause';
    const wave = document.getElementById('tl-sound-wave');
    if (wave) wave.classList.remove('paused');

    // Admin-Hinweis falls Admin-Modus aktiv ist
    const isAdmin = document.getElementById('admin-mode-toggle')?.checked;
    const adminHintEl = document.getElementById('tl-admin-hint');
    if (adminHintEl) {
        if (isAdmin && nextSong) {
            adminHintEl.innerText = `Admin: ${nextSong.artist} - ${nextSong.title} (${nextSong.year})`;
            adminHintEl.classList.remove('hidden');
        } else {
            adminHintEl.classList.add('hidden');
        }
    }

    updateTimelineHeaderStats();
    renderTimelineBoard();
    playCurrentTimelineSong(true);
}

function nextTimelineRound() {
    if (!timelineState.active || timelineState.phase !== 'round_won') return;
    timelineState.round++;
    beginTimelineRound();
}

// ==========================================
// 3. AUDIO-STEUERUNG IM TIMELINE-MODUS
// ==========================================

function playCurrentTimelineSong(chooseNewStart = false) {
    const song = timelineState.currentSong;
    if (!song || !song.spotifyUri) return;

    if (chooseNewStart) {
        const modeInput = document.querySelector('input[name="start-mode"]:checked');
        const startMode = modeInput ? modeInput.value : 'random';
        if (startMode === 'start') {
            timelineState.currentStartSec = 0;
        } else {
            timelineState.currentStartSec = Math.floor(Math.random() * 60) + 20;
        }
    }

    timelineState.isPaused = false;
    const pauseBtn = document.getElementById('tl-pause-btn');
    if (pauseBtn) pauseBtn.innerText = '⏸️ Pause';
    const wave = document.getElementById('tl-sound-wave');
    if (wave) wave.classList.remove('paused');

    if (typeof spieleSong === 'function') {
        spieleSong(song.spotifyUri, timelineState.currentStartSec);
    }

    if (timelineState.playTimer) clearTimeout(timelineState.playTimer);
    const durationInput = document.getElementById('play-duration');
    const playDuration = durationInput ? parseInt(durationInput.value) : NaN;

    if (!isNaN(playDuration) && playDuration > 0) {
        timelineState.playTimer = setTimeout(() => {
            if (typeof stoppeSpotify === 'function') stoppeSpotify();
            timelineState.isPaused = true;
            if (pauseBtn) pauseBtn.innerText = '▶️ Weiter';
            if (wave) wave.classList.add('paused');
        }, playDuration * 1000);
    }
}

function replayTimelineSong() {
    playCurrentTimelineSong(false);
}

function toggleTimelinePause() {
    const pauseBtn = document.getElementById('tl-pause-btn');
    const wave = document.getElementById('tl-sound-wave');

    if (!timelineState.isPaused) {
        if (timelineState.playTimer) clearTimeout(timelineState.playTimer);
        if (typeof stoppeSpotify === 'function') stoppeSpotify();
        timelineState.isPaused = true;
        if (pauseBtn) pauseBtn.innerText = '▶️ Abspielen';
        if (wave) wave.classList.add('paused');
    } else {
        playCurrentTimelineSong(false);
    }
}

// ==========================================
// 4. ZEITSTRAHL RENDERN & DYNAMISCHE SKALIERUNG
// ==========================================

function updateTimelineHeaderStats() {
    const statsBar = document.getElementById('tl-stats-bar');
    const countLabel = document.getElementById('tl-cards-count-label');

    const numCards = timelineState.timelineCards.length;
    if (countLabel) {
        if (timelineState.mode === 'endless') {
            countLabel.innerText = `${numCards} / 10 Karten auf dem Zeitstrahl`;
        } else {
            countLabel.innerText = `${numCards} ${numCards === 1 ? 'Karte' : 'Karten'} auf dem Zeitstrahl`;
        }
    }

    if (!statsBar) return;

    if (timelineState.mode === 'challenge') {
        statsBar.innerHTML = `
            <span class="tl-stat-pill highlight">🎯 Runde ${timelineState.round} / 10</span>
            <span class="tl-stat-pill">✅ Eingeordnet: ${timelineState.totalPlaced} / 10</span>
        `;
    } else {
        statsBar.innerHTML = `
            <span class="tl-stat-pill highlight">🔥 Aktuelle Serie: ${timelineState.currentStreak}</span>
            <span class="tl-stat-pill">🏆 Beste Serie: ${timelineState.bestStreak}</span>
            <span class="tl-stat-pill">📀 Gesamt: ${timelineState.totalPlaced}</span>
        `;
    }
}

function applyDynamicTimelineScale() {
    const track = document.getElementById('timeline-track');
    if (!track) return;

    const count = timelineState.timelineCards.length;
    // Dynamische Skalierung je nach Anzahl der Karten auf dem Zeitstrahl (1 bis 11)
    let cardWidth = 140;
    let cardGap = 14;
    let baseFont = 12;
    let shiftDist = 56;

    if (count <= 4) {
        cardWidth = 142;
        cardGap = 14;
        baseFont = 12;
        shiftDist = 60;
    } else if (count <= 6) {
        cardWidth = 130;
        cardGap = 12;
        baseFont = 11.5;
        shiftDist = 54;
    } else if (count <= 8) {
        cardWidth = 116;
        cardGap = 10;
        baseFont = 11;
        shiftDist = 48;
    } else {
        // 9 bis 11 Karten
        cardWidth = 104;
        cardGap = 8;
        baseFont = 10.5;
        shiftDist = 44;
    }

    // Zusätzlich auf kleineren Bildschirmen sanft anpassen
    const vw = window.innerWidth || 1280;
    if (vw < 1280 && count >= 7) {
        const factor = Math.max(0.78, vw / 1280);
        cardWidth = Math.round(cardWidth * factor);
        shiftDist = Math.round(shiftDist * factor);
    }

    track.style.setProperty('--tl-card-width', `${cardWidth}px`);
    track.style.setProperty('--tl-card-gap', `${cardGap}px`);
    track.style.setProperty('--tl-base-font', `${baseFont}px`);
    track.style.setProperty('--tl-shift-dist', `${shiftDist}px`);
}

function renderTimelineBoard() {
    const track = document.getElementById('timeline-track');
    if (!track) return;

    applyDynamicTimelineScale();
    track.innerHTML = '';

    timelineState.timelineCards.forEach((item, index) => {
        const song = item.song;
        const card = document.createElement('div');
        card.className = 'tl-card' + (item.isNewlyPlaced ? ' newly-placed' : '');
        card.dataset.index = index;

        const displayTitle = formatCardTitle(song.title);
        const fullTooltip = `${song.artist} – ${song.title} (${song.year})`;
        card.title = fullTooltip;

        // Klick auf eine aufgedeckte Zeitstrahl-Karte öffnet optional Spotify in neuem Tab
        if (song.spotifyUri) {
            const spotifyUrl = song.spotifyUri.replace('spotify:track:', 'https://open.spotify.com/track/');
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (dragSnapshot.active) return;
                window.open(spotifyUrl, '_blank');
            });
        }

        // Aufbau strikt von oben nach unten:
        // 1. Albumcover -> 2. Titel -> 3. Interpret -> 4. Entstehungsjahr (größer & fett)
        card.innerHTML = `
            <div class="tl-card-cover-wrap">
                <img class="tl-card-cover" src="${song.coverUrl || ''}" alt="Cover" loading="lazy">
            </div>
            <div class="tl-card-title">${escapeHtml(displayTitle)}</div>
            <div class="tl-card-artist">${escapeHtml(song.artist)}</div>
            <div class="tl-card-year">${song.year}</div>
        `;

        track.appendChild(card);
    });

    // Unsichtbarer Drop-Indikator für die animierte Lücke beim Ziehen
    const indicator = document.createElement('div');
    indicator.id = 'timeline-drop-indicator';
    indicator.className = 'tl-drop-indicator';
    indicator.innerHTML = `<span>⬇ Hier<br>ablegen</span>`;
    track.appendChild(indicator);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ==========================================
// 5. DRAG & DROP MIT PLATZ-MACH-ANIMATION
// ==========================================

function captureTimelineDragSnapshot() {
    const track = document.getElementById('timeline-track');
    if (!track) return;

    const cards = Array.from(track.querySelectorAll('.tl-card'));
    const trackRect = track.getBoundingClientRect();
    const gapStyle = parseFloat(getComputedStyle(track).getPropertyValue('--tl-card-gap')) || 12;

    // offsetLeft & offsetWidth sind unabhängig von CSS transform: translateX()!
    const cardCenters = cards.map(c => trackRect.left + c.offsetLeft + c.offsetWidth / 2);
    const slotPositions = [];

    if (cards.length === 0) {
        slotPositions.push(track.offsetWidth / 2);
    } else {
        // Slot 0: links vor der ersten Karte
        slotPositions.push(cards[0].offsetLeft - gapStyle / 2);

        // Slots 1 .. n-1: exakt in der Mitte zwischen Karte i-1 und Karte i
        for (let i = 1; i < cards.length; i++) {
            const prevRight = cards[i - 1].offsetLeft + cards[i - 1].offsetWidth;
            const currLeft = cards[i].offsetLeft;
            slotPositions.push((prevRight + currLeft) / 2);
        }

        // Slot n: rechts nach der letzten Karte
        const lastCard = cards[cards.length - 1];
        slotPositions.push(lastCard.offsetLeft + lastCard.offsetWidth + gapStyle / 2);
    }

    dragSnapshot.active = true;
    dragSnapshot.cardCenters = cardCenters;
    dragSnapshot.slotPositions = slotPositions;
    dragSnapshot.hoveredSlot = null;
}

function computeSlotFromClientX(clientX) {
    const centers = dragSnapshot.cardCenters;
    let slot = 0;
    for (let i = 0; i < centers.length; i++) {
        if (clientX > centers[i]) {
            slot = i + 1;
        }
    }
    return slot;
}

function updateTimelineSpaceAnimation(slotIndex) {
    const track = document.getElementById('timeline-track');
    const indicator = document.getElementById('timeline-drop-indicator');
    if (!track) return;

    const cards = track.querySelectorAll('.tl-card');
    cards.forEach((card, idx) => {
        if (slotIndex === null || slotIndex === undefined) {
            card.classList.remove('shift-left', 'shift-right');
        } else if (idx < slotIndex) {
            card.classList.add('shift-left');
            card.classList.remove('shift-right');
        } else {
            card.classList.add('shift-right');
            card.classList.remove('shift-left');
        }
    });

    if (indicator) {
        if (slotIndex !== null && slotIndex !== undefined && dragSnapshot.slotPositions[slotIndex] !== undefined) {
            indicator.style.left = `${dragSnapshot.slotPositions[slotIndex]}px`;
            indicator.classList.add('visible');
        } else {
            indicator.classList.remove('visible');
        }
    }
}

function clearTimelineDragState() {
    dragSnapshot.active = false;
    dragSnapshot.hoveredSlot = null;

    const mysteryCard = document.getElementById('timeline-mystery-card');
    if (mysteryCard) mysteryCard.classList.remove('dragging');

    const wrapper = document.getElementById('timeline-board-wrapper');
    if (wrapper) wrapper.classList.remove('drag-active');

    updateTimelineSpaceAnimation(null);
}

// ==========================================
// 6. AUSWERTUNG BEIM ABLEGEN DER KARTE
// ==========================================

function handleTimelineCardDrop(slotIndex) {
    if (!timelineState.active || timelineState.phase !== 'guessing' || !timelineState.currentSong) return;

    const song = timelineState.currentSong;
    const cards = timelineState.timelineCards;
    const songYear = parseInt(song.year);

    // Nachbarn links und rechts prüfen
    // Bei gleichem Erscheinungsjahr (z.B. 1985 neben 1985) zählen BEIDE Seiten als richtig (<= bzw. >=)
    const leftCard = slotIndex > 0 ? cards[slotIndex - 1] : null;
    const rightCard = slotIndex < cards.length ? cards[slotIndex] : null;

    const tooOldForSpot = leftCard && (songYear < parseInt(leftCard.song.year));
    const tooYoungForSpot = rightCard && (songYear > parseInt(rightCard.song.year));

    const isCorrect = !tooOldForSpot && !tooYoungForSpot;

    if (isCorrect) {
        onCorrectTimelinePlacement(slotIndex);
    } else {
        onWrongTimelinePlacement(slotIndex, tooOldForSpot, tooYoungForSpot);
    }
}

function onCorrectTimelinePlacement(slotIndex) {
    const song = timelineState.currentSong;

    // Alte Hervorhebung löschen & neuen Song an der gewählten Stelle einfügen
    timelineState.timelineCards.forEach(c => c.isNewlyPlaced = false);
    timelineState.timelineCards.splice(slotIndex, 0, {
        song: song,
        addedOrder: ++timelineState.nextOrderCounter,
        isNewlyPlaced: true
    });

    timelineState.totalPlaced++;

    // Im Endlos-Modus: Maximal die letzten 10 Songs auf dem Zeitstrahl behalten (FIFO nach Eintragszeitpunkt!)
    if (timelineState.mode === 'endless') {
        if (timelineState.timelineCards.length > 10) {
            let oldestOrder = Infinity;
            let oldestIndex = -1;
            timelineState.timelineCards.forEach((c, idx) => {
                if (c.addedOrder < oldestOrder) {
                    oldestOrder = c.addedOrder;
                    oldestIndex = idx;
                }
            });
            if (oldestIndex !== -1) {
                timelineState.timelineCards.splice(oldestIndex, 1);
            }
        }

        // Serie erhöhen, wenn im ersten Versuch dieser Runde richtig eingeordnet
        if (timelineState.mistakesThisRound === 0) {
            timelineState.currentStreak++;
            if (timelineState.currentStreak > timelineState.bestStreak) {
                timelineState.bestStreak = timelineState.currentStreak;
            }
        }
    }

    updateTimelineHeaderStats();
    renderTimelineBoard();

    // Feedback-Banner ausblenden
    document.getElementById('tl-feedback-banner').classList.add('hidden');
    document.getElementById('tl-mystery-stage').classList.add('hidden');

    // Prüfen, ob im Challenge-Modus alle 10 Runden geschafft wurden
    if (timelineState.mode === 'challenge' && timelineState.round >= 10) {
        timelineState.phase = 'gameover';
        showChallengeVictory(song);
        return;
    }

    // Normale Runden-Erfolgsmeldung + "Nächster Song" Button
    timelineState.phase = 'round_won';
    const successBox = document.getElementById('tl-round-success-box');
    const successText = document.getElementById('tl-round-success-text');
    if (successText) {
        successText.innerHTML = `✅ Richtig eingeordnet! <strong>${escapeHtml(song.artist)} – ${escapeHtml(formatCardTitle(song.title))}</strong> (${song.year})`;
    }
    if (successBox) {
        successBox.classList.remove('hidden');
    }
}

function onWrongTimelinePlacement(slotIndex, isOlderThanLeft, isYoungerThanRight) {
    const song = timelineState.currentSong;

    if (timelineState.mode === 'challenge') {
        // Im Challenge-Modus: 1 Fehler = Verloren!
        timelineState.phase = 'gameover';
        document.getElementById('tl-mystery-stage').classList.add('hidden');
        document.getElementById('tl-feedback-banner').classList.add('hidden');
        showChallengeLost(song);
        return;
    }

    // Im Endlos-Modus: Nicht verloren! Serie auf 0, Karte bleibt verdeckt, Pfeil-Tipp anzeigen
    timelineState.mistakesThisRound++;
    timelineState.currentStreak = 0;
    updateTimelineHeaderStats();

    const banner = document.getElementById('tl-feedback-banner');
    if (!banner) return;

    banner.classList.remove('hidden', 'hint-older', 'hint-younger');

    if (isOlderThanLeft) {
        // Song hat ein kleineres Erscheinungsjahr als die Karte links neben dem gewählten Slot -> muss weiter nach links (älter)
        banner.classList.add('hint-older');
        banner.innerHTML = `
            <span class="tl-hint-arrow">⬅️</span>
            <span>Falsch! Der gesuchte Song ist <strong>älter (früher erschienen)</strong> – ziehe ihn weiter nach links!</span>
        `;
    } else {
        // Song hat ein größeres Erscheinungsjahr als die Karte rechts neben dem gewählten Slot -> muss weiter nach rechts (jünger)
        banner.classList.add('hint-younger');
        banner.innerHTML = `
            <span>Falsch! Der gesuchte Song ist <strong>jünger (später erschienen)</strong> – ziehe ihn weiter nach rechts!</span>
            <span class="tl-hint-arrow">➡️</span>
        `;
    }
}

// ==========================================
// 7. CHALLENGE GEWONNEN / VERLOREN & ENDLOS-AUSWERTUNG
// ==========================================

function showChallengeVictory(lastSong) {
    const box = document.getElementById('tl-gameover-box');
    const title = document.getElementById('tl-gameover-title');
    const details = document.getElementById('tl-gameover-details');
    const restartBtn = document.getElementById('tl-restart-btn');

    if (title) {
        title.style.color = '#69f0ae';
        title.innerText = '🎉 Challenge geschafft! (10 / 10)';
    }
    if (details) {
        details.innerHTML = `
            <p style="font-size: 1.08em; color: #ddd; margin: 6px 0 12px 0;">
                Stark! Du hast alle <strong>10 Songs</strong> fehlerfrei an der richtigen Stelle in deinen Zeitstrahl eingeordnet!
            </p>
            <div class="tl-lost-song-preview">
                <img src="${lastSong.coverUrl || ''}" alt="Cover">
                <div>
                    <div style="font-weight:bold; color:#fff;">Letzter Song: ${escapeHtml(formatCardTitle(lastSong.title))}</div>
                    <div style="color:#bbb; font-size:0.9em;">${escapeHtml(lastSong.artist)}</div>
                    <div style="color:#69f0ae; font-weight:bold; margin-top:3px;">Erscheinungsjahr: ${lastSong.year}</div>
                </div>
            </div>
        `;
    }
    if (restartBtn) restartBtn.innerText = '🔄 Neue Challenge starten';
    if (box) box.classList.remove('hidden');
}

function showChallengeLost(failedSong) {
    const box = document.getElementById('tl-gameover-box');
    const title = document.getElementById('tl-gameover-title');
    const details = document.getElementById('tl-gameover-details');
    const restartBtn = document.getElementById('tl-restart-btn');

    if (title) {
        title.style.color = '#ff5252';
        title.innerText = '💥 Challenge verloren!';
    }
    if (details) {
        details.innerHTML = `
            <p style="font-size: 1.05em; color: #ddd; margin: 6px 0 12px 0;">
                Du hast in <strong>Runde ${timelineState.round} von 10</strong> leider daneben gelegen (${timelineState.totalPlaced} zuvor richtig eingeordnet).
            </p>
            <div class="tl-lost-song-preview">
                <img src="${failedSong.coverUrl || ''}" alt="Cover">
                <div>
                    <div style="font-weight:bold; color:#fff;">${escapeHtml(formatCardTitle(failedSong.title))}</div>
                    <div style="color:#bbb; font-size:0.9em;">${escapeHtml(failedSong.artist)}</div>
                    <div style="color:#ffb74d; font-weight:bold; font-size:1.1em; margin-top:4px;">Erscheinungsjahr: ${failedSong.year}</div>
                </div>
            </div>
        `;
    }
    if (restartBtn) restartBtn.innerText = '🔄 Neue Runde starten';
    if (box) box.classList.remove('hidden');
}

function finishEndlessTimeline() {
    if (!timelineState.active || timelineState.mode !== 'endless') return;

    if (timelineState.playTimer) clearTimeout(timelineState.playTimer);
    if (typeof stoppeSpotify === 'function') stoppeSpotify(true);

    timelineState.phase = 'gameover';

    document.getElementById('tl-mystery-stage').classList.add('hidden');
    document.getElementById('tl-feedback-banner').classList.add('hidden');
    document.getElementById('tl-round-success-box').classList.add('hidden');

    const box = document.getElementById('tl-gameover-box');
    const title = document.getElementById('tl-gameover-title');
    const details = document.getElementById('tl-gameover-details');
    const restartBtn = document.getElementById('tl-restart-btn');

    if (title) {
        title.style.color = '#4dd0e1';
        title.innerText = '🏁 Endlos-Modus beendet';
    }
    if (details) {
        details.innerHTML = `
            <div style="display:flex; justify-content:center; gap:18px; flex-wrap:wrap; margin: 14px 0;">
                <div style="background:#262626; border:2px solid #ff9800; border-radius:10px; padding:14px 22px; min-width:170px;">
                    <div style="font-size:0.85em; color:#bbb; text-transform:uppercase;">🏆 Längste Serie</div>
                    <div style="font-size:2.1em; font-weight:900; color:#ffb74d; margin-top:4px;">${timelineState.bestStreak}</div>
                    <div style="font-size:0.8em; color:#aaa;">Songs in Folge richtig</div>
                </div>
                <div style="background:#262626; border:1px solid #444; border-radius:10px; padding:14px 22px; min-width:150px;">
                    <div style="font-size:0.85em; color:#bbb; text-transform:uppercase;">📀 Eingeordnet</div>
                    <div style="font-size:2.1em; font-weight:900; color:#fff; margin-top:4px;">${timelineState.totalPlaced}</div>
                    <div style="font-size:0.8em; color:#aaa;">Songs insgesamt</div>
                </div>
            </div>
        `;
    }
    if (restartBtn) restartBtn.innerText = '🔄 Neue Endlos-Runde starten';
    if (box) box.classList.remove('hidden');
}

// ==========================================
// 8. EVENT-LISTENER INITIALISIERUNG
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const mysteryCard = document.getElementById('timeline-mystery-card');
    const boardWrapper = document.getElementById('timeline-board-wrapper');

    if (mysteryCard && boardWrapper) {
        // --- HTML5 Drag & Drop Events ---
        mysteryCard.addEventListener('dragstart', (e) => {
            if (!timelineState.active || timelineState.phase !== 'guessing') {
                e.preventDefault();
                return;
            }
            mysteryCard.classList.add('dragging');
            boardWrapper.classList.add('drag-active');

            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'timeline-mystery-card');
            }

            // Geometrie vor der ersten Verschiebung aufzeichnen
            captureTimelineDragSnapshot();
        });

        mysteryCard.addEventListener('dragend', () => {
            clearTimelineDragState();
        });

        boardWrapper.addEventListener('dragover', (e) => {
            if (!dragSnapshot.active || timelineState.phase !== 'guessing') return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

            const slot = computeSlotFromClientX(e.clientX);
            if (slot !== dragSnapshot.hoveredSlot) {
                dragSnapshot.hoveredSlot = slot;
                updateTimelineSpaceAnimation(slot);
            }
        });

        boardWrapper.addEventListener('dragleave', (e) => {
            if (!dragSnapshot.active) return;
            // Nur zurücksetzen, wenn der Mauszeiger den Wrapper wirklich verlassen hat (nicht beim Wechsel auf ein Kind-Element)
            const rect = boardWrapper.getBoundingClientRect();
            if (
                e.clientX <= rect.left ||
                e.clientX >= rect.right ||
                e.clientY <= rect.top ||
                e.clientY >= rect.bottom
            ) {
                dragSnapshot.hoveredSlot = null;
                updateTimelineSpaceAnimation(null);
            }
        });

        boardWrapper.addEventListener('drop', (e) => {
            if (!dragSnapshot.active || timelineState.phase !== 'guessing') return;
            e.preventDefault();

            const chosenSlot = dragSnapshot.hoveredSlot !== null
                ? dragSnapshot.hoveredSlot
                : computeSlotFromClientX(e.clientX);

            clearTimelineDragState();
            handleTimelineCardDrop(chosenSlot);
        });
    }

    // Fenstergrößenänderung -> Dynamische Skalierung des Zeitstrahls nachführen
    window.addEventListener('resize', () => {
        if (timelineState.active) {
            applyDynamicTimelineScale();
        }
    });

    // Live-Toggle für Admin-Modus während einer laufenden Timeline-Runde
    const adminToggle = document.getElementById('admin-mode-toggle');
    if (adminToggle) {
        adminToggle.addEventListener('change', () => {
            const adminHintEl = document.getElementById('tl-admin-hint');
            if (!adminHintEl) return;
            if (adminToggle.checked && timelineState.active && timelineState.currentSong) {
                const s = timelineState.currentSong;
                adminHintEl.innerText = `Admin: ${s.artist} - ${s.title} (${s.year})`;
                adminHintEl.classList.remove('hidden');
            } else {
                adminHintEl.classList.add('hidden');
            }
        });
    }
});

// Enter-Taste für "Nächster Song" im Timeline-Modus
document.addEventListener('keydown', (e) => {
    const tlScreen = document.getElementById('timeline-game-screen');
    if (!tlScreen || tlScreen.classList.contains('hidden')) return;

    if (e.key === 'Enter' && !e.shiftKey) {
        if (timelineState.phase === 'round_won') {
            e.preventDefault();
            nextTimelineRound();
        }
    }
});
