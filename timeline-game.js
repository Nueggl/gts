// ==========================================
// TIMELINE GAME MODE (Hitster-Style)
// Unterstützt: Standard, Profi & Experte
// ==========================================

let timelineState = {
    active: false,
    mode: 'challenge',          // 'challenge' (10 Runden) | 'endless' (Endlos, max 10 Karten)
    difficulty: 'standard',     // 'standard' | 'profi' | 'experte'
    pool: [],                   // Gefilterte Songs mit gültigem Erscheinungsjahr
    usedKeys: new Set(),        // Verhindert doppelte Songs in einer Sitzung
    timelineCards: [],          // Array aus { song, addedOrder, isNewlyPlaced, pendingDetails }
    nextOrderCounter: 0,        // Zählt hoch für FIFO-Entfernung im Endlos-Modus
    currentSong: null,          // Aktuell zu erratender Song
    currentStartSec: 0,         // Startsekunde des aktuellen Songs
    isPaused: false,
    round: 1,                   // Aktuelle Runde (Challenge: 1..10, Endlos: 1..n)
    totalPlaced: 0,             // Anzahl erfolgreich abgeschlossener Runden/Songs
    currentStreak: 0,           // Aktuelle fehlerfreie Serie (Endlos-Modus)
    bestStreak: 0,              // Längste Serie in dieser Sitzung (Endlos-Modus)
    mistakesThisRound: 0,       // Fehlversuche beim aktuellen Song
    phase: 'idle',              // 'guessing' | 'round_won' | 'gameover'
    playTimer: null,

    // Teilaufgaben-Status für die aktuelle Runde (Profi & Experte)
    placedSolved: false,
    titleSolved: false,
    artistSolved: false,
    yearSolved: false,
    placedCardRef: null,

    // Tipps-Status (Endlos-Modus)
    revealedTitleCount: 0,
    revealedArtistCount: 0,
    rangeHintActive: false,
    rangeHintSlot: null
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

// Hilfsfunktion: Sauberer Songtitel für kompakte Kartenanzeige
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
        isNewlyPlaced: false,
        pendingDetails: false
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

    const diff = timelineState.difficulty;

    // Teilaufgaben für diese Runde initialisieren
    timelineState.placedSolved = false;
    timelineState.titleSolved = (diff === 'standard');
    timelineState.artistSolved = (diff === 'standard');
    timelineState.yearSolved = false;
    timelineState.placedCardRef = null;

    // Tipps zurücksetzen
    timelineState.revealedTitleCount = 0;
    timelineState.revealedArtistCount = 0;
    timelineState.rangeHintActive = false;
    timelineState.rangeHintSlot = null;

    // Markierung der zuletzt platzierten Karte nach Rundenwechsel zurücksetzen
    timelineState.timelineCards.forEach(c => {
        c.isNewlyPlaced = false;
        c.pendingDetails = false;
    });

    // Nächsten zu erratenden Song ziehen
    const nextSong = drawWeightedTimelineSong();
    timelineState.currentSong = nextSong;
    currentSong = nextSong; // Globale Referenz für Admin-Kompatibilität

    // UI-Bereiche ein-/ausblenden
    document.getElementById('tl-mystery-stage').classList.remove('hidden');
    document.getElementById('tl-feedback-banner').classList.add('hidden');
    document.getElementById('tl-round-success-box').classList.add('hidden');
    document.getElementById('tl-gameover-box').classList.add('hidden');

    // Eingabefelder & Tipp-Anzeigen für Profi / Experte zurücksetzen
    setupTimelineRoundInputsUI();

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
    updateTimelineProUI();
    renderTimelineBoard();
    playCurrentTimelineSong(true);
}

