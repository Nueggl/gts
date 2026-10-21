// ==========================================
// LYRICS GAME MODE LOGIC
// ==========================================

let lyricsState = {
    active: false,
    song: null,
    sections: [],      // Array aus { tag, lines: [...] }
    flatLines: [],     // Array aus { text, sectionIndex, lineInSection, tag }
    revealedStart: 0,  // Index in flatLines
    revealedEnd: 0,    // Index in flatLines (inklusive)
    showTags: false,
    revealedTitleCount: 0,
    revealedArtistCount: 0,
    solved: false
};

// 1. Lyrics parsen in Blöcke (Sections) und Zeilen
function parseLyrics(rawLyrics) {
    if (!rawLyrics || rawLyrics.trim() === '[Instrumental]') {
        return { sections: [], flatLines: [] };
    }

    const blocks = rawLyrics.trim().split(/\n\s*\n/);
    const sections = [];
    const flatLines = [];

    blocks.forEach((block) => {
        const rawLines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return;

        let tag = null;
        let contentLines = [];

        if (rawLines[0].startsWith('[') && rawLines[0].endsWith(']')) {
            tag = rawLines[0].slice(1, -1).trim();
            contentLines = rawLines.slice(1);
        } else {
            contentLines = rawLines;
        }

        // Metadaten-Tags wie "Produced by ..." oder "Written by ..." rausfiltern
        if (tag && /^(produced by|directed by|written by|\?|.*가사)/i.test(tag)) {
            tag = null;
        }

        if (contentLines.length > 0) {
            const secIdx = sections.length;
            sections.push({
                tag: tag,
                lines: contentLines
            });

            contentLines.forEach((lineText, lineIdx) => {
                flatLines.push({
                    text: lineText,
                    sectionIndex: secIdx,
                    lineInSection: lineIdx,
                    tag: tag
                });
            });
        }
    });

    return { sections, flatLines };
}

// 2. Start-Stelle bestimmen (bevorzugt Chorus, sonst variiert / Song-Mitte)
function chooseInitialLyricsRange(sections, flatLines) {
    if (flatLines.length === 0) {
        return { start: 0, end: 0 };
    }

    // Finde alle Abschnitte, die wie ein Chorus / Refrain klingen
    const chorusSecIndices = [];
    sections.forEach((sec, idx) => {
        if (sec.tag && /^(chorus|refrain|coro)/i.test(sec.tag)) {
            chorusSecIndices.push(idx);
        }
    });

    let targetFlatIndex = -1;

    if (chorusSecIndices.length > 0) {
        // Nimm den ersten oder zweiten Chorus
        const chosenSecIdx = chorusSecIndices[Math.floor(Math.random() * Math.min(2, chorusSecIndices.length))];
        // Finde die erste Zeile dieser Section in flatLines
        targetFlatIndex = flatLines.findIndex(fl => fl.sectionIndex === chosenSecIdx);
    }

    // Fallback falls kein Chorus-Tag existiert: etwa bei 35% - 50% des Songs starten
    if (targetFlatIndex === -1) {
        targetFlatIndex = Math.floor(flatLines.length * 0.35);
    }

    // Leichte Variation: mal 1 Zeile vor dem Chorus beginnen (z.B. letzte Zeile Pre-Chorus)
    // oder 2-4 Zeilen des Chorus einblenden
    const startOffsetVariation = Math.random() < 0.4 ? -1 : 0;
    let start = Math.max(0, targetFlatIndex + startOffsetVariation);
    
    // Initial 2 bis 3 Zeilen zeigen
    const initialLineCount = Math.floor(Math.random() * 2) + 2; // 2 oder 3 Zeilen
    let end = Math.min(flatLines.length - 1, start + initialLineCount - 1);

    return { start, end };
}

// 3. Lyrics-Modus starten (über den neuen Button im Dashboard)
function startLyricsMode() {
    // Falls noch Spotify-Wiedergabe läuft, sofort stoppen
    if (typeof stoppeSpotify === "function") stoppeSpotify();

    if (typeof songs === 'undefined' || songs.length === 0) {
        alert("Songs werden noch geladen. Bitte kurz warten!");
        return;
    }

    // Aktuelle Filter von der Startseite berechnen
    if (typeof calculateFilteredSongs === 'function') {
        const calculated = calculateFilteredSongs();
        if (!calculated) return; // Alert wurde bereits geworfen
        filteredSongs = calculated;
    } else if (typeof filteredSongs === 'undefined' || filteredSongs.length === 0) {
        filteredSongs = [...songs];
    }

    // Nur Songs wählen, die Lyrics haben (Instrumentals ausschließen)
    const playableSongs = filteredSongs.filter(s => s.lyrics && s.lyrics.trim() !== '' && s.lyrics.trim() !== '[Instrumental]');
    if (playableSongs.length === 0) {
        alert("Keine Songs mit Lyrics in der aktuellen Filterauswahl gefunden!");
        return;
    }

    // UI umschalten
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('song-list-screen').classList.add('hidden');
    document.getElementById('lyrics-mode-screen').classList.remove('hidden');

    nextLyricsRound(playableSongs);
}

