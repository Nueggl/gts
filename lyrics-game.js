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
    solved: false,
    instrumentalPlaying: false,
    instrumentalTimer: null
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

// 2. Start-Stelle bestimmen anhand vielfältiger Presets (Chorus, Übergänge, Strophen, etc.)
function chooseInitialLyricsRange(sections, flatLines) {
    if (!flatLines || flatLines.length === 0) {
        return { start: 0, end: 0 };
    }
    if (flatLines.length <= 4) {
        return { start: 0, end: flatLines.length - 1 };
    }

    // Finde relevante Section-Typen
    const chorusIndices = [];
    const preChorusIndices = [];
    const verseIndices = [];
    const bridgeIndices = [];

    sections.forEach((sec, idx) => {
        if (!sec.tag) return;
        const tagLower = sec.tag.toLowerCase();
        if (/(chorus|refrain|coro|hook)/i.test(tagLower)) {
            chorusIndices.push(idx);
        } else if (/pre-?chorus/i.test(tagLower)) {
            preChorusIndices.push(idx);
        } else if (/verse/i.test(tagLower)) {
            verseIndices.push(idx);
        } else if (/bridge/i.test(tagLower)) {
            bridgeIndices.push(idx);
        }
    });

    const possiblePresets = [];

    // Falls mindestens ein Chorus existiert:
    if (chorusIndices.length > 0) {
        // Nimm den ersten oder zweiten Chorus
        const chosenChorusSec = chorusIndices[Math.floor(Math.random() * Math.min(2, chorusIndices.length))];
        const chorusStart = flatLines.findIndex(fl => fl.sectionIndex === chosenChorusSec);
        const chorusLen = sections[chosenChorusSec].lines.length;
        const chorusEnd = chorusStart + chorusLen - 1;

        // Preset 1: Chorus-Start (Die ersten 2-3 Zeilen des Chorus)
        possiblePresets.push({
            name: "chorus_start",
            weight: 30,
            compute: () => {
                const lineCount = Math.floor(Math.random() * 2) + 2; // 2 oder 3 Zeilen
                return {
                    start: chorusStart,
                    end: Math.min(chorusEnd, chorusStart + lineCount - 1)
                };
            }
        });

        // Preset 2: Chorus-Ende / Hook-Ausklang (Die letzten 2-3 Zeilen des Chorus)
        if (chorusLen >= 4) {
            possiblePresets.push({
                name: "chorus_end",
                weight: 20,
                compute: () => {
                    const lineCount = Math.floor(Math.random() * 2) + 2;
                    return {
                        start: Math.max(chorusStart, chorusEnd - lineCount + 1),
                        end: chorusEnd
                    };
                }
            });
        }

        // Preset 3: Überlappung Pre-Chorus -> Chorus (Letzte 1-2 Zeilen davor + erste 1-2 Zeilen Chorus)
        if (chorusStart >= 2) {
            possiblePresets.push({
                name: "overlap_pre_chorus",
                weight: 20,
                compute: () => {
                    const linesBefore = Math.floor(Math.random() * 2) + 1; // 1-2 Zeilen davor
                    const linesInChorus = Math.floor(Math.random() * 2) + 1; // 1-2 Zeilen im Chorus
                    const s = Math.max(0, chorusStart - linesBefore);
                    const e = Math.min(chorusEnd, chorusStart + linesInChorus - 1);
                    return { start: s, end: e };
                }
            });
        }

        // Preset 4: Überlappung Chorus -> Danach (Letzte 1-2 Zeilen Chorus + 1-2 Zeilen danach)
        if (chorusEnd < flatLines.length - 2) {
            possiblePresets.push({
                name: "overlap_post_chorus",
                weight: 15,
                compute: () => {
                    const linesInChorus = Math.floor(Math.random() * 2) + 1;
                    const linesAfter = Math.floor(Math.random() * 2) + 1;
                    const s = Math.max(chorusStart, chorusEnd - linesInChorus + 1);
                    const e = Math.min(flatLines.length - 1, chorusEnd + linesAfter);
                    return { start: s, end: e };
                }
            });
        }

        // Preset 5: Pre-Chorus (2-3 Zeilen kurz vor dem Refrain)
        if (chorusStart >= 3) {
            possiblePresets.push({
                name: "pre_chorus",
                weight: 10,
                compute: () => {
                    const lineCount = Math.floor(Math.random() * 2) + 2;
                    return {
                        start: Math.max(0, chorusStart - lineCount),
                        end: chorusStart - 1
                    };
                }
            });
        }
    }

    // Preset 6: Strophen-Anfang (Verse 1 oder Verse 2, falls vorhanden)
    if (verseIndices.length > 0) {
        possiblePresets.push({
            name: "verse",
            weight: 15,
            compute: () => {
                const chosenVerseSec = verseIndices[Math.floor(Math.random() * Math.min(2, verseIndices.length))];
                const vStart = flatLines.findIndex(fl => fl.sectionIndex === chosenVerseSec);
                const vLen = sections[chosenVerseSec].lines.length;
                const lineCount = Math.floor(Math.random() * 2) + 2;
                return {
                    start: vStart,
                    end: Math.min(flatLines.length - 1, vStart + Math.min(vLen - 1, lineCount - 1))
                };
            }
        });
    }

    // Preset 7: Bridge (falls vorhanden)
    if (bridgeIndices.length > 0) {
        possiblePresets.push({
            name: "bridge",
            weight: 10,
            compute: () => {
                const chosenBridgeSec = bridgeIndices[0];
                const bStart = flatLines.findIndex(fl => fl.sectionIndex === chosenBridgeSec);
                const bLen = sections[chosenBridgeSec].lines.length;
                const lineCount = Math.floor(Math.random() * 2) + 2;
                return {
                    start: bStart,
                    end: Math.min(flatLines.length - 1, bStart + Math.min(bLen - 1, lineCount - 1))
                };
            }
        });
    }

    // Fallback falls keine passenden Tags/Presets
    if (possiblePresets.length === 0) {
        const midPoint = Math.floor(flatLines.length * (0.3 + Math.random() * 0.3));
        const lineCount = Math.floor(Math.random() * 2) + 2;
        const start = Math.max(0, midPoint);
        const end = Math.min(flatLines.length - 1, start + lineCount - 1);
        return { start, end };
    }

    // Gewichtete Zufallsauswahl eines Presets
    const totalWeight = possiblePresets.reduce((sum, p) => sum + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let chosenPreset = possiblePresets[0];

    for (const p of possiblePresets) {
        rand -= p.weight;
        if (rand <= 0) {
            chosenPreset = p;
            break;
        }
    }

    let range = chosenPreset.compute();

    // Sicherheitsprüfung
    if (!range || typeof range.start !== 'number' || typeof range.end !== 'number' || range.start > range.end) {
        const start = Math.max(0, Math.floor(flatLines.length * 0.35));
        const end = Math.min(flatLines.length - 1, start + 2);
        return { start, end };
    }

    // Mindestens 2 Zeilen sicherstellen (falls Song lang genug)
    if (range.end === range.start && range.end < flatLines.length - 1) {
        range.end++;
    }

    return range;
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
    // Falls noch ein Instrumental läuft, stoppen und UI zurücksetzen
    stoppeLyricsInstrumental();

    // Sanft ausblenden, falls noch Musik von der vorherigen Auflösung läuft
    if (typeof stoppeSpotify === "function") {
        stoppeSpotify(true);
    }

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

// 12b. Instrumental-Tipp per Live-Suche über Spotify
async function starteLyricsInstrumentalTipp() {
    const btn = document.getElementById('lyrics-btn-instrumental');
    const infoEl = document.getElementById('lyrics-instrumental-info');

    // Wenn aktuell ein Instrumental abgespielt wird -> Klick stoppt es wieder!
    if (lyricsState.instrumentalPlaying) {
        stoppeLyricsInstrumental();
        return;
    }

    if (!lyricsState.song) return;

    // Token & Player Check
    const activeToken = token || (typeof getValidToken === 'function' ? getValidToken() : null);
    if (!activeToken || !deviceId || !spotifyPlayer) {
        if (infoEl) infoEl.innerText = "⚠️ Bitte erst mit Spotify verbinden!";
        setTimeout(() => { if (infoEl && infoEl.innerText.includes("verbinden")) infoEl.innerText = ""; }, 3000);
        return;
    }

    btn.disabled = true;
    btn.innerText = "⏳ Suche...";
    if (infoEl) infoEl.innerText = "Suche Instrumental auf Spotify...";

    const cleanTitle = cleanTitleString(lyricsState.song.title);
    const cleanArtist = lyricsState.song.artist.replace(/\s*(?:&|feat\.|ft\.|,\s+).*/i, '').trim();

    // Drei Suchvarianten nacheinander testen
    const queries = [
        `"${cleanTitle}" "${cleanArtist}" instrumental`,
        `"${cleanTitle}" "${cleanArtist}" karaoke`,
        `"${cleanTitle}" instrumental`
    ];

    let foundTrack = null;

    try {
        for (const q of queries) {
            const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`;
            const resp = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${activeToken}`
                }
            });

            if (!resp.ok) continue;

            const data = await resp.json();
            const tracks = data.tracks?.items || [];

            for (const t of tracks) {
                const name = (t.name || '').toLowerCase();
                const artists = (t.artists || []).map(a => a.name.toLowerCase()).join(' ');
                const combined = name + " " + artists;

                // Verifiziere Instrumental-Schlagwörter
                if (combined.includes('instrumental') || combined.includes('karaoke') || combined.includes('backing') || combined.includes('piano') || combined.includes('acoustic') || combined.includes('cover')) {
                    foundTrack = t;
                    break;
                }
            }

            if (foundTrack) break;
        }
    } catch (err) {
        console.error("Fehler bei der Instrumental-Suche:", err);
    }

    if (!foundTrack) {
        btn.disabled = false;
        btn.innerText = "❌ Kein Instrumental";
        if (infoEl) infoEl.innerText = "Leider kein passendes Instrumental auf Spotify gefunden.";
        setTimeout(() => {
            btn.innerText = "🎷 Instrumental-Tipp";
            if (infoEl && infoEl.innerText.includes("gefunden")) infoEl.innerText = "";
        }, 3000);
        return;
    }

    // Gefunden! Abspielen
    lyricsState.instrumentalPlaying = true;
    btn.disabled = false;
    btn.innerText = "⏸️ Instrumental stoppen";
    btn.style.backgroundColor = "#e91e63";
    if (infoEl) {
        infoEl.innerHTML = "🎶 <em>Instrumental läuft...</em>";
    }

    // Startsekunde ca. bei Sekunde 20-30 für direkten Melodie-Einstieg
    const startSec = 25;
    spieleSong(foundTrack.uri, startSec);

    // Automatischer Stop nach 30 Sekunden (falls nicht vorher manuell gestoppt)
    if (lyricsState.instrumentalTimer) clearTimeout(lyricsState.instrumentalTimer);
    lyricsState.instrumentalTimer = setTimeout(() => {
        if (lyricsState.instrumentalPlaying) {
            stoppeLyricsInstrumental();
        }
    }, 30000);
}