function setupTimelineRoundInputsUI() {
    const diff = timelineState.difficulty;
    const proPanel = document.getElementById('tl-pro-guess-panel');
    const titleInput = document.getElementById('tl-guess-title');
    const artistInput = document.getElementById('tl-guess-artist');
    const yearInput = document.getElementById('tl-guess-year');
    const endlessHintsRow = document.getElementById('tl-endless-hints-row');
    const rangeHintBtn = document.getElementById('tl-btn-range-hint');

    const tippInterpret = document.getElementById('tl-tipp-display-interpret');
    const tippTitel = document.getElementById('tl-tipp-display-titel');
    const tippBereich = document.getElementById('tl-tipp-display-bereich');

    if (tippInterpret) tippInterpret.innerText = '';
    if (tippTitel) tippTitel.innerText = '';
    if (tippBereich) {
        tippBereich.innerText = '';
        tippBereich.classList.add('hidden');
    }

    [titleInput, artistInput, yearInput].forEach(inp => {
        if (!inp) return;
        inp.value = '';
        inp.readOnly = false;
        inp.classList.remove('input-solved', 'input-wrong');
    });

    if (diff === 'standard') {
        if (proPanel) proPanel.classList.add('hidden');
    } else {
        if (proPanel) proPanel.classList.remove('hidden');

        // Jahres-Input nur im Experten-Modus anzeigen
        if (yearInput) {
            if (diff === 'experte') yearInput.classList.remove('hidden');
            else yearInput.classList.add('hidden');
        }

        // Tipps nur im Endlos-Modus anzeigen
        if (endlessHintsRow) {
            if (timelineState.mode === 'endless') {
                endlessHintsRow.classList.remove('hidden');
                if (rangeHintBtn) {
                    if (diff === 'experte') {
                        rangeHintBtn.classList.remove('hidden');
                        rangeHintBtn.disabled = false;
                    } else {
                        rangeHintBtn.classList.add('hidden');
                    }
                }
            } else {
                endlessHintsRow.classList.add('hidden');
            }
        }
    }
}

function updateTimelineProUI() {
    const diff = timelineState.difficulty;
    const instructions = document.getElementById('tl-mystery-instructions');
    const mysteryCard = document.getElementById('timeline-mystery-card');
    const mysteryLabel = mysteryCard ? mysteryCard.querySelector('.tl-mystery-label') : null;
    const mysteryHint = mysteryCard ? mysteryCard.querySelector('.tl-mystery-drag-hint') : null;
    const checklist = document.getElementById('tl-tasks-checklist');

    if (!mysteryCard) return;

    // 1. Mystery Card Status & Instructions je nach Schwierigkeitsgrad
    mysteryCard.classList.remove('placed-waiting', 'expert-no-drag');

    if (diff === 'standard') {
        mysteryCard.setAttribute('draggable', 'true');
        if (instructions) instructions.innerText = 'Ziehe die Karte an die passende Stelle im Zeitstrahl!';
        if (mysteryLabel) mysteryLabel.innerText = 'Welches Erscheinungsjahr?';
        if (mysteryHint) mysteryHint.innerHTML = '✋ Drag &amp; Drop';
        return;
    }

    if (diff === 'profi') {
        if (instructions) {
            instructions.innerText = 'Profi-Modus: Ordne die Karte im Zeitstrahl ein UND errate Titel & Interpret!';
        }
        if (timelineState.placedSolved) {
            mysteryCard.setAttribute('draggable', 'false');
            mysteryCard.classList.add('placed-waiting');
            if (mysteryLabel) mysteryLabel.innerText = `Jahr: ${timelineState.currentSong?.year || ''}`;
            if (mysteryHint) mysteryHint.innerHTML = '✅ Im Zeitstrahl!';
        } else {
            mysteryCard.setAttribute('draggable', 'true');
            if (mysteryLabel) mysteryLabel.innerText = 'Welches Erscheinungsjahr?';
            if (mysteryHint) mysteryHint.innerHTML = '✋ Drag &amp; Drop';
        }

        if (checklist) {
            checklist.innerHTML = `
                <span class="tl-task-chip ${timelineState.placedSolved ? 'done' : ''}">
                    ${timelineState.placedSolved ? '✅' : '⬜'} Zeitstrahl
                </span>
                <span class="tl-task-chip ${timelineState.titleSolved ? 'done' : ''}">
                    ${timelineState.titleSolved ? '✅' : '⬜'} Titel
                </span>
                <span class="tl-task-chip ${timelineState.artistSolved ? 'done' : ''}">
                    ${timelineState.artistSolved ? '✅' : '⬜'} Interpret
                </span>
            `;
        }
    } else if (diff === 'experte') {
        mysteryCard.setAttribute('draggable', 'false');
        mysteryCard.classList.add('expert-no-drag');
        if (instructions) {
            instructions.innerText = 'Experten-Modus: Errate Titel, Interpret UND das exakte Erscheinungsjahr!';
        }
        if (timelineState.yearSolved) {
            if (mysteryLabel) mysteryLabel.innerText = `Jahr: ${timelineState.currentSong?.year || ''}`;
            if (mysteryHint) mysteryHint.innerHTML = '✅ Jahr gelöst!';
        } else {
            if (mysteryLabel) mysteryLabel.innerText = 'Exaktes Jahr gesucht';
            if (mysteryHint) mysteryHint.innerHTML = '⌨️ Rechts eingeben';
        }

        if (checklist) {
            checklist.innerHTML = `
                <span class="tl-task-chip ${timelineState.titleSolved ? 'done' : ''}">
                    ${timelineState.titleSolved ? '✅' : '⬜'} Titel
                </span>
                <span class="tl-task-chip ${timelineState.artistSolved ? 'done' : ''}">
                    ${timelineState.artistSolved ? '✅' : '⬜'} Interpret
                </span>
                <span class="tl-task-chip ${timelineState.yearSolved ? 'done' : ''}">
                    ${timelineState.yearSolved ? '✅' : '⬜'} Exaktes Jahr
                </span>
            `;
        }
    }
}