// 4. Neue Runde im Lyrics-Modus
function nextLyricsRound(pool = null) {
    let songPool = pool;
    if (!songPool) {
        songPool = filteredSongs.filter(s => s.lyrics && s.lyrics.trim() !== '' && s.lyrics.trim() !== '[Instrumental]');
        if (songPool.length === 0) songPool = songs.filter(s => s.lyrics && s.lyrics.trim() !== '' && s.lyrics.trim() !== '[Instrumental]');
    }

    if (songPool.length === 0) {
        alert("Keine passenden Songs mit Lyrics vorhanden!");
        return;
    }

    // Falls Radar-Werte aktiv sind: Jahrzehnt-Gewichtung berücksichtigen
    let song = null;
    if (typeof radarValues !== 'undefined' && Array.isArray(radarValues) && radarValues.length === 7) {
        let pools = [[], [], [], [], [], [], []];
        songPool.forEach(s => {
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
            let randomVal = Math.random() * totalWeight;
            let selectedIdx = 0;
            let cumulativeWeight = 0;
            for (let i = 0; i < activeWeights.length; i++) {
                cumulativeWeight += activeWeights[i];
                if (randomVal <= cumulativeWeight) {
                    selectedIdx = i;
                    break;
                }
            }
            let winningPool = pools[selectedIdx];
            song = winningPool[Math.floor(Math.random() * winningPool.length)];
        }
    }

    // Fallback: Reiner Zufall aus dem Pool
    if (!song) {
        song = songPool[Math.floor(Math.random() * songPool.length)];
    }

    lyricsState.song = song;
    currentSong = song; // Kompatibilität für Hilfsfunktionen wie Buchstabentipp

    const parsed = parseLyrics(song.lyrics);
    lyricsState.sections = parsed.sections;
    lyricsState.flatLines = parsed.flatLines;
    lyricsState.showTags = false;
    lyricsState.revealedTitleCount = 0;
    lyricsState.revealedArtistCount = 0;
    lyricsState.solved = false;

    const range = chooseInitialLyricsRange(parsed.sections, parsed.flatLines);
    lyricsState.revealedStart = range.start;
    lyricsState.revealedEnd = range.end;

    // Reset Inputs & UI
    const titleInput = document.getElementById('lyrics-guess-title');
    const artistInput = document.getElementById('lyrics-guess-artist');
    titleInput.value = "";
    artistInput.value = "";
    titleInput.readOnly = false;
    artistInput.readOnly = false;
    titleInput.style.backgroundColor = "";
    artistInput.style.backgroundColor = "";

    document.getElementById('lyrics-tipp-display-interpret').innerText = "";
    document.getElementById('lyrics-tipp-display-titel').innerText = "";
    document.getElementById('lyrics-solution-box').classList.add('hidden');
    document.getElementById('lyrics-next-btn').classList.add('hidden');
    document.getElementById('lyrics-guess-area').classList.remove('hidden');
    document.getElementById('lyrics-status').innerText = "Errate Titel & Interpret anhand der Lyrics!";

    // Button für Tags zurücksetzen
    const tagBtn = document.getElementById('lyrics-btn-toggle-tags');
    if (tagBtn) tagBtn.innerText = "🏷️ Tags anzeigen";

    renderLyricsDisplay();
    updateExpandButtonsState();
}

// 5. Lyrics rendern
function renderLyricsDisplay() {
    const container = document.getElementById('lyrics-display-content');
    if (!container) return;
    container.innerHTML = '';

    const { flatLines, revealedStart, revealedEnd, showTags } = lyricsState;
    if (flatLines.length === 0) {
        container.innerHTML = '<p style="color:#aaa;">Keine Lyrics vorhanden.</p>';
        return;
    }

    let currentSectionIdx = -1;
    let currentBlockDiv = null;

    for (let i = revealedStart; i <= revealedEnd; i++) {
        const item = flatLines[i];

        // Wenn eine neue Section innerhalb des sichtbaren Fensters beginnt (oder bei der ersten Zeile)
        if (item.sectionIndex !== currentSectionIdx) {
            currentSectionIdx = item.sectionIndex;
            currentBlockDiv = document.createElement('div');
            currentBlockDiv.className = 'lyrics-rendered-block';

            // Optional Tag anzeigen
            if (showTags && item.tag) {
                const tagEl = document.createElement('div');
                tagEl.className = 'lyrics-block-tag';
                // Interpret ausblenden, um nicht zu spoilern! (z.B. "[Chorus: Eminem]" -> "[Chorus]")
                const cleanTag = item.tag.split(':')[0].trim();
                tagEl.textContent = `[${cleanTag}]`;
                currentBlockDiv.appendChild(tagEl);
            }

            container.appendChild(currentBlockDiv);
        }

        const lineEl = document.createElement('div');
        lineEl.className = 'lyrics-rendered-line';
        lineEl.textContent = item.text;
        currentBlockDiv.appendChild(lineEl);
    }

    // Scroll zum Container halten
    container.scrollTop = container.scrollHeight / 4;
}

// 6. Buttons zum Erweitern aktualisieren
function updateExpandButtonsState() {
    const btnPrevLine = document.getElementById('lyrics-expand-prev-line');
    const btnNextLine = document.getElementById('lyrics-expand-next-line');
    const btnPrevBlock = document.getElementById('lyrics-expand-prev-block');
    const btnNextBlock = document.getElementById('lyrics-expand-next-block');

    const { flatLines, revealedStart, revealedEnd } = lyricsState;

    if (btnPrevLine) btnPrevLine.disabled = (revealedStart <= 0);
    if (btnNextLine) btnNextLine.disabled = (revealedEnd >= flatLines.length - 1);
    if (btnPrevBlock) btnPrevBlock.disabled = (revealedStart <= 0);
    if (btnNextBlock) btnNextBlock.disabled = (revealedEnd >= flatLines.length - 1);

    // Zähleranzeige
    const counterEl = document.getElementById('lyrics-lines-counter');
    if (counterEl) {
        const shown = (revealedEnd - revealedStart + 1);
        counterEl.innerText = `${shown} von ${flatLines.length} Zeilen sichtbar`;
    }
}

// 7. Erweitern: Zeile davor
function expandLyricsPrevLine() {
    if (lyricsState.revealedStart > 0) {
        lyricsState.revealedStart--;
        renderLyricsDisplay();
        updateExpandButtonsState();
    }
}

// 8. Erweitern: Zeile danach
function expandLyricsNextLine() {
    if (lyricsState.revealedEnd < lyricsState.flatLines.length - 1) {
        lyricsState.revealedEnd++;
        renderLyricsDisplay();
        updateExpandButtonsState();
    }
}

// 9. Erweitern: Block davor
function expandLyricsPrevBlock() {
    if (lyricsState.revealedStart <= 0) return;
    const currentSecIdx = lyricsState.flatLines[lyricsState.revealedStart].sectionIndex;
    
    // Finde das erste Vorkommen der vorherigen Section
    let targetIdx = lyricsState.revealedStart - 1;
    const prevSecIdx = lyricsState.flatLines[targetIdx].sectionIndex;
    while (targetIdx > 0 && lyricsState.flatLines[targetIdx - 1].sectionIndex === prevSecIdx) {
        targetIdx--;
    }
    lyricsState.revealedStart = Math.max(0, targetIdx);
    renderLyricsDisplay();
    updateExpandButtonsState();
}

// 10. Erweitern: Block danach
function expandLyricsNextBlock() {
    if (lyricsState.revealedEnd >= lyricsState.flatLines.length - 1) return;
    
    let targetIdx = lyricsState.revealedEnd + 1;
    const nextSecIdx = lyricsState.flatLines[targetIdx].sectionIndex;
    while (targetIdx < lyricsState.flatLines.length - 1 && lyricsState.flatLines[targetIdx + 1].sectionIndex === nextSecIdx) {
        targetIdx++;
    }
    lyricsState.revealedEnd = Math.min(lyricsState.flatLines.length - 1, targetIdx);
    renderLyricsDisplay();
    updateExpandButtonsState();
}

// 11. Tags ein/ausblenden
function toggleLyricsTags() {
    lyricsState.showTags = !lyricsState.showTags;
    const tagBtn = document.getElementById('lyrics-btn-toggle-tags');
    if (tagBtn) {
        tagBtn.innerText = lyricsState.showTags ? "🏷️ Tags verbergen" : "🏷️ Tags anzeigen";
    }
    renderLyricsDisplay();
}

// 12. Buchstaben-Tipp für Lyrics-Modus
function zeigeLyricsBuchstabe(typ) {
    if (!lyricsState.song) return;

    let targetString = "";
    let currentCount = 0;
    let displayElementId = "";
    let prefix = "";

    if (typ === 'titel') {
        lyricsState.revealedTitleCount++;
        targetString = cleanTitleString(lyricsState.song.title);
        currentCount = lyricsState.revealedTitleCount;
        displayElementId = "lyrics-tipp-display-titel";
        prefix = "Titel: ";
    } else {
        lyricsState.revealedArtistCount++;
        targetString = lyricsState.song.artist.trim();
        currentCount = lyricsState.revealedArtistCount;
        displayElementId = "lyrics-tipp-display-interpret";
        prefix = "Interpret: ";
    }

    if (currentCount > targetString.length) currentCount = targetString.length;

    let masked = "";
    for (let i = 0; i < targetString.length; i++) {
        const char = targetString[i];
        if (char === ' ' || char === '-' || char === '&' || char === '.' || i < currentCount) {
            masked += char;
        } else {
            masked += '_';
        }
    }

    const displayString = masked.split('').map(char => char === ' ' ? ' \u00A0 ' : char).join(' ');
    document.getElementById(displayElementId).innerText = prefix + displayString;
}

// 13. Antwort prüfen im Lyrics-Modus
function checkLyricsAnswer() {
    if (!lyricsState.song || lyricsState.solved) return;

    const guessTitleRaw = document.getElementById('lyrics-guess-title').value;
    const guessArtistRaw = document.getElementById('lyrics-guess-artist').value;

    const cleanGuessTitle = cleanTitleString(guessTitleRaw);
    const cleanActualTitle = cleanTitleString(lyricsState.song.title);

    const titleCorrect = levenshtein(cleanGuessTitle.toLowerCase(), cleanActualTitle.toLowerCase()) <= 2;
    const artistCorrect = checkArtistMatch(guessArtistRaw, lyricsState.song.artist);

    if (titleCorrect) {
        document.getElementById('lyrics-guess-title').style.backgroundColor = "#28a745";
        document.getElementById('lyrics-guess-title').readOnly = true;
    }
    if (artistCorrect) {
        document.getElementById('lyrics-guess-artist').style.backgroundColor = "#28a745";
        document.getElementById('lyrics-guess-artist').readOnly = true;
    }

    if (titleCorrect && artistCorrect) {
        revealLyrics(false);
    }
}

// 14. Auflösen im Lyrics-Modus
function revealLyrics(manual = true) {
    if (!lyricsState.song) return;
    lyricsState.solved = true;

    const song = lyricsState.song;
    const solutionBox = document.getElementById('lyrics-solution-box');
    const coverEl = document.getElementById('lyrics-cover-art');
    const infoEl = document.getElementById('lyrics-solution-info');
    const statusEl = document.getElementById('lyrics-status');

    coverEl.src = song.coverUrl || '';
    if (song.spotifyUri) {
        const spotifyUrl = song.spotifyUri.replace('spotify:track:', 'https://open.spotify.com/track/');
        coverEl.onclick = () => window.open(spotifyUrl, '_blank');
        coverEl.style.cursor = 'pointer';
        coverEl.title = "Klicke hier, um den Song auf Spotify zu öffnen";
    } else {
        coverEl.onclick = null;
        coverEl.style.cursor = 'default';
        coverEl.title = "";
    }

    infoEl.innerHTML = `<strong>${song.artist}</strong><br><em>${song.title}</em><br><span style="font-size:0.9em; color:#bbb;">(${song.year} &bull; ${song.album || ''})</span>`;
    
    if (manual) {
        statusEl.innerText = `Aufgelöst: ${song.artist} - ${song.title}`;
    } else {
        statusEl.innerText = `🎉 Richtig erraten! ${song.artist} - ${song.title}`;
    }

    solutionBox.classList.remove('hidden');
    document.getElementById('lyrics-next-btn').classList.remove('hidden');
    document.getElementById('lyrics-guess-area').classList.add('hidden');
}

// 15. Zurück ins Hauptmenü
function leaveLyricsMode() {
    if (typeof stoppeSpotify === "function") stoppeSpotify();
    document.getElementById('lyrics-mode-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

// 16. Tastatur-Events (Enter & Shift+Enter) im Lyrics-Modus
document.addEventListener('DOMContentLoaded', () => {
    const titleInput = document.getElementById('lyrics-guess-title');
    const artistInput = document.getElementById('lyrics-guess-artist');

    if (titleInput) {
        titleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkLyricsAnswer();
            }
        });
    }

    if (artistInput) {
        artistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkLyricsAnswer();
            }
        });
    }
});

// Globale Tastenkombinationen für Lyrics-Modus
document.addEventListener('keydown', (e) => {
    const lyricsScreen = document.getElementById('lyrics-mode-screen');
    if (!lyricsScreen || lyricsScreen.classList.contains('hidden')) return;

    // Shift + Enter -> Auflösen
    if (e.key === 'Enter' && e.shiftKey) {
        const guessArea = document.getElementById('lyrics-guess-area');
        if (guessArea && !guessArea.classList.contains('hidden')) {
            e.preventDefault();
            revealLyrics(true);
        }
    }
    // Enter (wenn gelöst) -> Nächste Runde
    else if (e.key === 'Enter' && !e.shiftKey) {
        const nextBtn = document.getElementById('lyrics-next-btn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) {
            e.preventDefault();
            nextLyricsRound();
        }
    }
});