function stoppeLyricsInstrumental() {
    lyricsState.instrumentalPlaying = false;
    if (lyricsState.instrumentalTimer) {
        clearTimeout(lyricsState.instrumentalTimer);
        lyricsState.instrumentalTimer = null;
    }

    if (typeof stoppeSpotify === "function") {
        stoppeSpotify(true); // Sanfter Fade-Out
    }

    const btn = document.getElementById('lyrics-btn-instrumental');
    if (btn) {
        btn.disabled = false;
        btn.innerText = "🎷 Instrumental-Tipp";
        btn.style.backgroundColor = "#9c27b0";
    }

    const infoEl = document.getElementById('lyrics-instrumental-info');
    if (infoEl && (infoEl.innerHTML.includes("Instrumental läuft") || infoEl.innerText.includes("Suche"))) {
        infoEl.innerText = "";
    }
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

    // Falls noch ein Instrumental lief, stoppen
    stoppeLyricsInstrumental();

    // Song bei richtiger Antwort oder beim manuellen Auflösen anspielen!
    if (song.spotifyUri && typeof spieleSong === "function") {
        // Zufällige "mittige" Stelle zwischen Sekunde 30 und 75 wählen
        const startSec = Math.floor(Math.random() * 45) + 30;
        console.log(`🎵 Spiele Song bei Auflösung: ${song.title} ab Sekunde ${startSec}`);
        spieleSong(song.spotifyUri, startSec);
    }
}

// 15. Zurück ins Hauptmenü
function leaveLyricsMode() {
    stoppeLyricsInstrumental();
    if (typeof stoppeSpotify === "function") stoppeSpotify(true);
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