function isCurrentTimelineRoundComplete() {
    if (timelineState.difficulty === 'standard') {
        return timelineState.placedSolved;
    } else if (timelineState.difficulty === 'profi') {
        return timelineState.placedSolved && timelineState.titleSolved && timelineState.artistSolved;
    } else if (timelineState.difficulty === 'experte') {
        return timelineState.yearSolved && timelineState.titleSolved && timelineState.artistSolved;
    }
    return timelineState.placedSolved;
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
            <span class="tl-stat-pill">✅ Gelöst: ${timelineState.totalPlaced} / 10</span>
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
        cardWidth = 104;
        cardGap = 8;
        baseFont = 10.5;
        shiftDist = 44;
    }

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
        const isPending = Boolean(item.pendingDetails);
        const card = document.createElement('div');
        card.className = 'tl-card'
            + (item.isNewlyPlaced ? ' newly-placed' : '')
            + (isPending ? ' pending-details' : '');
        card.dataset.index = index;

        if (isPending) {
            // Karte liegt schon auf dem Zeitstrahl (z.B. im Profi/Experten-Modus), aber es fehlt noch Titel oder Interpret
            const shownTitle = timelineState.titleSolved ? formatCardTitle(song.title) : '??? (Titel offen)';
            const shownArtist = timelineState.artistSolved ? song.artist : '??? (Interpret offen)';
            card.title = 'Errate noch die fehlenden Angaben (Titel / Interpret), um die Karte komplett aufzudecken!';

            card.innerHTML = `
                <div class="tl-card-cover-wrap">
                    <div class="tl-card-cover-placeholder">?</div>
                </div>
                <div class="tl-card-title" style="${timelineState.titleSolved ? 'color:#69f0ae;' : 'color:#ffb74d;'}">${escapeHtml(shownTitle)}</div>
                <div class="tl-card-artist" style="${timelineState.artistSolved ? 'color:#69f0ae;' : 'color:#aaa;'}">${escapeHtml(shownArtist)}</div>
                <div class="tl-card-year">${song.year}</div>
            `;
        } else {
            const displayTitle = formatCardTitle(song.title);
            const fullTooltip = `${song.artist} – ${song.title} (${song.year})`;
            card.title = fullTooltip;

            if (song.spotifyUri) {
                const spotifyUrl = song.spotifyUri.replace('spotify:track:', 'https://open.spotify.com/track/');
                card.style.cursor = 'pointer';
                card.addEventListener('click', () => {
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
        }

        track.appendChild(card);
    });

    // Drop-Indikator für die animierte Lücke beim Ziehen (oder für den Bereichs-Tipp im Experten-Modus)
    const indicator = document.createElement('div');
    indicator.id = 'timeline-drop-indicator';
    indicator.className = 'tl-drop-indicator';
    indicator.innerHTML = `<span>⬇ Hier<br>ablegen</span>`;
    track.appendChild(indicator);

    // Falls im Experten-Endlos-Modus der Bereichs-Tipp aktiv ist und das Jahr noch nicht gelöst wurde -> Lücke offen halten!
    if (timelineState.rangeHintActive && !timelineState.yearSolved && timelineState.rangeHintSlot !== null) {
        requestAnimationFrame(() => {
            applyRangeHintVisualOnBoard(timelineState.rangeHintSlot);
        });
    }
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
        indicator.classList.remove('range-hint-active');
        indicator.innerHTML = `<span>⬇ Hier<br>ablegen</span>`;
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
// 6. ZEITSTRAHL-EINORDNUNG & RUNDEN-ABSCHLUSS
// ==========================================

function insertCurrentSongIntoTimeline(slotIndex) {
    const song = timelineState.currentSong;
    timelineState.timelineCards.forEach(c => c.isNewlyPlaced = false);

    const allDone = isCurrentTimelineRoundComplete();
    const newCardObj = {
        song: song,
        addedOrder: ++timelineState.nextOrderCounter,
        isNewlyPlaced: allDone,
        pendingDetails: !allDone
    };

    timelineState.timelineCards.splice(slotIndex, 0, newCardObj);
    timelineState.placedCardRef = newCardObj;

    // Im Endlos-Modus: Maximal die letzten 10 Songs auf dem Zeitstrahl behalten (FIFO nach Eintragszeitpunkt!)
    if (timelineState.mode === 'endless' && timelineState.timelineCards.length > 10) {
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
}

function findCorrectSlotForYear(yearVal) {
    const cards = timelineState.timelineCards;
    for (let i = 0; i < cards.length; i++) {
        if (yearVal <= parseInt(cards[i].song.year)) {
            return i;
        }
    }
    return cards.length;
}

function handleTimelineCardDrop(slotIndex) {
    if (!timelineState.active || timelineState.phase !== 'guessing' || !timelineState.currentSong) return;
    if (timelineState.difficulty === 'experte' || timelineState.placedSolved) return;

    const song = timelineState.currentSong;
    const cards = timelineState.timelineCards;
    const songYear = parseInt(song.year);

    // Nachbarn links und rechts prüfen (gleiches Jahr zählt auf beiden Seiten als richtig)
    const leftCard = slotIndex > 0 ? cards[slotIndex - 1] : null;
    const rightCard = slotIndex < cards.length ? cards[slotIndex] : null;

    const tooOldForSpot = leftCard && (songYear < parseInt(leftCard.song.year));
    const tooYoungForSpot = rightCard && (songYear > parseInt(rightCard.song.year));

    const isCorrect = !tooOldForSpot && !tooYoungForSpot;

    if (isCorrect) {
        timelineState.placedSolved = true;
        timelineState.yearSolved = true;
        insertCurrentSongIntoTimeline(slotIndex);

        if (isCurrentTimelineRoundComplete()) {
            completeCurrentTimelineRound();
        } else {
            // Im Profi-Modus: Zeitstrahl stimmt schon, aber Titel und/oder Interpret fehlen noch!
            updateTimelineProUI();
            updateTimelineHeaderStats();
            renderTimelineBoard();
            showTimelineBannerInfo(`✅ Zeitstrahl-Position stimmt (${song.year})! Errate jetzt noch die offenen Felder.`);
        }
    } else {
        onWrongTimelinePlacement(slotIndex, tooOldForSpot, tooYoungForSpot);
    }
}

function completeCurrentTimelineRound() {
    const song = timelineState.currentSong;

    if (timelineState.placedCardRef) {
        timelineState.placedCardRef.pendingDetails = false;
        timelineState.placedCardRef.isNewlyPlaced = true;
    }

    timelineState.totalPlaced++;

    if (timelineState.mode === 'endless') {
        // Serie erhöhen, wenn in dieser Runde kein einziger Fehlversuch passiert ist (Tipps sind erlaubt!)
        if (timelineState.mistakesThisRound === 0) {
            timelineState.currentStreak++;
            if (timelineState.currentStreak > timelineState.bestStreak) {
                timelineState.bestStreak = timelineState.currentStreak;
            }
        }
    }

    updateTimelineHeaderStats();
    renderTimelineBoard();

    // Oberen Ratebereich & Banner ausblenden
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
        successText.innerHTML = `✅ Runde gelöst! <strong>${escapeHtml(song.artist)} – ${escapeHtml(formatCardTitle(song.title))}</strong> (${song.year})`;
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
        showChallengeLost(song, 'Falsche Position auf dem Zeitstrahl');
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
        banner.classList.add('hint-older');
        banner.innerHTML = `
            <span class="tl-hint-arrow">⬅️</span>
            <span>Falsch! Der gesuchte Song ist <strong>älter (früher erschienen)</strong> – ziehe ihn weiter nach links!</span>
        `;
    } else {
        banner.classList.add('hint-younger');
        banner.innerHTML = `
            <span>Falsch! Der gesuchte Song ist <strong>jünger (später erschienen)</strong> – ziehe ihn weiter nach rechts!</span>
            <span class="tl-hint-arrow">➡️</span>
        `;
    }
}

function showTimelineBannerInfo(htmlText, typeClass = '') {
    const banner = document.getElementById('tl-feedback-banner');
    if (!banner) return;
    banner.classList.remove('hidden', 'hint-older', 'hint-younger');
    if (typeClass) banner.classList.add(typeClass);
    banner.innerHTML = `<span>${htmlText}</span>`;
}

// ==========================================
// 7. PROFI & EXPERTE: TEXT- UND JAHRES-EINGABEN PRÜFEN
// ==========================================

function checkTimelineTextGuesses() {
    if (!timelineState.active || timelineState.phase !== 'guessing' || !timelineState.currentSong) return;
    if (timelineState.difficulty === 'standard') return;

    const song = timelineState.currentSong;
    const titleInput = document.getElementById('tl-guess-title');
    const artistInput = document.getElementById('tl-guess-artist');
    const yearInput = document.getElementById('tl-guess-year');

    const rawTitle = titleInput ? titleInput.value.trim() : '';
    const rawArtist = artistInput ? artistInput.value.trim() : '';
    const rawYear = yearInput ? yearInput.value.trim() : '';

    // Nur Felder prüfen, die noch NICHT gelöst sind und in die der User etwas eingetragen hat
    const checkTitle = !timelineState.titleSolved && rawTitle.length > 0;
    const checkArtist = !timelineState.artistSolved && rawArtist.length > 0;
    const checkYear = (timelineState.difficulty === 'experte') && !timelineState.yearSolved && rawYear.length > 0;

    if (!checkTitle && !checkArtist && !checkYear) {
        return;
    }

    let wrongFields = [];
    let wrongYearValue = null;
    let newlySolvedAny = false;

    // 1. Titel prüfen (mit Levenshtein <= 2 Fehlertoleranz wie im Hauptspiel)
    if (checkTitle) {
        const cleanGuess = cleanTitleString(rawTitle).toLowerCase();
        const cleanActual = cleanTitleString(song.title).toLowerCase();
        const isTitleOk = cleanGuess.length > 0 && levenshtein(cleanGuess, cleanActual) <= 2;

        if (isTitleOk) {
            timelineState.titleSolved = true;
            newlySolvedAny = true;
            titleInput.value = formatCardTitle(song.title);
            titleInput.readOnly = true;
            titleInput.classList.remove('input-wrong');
            titleInput.classList.add('input-solved');
        } else {
            wrongFields.push('Titel');
            triggerWrongInputAnimation(titleInput);
        }
    }

    // 2. Interpret prüfen (mit checkArtistMatch / Levenshtein <= 2 & Teil-Künstler-Logik wie im Hauptspiel)
    if (checkArtist) {
        const isArtistOk = checkArtistMatch(rawArtist, song.artist);

        if (isArtistOk) {
            timelineState.artistSolved = true;
            newlySolvedAny = true;
            artistInput.value = song.artist;
            artistInput.readOnly = true;
            artistInput.classList.remove('input-wrong');
            artistInput.classList.add('input-solved');
        } else {
            wrongFields.push('Interpret');
            triggerWrongInputAnimation(artistInput);
        }
    }

    // 3. Exaktes Erscheinungsjahr prüfen (nur im Experten-Modus)
    if (checkYear) {
        const guessedYearInt = parseInt(rawYear, 10);
        const actualYearInt = parseInt(song.year, 10);
        const isYearOk = !isNaN(guessedYearInt) && guessedYearInt === actualYearInt;

        if (isYearOk) {
            timelineState.yearSolved = true;
            timelineState.placedSolved = true;
            timelineState.rangeHintActive = false;
            newlySolvedAny = true;

            yearInput.value = String(song.year);
            yearInput.readOnly = true;
            yearInput.classList.remove('input-wrong');
            yearInput.classList.add('input-solved');

            // Karte automatisch an der richtigen Stelle in den Zeitstrahl einreihen!
            const targetSlot = findCorrectSlotForYear(actualYearInt);
            insertCurrentSongIntoTimeline(targetSlot);
        } else {
            wrongFields.push('Erscheinungsjahr');
            wrongYearValue = guessedYearInt;
            triggerWrongInputAnimation(yearInput);
        }
    }

    // Falls mindestens ein geprüftes Feld FALSCH war:
    if (wrongFields.length > 0) {
        if (timelineState.mode === 'challenge') {
            // Im Challenge-Modus führt 1 falscher Rateversuch zum Verlust!
            timelineState.phase = 'gameover';
            document.getElementById('tl-mystery-stage').classList.add('hidden');
            document.getElementById('tl-feedback-banner').classList.add('hidden');
            showChallengeLost(song, `Falscher Tipp bei: ${wrongFields.join(', ')}`);
            return;
        }

        // Im Endlos-Modus: Serie auf 0 setzen & hilfreiches Feedback (inkl. Pfeil-Tipp bei falschem Jahr) geben
        timelineState.mistakesThisRound++;
        timelineState.currentStreak = 0;
        updateTimelineHeaderStats();

        const banner = document.getElementById('tl-feedback-banner');
        if (banner) {
            banner.classList.remove('hidden', 'hint-older', 'hint-younger');

            if (wrongYearValue !== null && !isNaN(wrongYearValue)) {
                const actualYearInt = parseInt(song.year, 10);
                const otherWrong = wrongFields.filter(f => f !== 'Erscheinungsjahr');
                const extraText = otherWrong.length > 0 ? ` (Außerdem falsch: ${otherWrong.join(', ')})` : '';

                if (actualYearInt < wrongYearValue) {
                    banner.classList.add('hint-older');
                    banner.innerHTML = `
                        <span class="tl-hint-arrow">⬅️</span>
                        <span>Falsch! Der gesuchte Song ist <strong>älter (vor ${wrongYearValue} erschienen)</strong>!${escapeHtml(extraText)}</span>
                    `;
                } else {
                    banner.classList.add('hint-younger');
                    banner.innerHTML = `
                        <span>Falsch! Der gesuchte Song ist <strong>jünger (nach ${wrongYearValue} erschienen)</strong>!${escapeHtml(extraText)}</span>
                        <span class="tl-hint-arrow">➡️</span>
                    `;
                }
            } else {
                banner.classList.add('hint-older');
                banner.innerHTML = `
                    <span>❌ <strong>${escapeHtml(wrongFields.join(' & '))}</strong> leider falsch! Versuche es weiter oder nutze einen Tipp.</span>
                `;
            }
        }

        updateTimelineProUI();
        renderTimelineBoard();
        return;
    }

    // Wenn alles Geprüfte richtig war -> Prüfen, ob damit die komplette Runde gelöst ist!
    if (isCurrentTimelineRoundComplete()) {
        completeCurrentTimelineRound();
    } else if (newlySolvedAny) {
        updateTimelineProUI();
        renderTimelineBoard();
        showTimelineBannerInfo(`✅ Sehr gut! Löse jetzt noch die verbleibenden Aufgaben dieser Runde.`);
    }
}

function triggerWrongInputAnimation(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('input-wrong');
    void inputEl.offsetWidth; // Reflow für Neustart der Shake-Animation
    inputEl.classList.add('input-wrong');
}

// ==========================================
// 8. TIPPS IM ENDLOS-MODUS (BUCHSTABEN & BEREICHS-TIPP)
// ==========================================

function zeigeTimelineBuchstabe(typ) {
    if (!timelineState.active || timelineState.phase !== 'guessing' || !timelineState.currentSong) return;
    if (timelineState.mode !== 'endless') return;

    const song = timelineState.currentSong;
    let targetString = '';
    let currentCount = 0;
    let displayElementId = '';
    let prefix = '';

    if (typ === 'titel') {
        if (timelineState.titleSolved) return;
        timelineState.revealedTitleCount++;
        targetString = cleanTitleString(song.title);
        currentCount = timelineState.revealedTitleCount;
        displayElementId = 'tl-tipp-display-titel';
        prefix = 'Titel: ';
    } else {
        if (timelineState.artistSolved) return;
        timelineState.revealedArtistCount++;
        targetString = song.artist.trim();
        currentCount = timelineState.revealedArtistCount;
        displayElementId = 'tl-tipp-display-interpret';
        prefix = 'Interpret: ';
    }

    if (currentCount > targetString.length) currentCount = targetString.length;

    let masked = '';
    for (let i = 0; i < targetString.length; i++) {
        const char = targetString[i];
        if (char === ' ' || char === '-' || char === '&' || char === '.' || i < currentCount) {
            masked += char;
        } else {
            masked += '_';
        }
    }

    const displayString = masked.split('').map(char => char === ' ' ? ' \u00A0 ' : char).join(' ');
    const el = document.getElementById(displayElementId);
    if (el) el.innerText = prefix + displayString;
}

function zeigeTimelineBereichsTipp() {
    if (!timelineState.active || timelineState.phase !== 'guessing' || !timelineState.currentSong) return;
    if (timelineState.mode !== 'endless' || timelineState.difficulty !== 'experte' || timelineState.yearSolved) return;

    const songYear = parseInt(timelineState.currentSong.year, 10);
    const cards = timelineState.timelineCards;
    const slot = findCorrectSlotForYear(songYear);

    timelineState.rangeHintActive = true;
    timelineState.rangeHintSlot = slot;

    // Zeitraum-Text bestimmen
    const leftCard = slot > 0 ? cards[slot - 1] : null;
    const rightCard = slot < cards.length ? cards[slot] : null;

    let rangeDesc = '';
    if (leftCard && rightCard) {
        rangeDesc = `zwischen ${leftCard.song.year} und ${rightCard.song.year}`;
    } else if (leftCard && !rightCard) {
        rangeDesc = `rechts nach ${leftCard.song.year} (≥ ${leftCard.song.year})`;
    } else if (!leftCard && rightCard) {
        rangeDesc = `links vor ${rightCard.song.year} (≤ ${rightCard.song.year})`;
    } else {
        rangeDesc = `auf dem Zeitstrahl`;
    }

    const rangeEl = document.getElementById('tl-tipp-display-bereich');
    if (rangeEl) {
        rangeEl.innerText = `⏳ Bereichs-Tipp: Der Song gehört ${rangeDesc} (siehe Markierung im Zeitstrahl unten)!`;
        rangeEl.classList.remove('hidden');
    }

    const btn = document.getElementById('tl-btn-range-hint');
    if (btn) btn.disabled = true;

    applyRangeHintVisualOnBoard(slot);
}

function applyRangeHintVisualOnBoard(slotIndex) {
    captureTimelineDragSnapshot();
    const track = document.getElementById('timeline-track');
    const indicator = document.getElementById('timeline-drop-indicator');
    if (!track || !indicator) return;

    const cards = track.querySelectorAll('.tl-card');
    cards.forEach((card, idx) => {
        if (idx < slotIndex) {
            card.classList.add('shift-left');
            card.classList.remove('shift-right');
        } else {
            card.classList.add('shift-right');
            card.classList.remove('shift-left');
        }
    });

    if (dragSnapshot.slotPositions[slotIndex] !== undefined) {
        indicator.style.left = `${dragSnapshot.slotPositions[slotIndex]}px`;
        indicator.innerHTML = `<span>📍 Richtiger<br>Bereich</span>`;
        indicator.classList.add('visible', 'range-hint-active');
    }
    dragSnapshot.active = false;
}

// ==========================================
// 9. CHALLENGE GEWONNEN / VERLOREN & ENDLOS-AUSWERTUNG
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
                Stark! Du hast alle <strong>10 Runden</strong> im Schwierigkeitsgrad <strong>${timelineState.difficulty.toUpperCase()}</strong> fehlerfrei gemeistert!
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

function showChallengeLost(failedSong, reasonText = '') {
    // Falls die Karte schon halb auf dem Zeitstrahl lag, vollständig aufdecken
    if (timelineState.placedCardRef) {
        timelineState.placedCardRef.pendingDetails = false;
        renderTimelineBoard();
    }

    const box = document.getElementById('tl-gameover-box');
    const title = document.getElementById('tl-gameover-title');
    const details = document.getElementById('tl-gameover-details');
    const restartBtn = document.getElementById('tl-restart-btn');

    if (title) {
        title.style.color = '#ff5252';
        title.innerText = '💥 Challenge verloren!';
    }
    if (details) {
        const reasonHtml = reasonText ? `<div style="color:#ff8a80; font-size:0.92em; margin-bottom:8px;">Grund: ${escapeHtml(reasonText)}</div>` : '';
        details.innerHTML = `
            <p style="font-size: 1.05em; color: #ddd; margin: 6px 0 8px 0;">
                Du hast in <strong>Runde ${timelineState.round} von 10</strong> leider daneben gelegen (${timelineState.totalPlaced} zuvor komplett gelöst).
            </p>
            ${reasonHtml}
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
                    <div style="font-size:0.8em; color:#aaa;">Songs in Folge fehlerfrei</div>
                </div>
                <div style="background:#262626; border:1px solid #444; border-radius:10px; padding:14px 22px; min-width:150px;">
                    <div style="font-size:0.85em; color:#bbb; text-transform:uppercase;">📀 Gelöst</div>
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
// 10. EVENT-LISTENER INITIALISIERUNG
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const mysteryCard = document.getElementById('timeline-mystery-card');
    const boardWrapper = document.getElementById('timeline-board-wrapper');

    if (mysteryCard && boardWrapper) {
        // --- HTML5 Drag & Drop Events ---
        mysteryCard.addEventListener('dragstart', (e) => {
            if (
                !timelineState.active ||
                timelineState.phase !== 'guessing' ||
                timelineState.difficulty === 'experte' ||
                timelineState.placedSolved
            ) {
                e.preventDefault();
                return;
            }
            mysteryCard.classList.add('dragging');
            boardWrapper.classList.add('drag-active');

            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'timeline-mystery-card');
            }

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

    // Enter-Taste in den Profi/Experten-Eingabefeldern löst direkt checkTimelineTextGuesses() aus
    ['tl-guess-title', 'tl-guess-artist', 'tl-guess-year'].forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    checkTimelineTextGuesses();
                }
            });
        }
    });

    // Fenstergrößenänderung -> Dynamische Skalierung & ggf. Bereichs-Tipp nachführen
    window.addEventListener('resize', () => {
        if (timelineState.active) {
            applyDynamicTimelineScale();
            if (timelineState.rangeHintActive && !timelineState.yearSolved && timelineState.rangeHintSlot !== null) {
                applyRangeHintVisualOnBoard(timelineState.rangeHintSlot);
            }
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
