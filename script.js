let songs = [];
let filteredSongs = [];
let currentSong;
let playTimeout;
let revealedTitleCount = 0;
let revealedArtistCount = 0;
let adminMode = false;
let currentSort = { column: null, direction: 'asc' };
const gifListe = ["gif1.gif", "gif2.gif", "gif3.gif", "gif4.gif", "gif5.gif", "gif6.gif", "gif7.gif", "gif8.gif"];


let songliste = "songs_new_score_updated_popularity.json"


function setTokenWithExpiry(token) {
    const now = new Date();
    // 3600000 ms = 60 Minuten
    const item = {
        token: token,
        expiry: now.getTime() + 3600000, 
    };
    localStorage.setItem("spotify_access_token", JSON.stringify(item));
}

function getValidToken() {
    const itemStr = localStorage.getItem("spotify_access_token");
    if (!itemStr) return null;
    
    const item = JSON.parse(itemStr);
    const now = new Date();
    
    if (now.getTime() > item.expiry) {
        localStorage.removeItem("spotify_access_token");
        return null;
    }
    return item.token;
}

// Songs beim Start laden
async function loadSongs() {
    try {
        const response = await fetch(songliste);
        songs = await response.json();
        console.log('Songs geladen:', songs);
        setupFilters();
        const btn = document.getElementById('apply-filters-btn');
        btn.innerText = "Spiel starten";
        btn.disabled = false;
    } catch (error) {
        console.error('Fehler beim Laden:', error);
        document.getElementById('status').innerHTML = "Fehler beim Laden der songs.json.";
    }
}

// --- BIBLIOTHEK LOGIK ---
function showSongList() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('song-list-screen').classList.remove('hidden');
    renderSongTable(songs);
}

function renderSongTable(data) {
    const tbody = document.getElementById('library-body');
    tbody.innerHTML = '';
    data.forEach(song => {
        const tr = document.createElement('tr');
        
        // --- NEU: Spotify Link Logik ---
        if (song.spotifyUri) {
            // Wandelt "spotify:track:12345..." in einen klickbaren Web-Link um
            const spotifyUrl = song.spotifyUri.replace('spotify:track:', 'https://open.spotify.com/track/');
            
            // Macht die gesamte Zeile klickbar (öffnet neuen Tab)
            tr.onclick = () => window.open(spotifyUrl, '_blank');
            
            // Macht den Mauszeiger zur "Hand" und gibt einen kleinen Info-Text
            tr.style.cursor = 'pointer'; 
            tr.title = "Klicke hier, um den Song auf Spotify zu öffnen"; 
        }
        // --- ENDE NEU ---

        tr.innerHTML = `
            <td><img src="${song.coverUrl}" style="width: 40px; border-radius: 3px;"></td>
            <td>${song.title}</td>
            <td>${song.artist}</td>
            <td>${song.album}</td>
            <td>${song.year}</td>
            <td>${song.genre}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterSongList() {
    const query = document.getElementById('song-search').value.toLowerCase();
    const filtered = songs.filter(s => 
        s.title.toLowerCase().includes(query) || 
        s.artist.toLowerCase().includes(query) || 
        s.album.toLowerCase().includes(query) ||
        s.genre.toLowerCase().includes(query)
    );
    renderSongTable(filtered);
}

function sortSongs(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    const sorted = [...songs].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    renderSongTable(sorted);
}

// --- SPIEL LOGIK ---
// --- NEUE VARIABLEN FÜR POPULARITY ---
let activePopFilter = 'absolute'; // Standardmäßig ist der absolute aktiv

function setPopFilterMode(mode) {
    activePopFilter = mode;
    if (mode === 'absolute') {
        document.getElementById('pop-abs-container').classList.remove('dimmed');
        document.getElementById('pop-rel-container').classList.add('dimmed');
    } else {
        document.getElementById('pop-abs-container').classList.add('dimmed');
        document.getElementById('pop-rel-container').classList.remove('dimmed');
    }
}

// Hilfsfunktion: Verwaltet alle Doppel-Slider einheitlich
function initDualSlider(minId, maxId, minValId, maxValId, trackRangeId, globalMin, globalMax, isPercent) {
    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);
    const minVal = document.getElementById(minValId);
    const maxVal = document.getElementById(maxValId);
    const sliderRange = document.getElementById(trackRangeId);

    // Initialwerte setzen
    // IMMER die echten Datenbank-Werte erzwingen!
    minInput.min = globalMin;
    minInput.max = globalMax;
    minInput.value = globalMin;
    
    maxInput.min = globalMin;
    maxInput.max = globalMax;
    maxInput.value = globalMax;

    function update() {
        let min = parseInt(minInput.value);
        let max = parseInt(maxInput.value);
        
        // Verhindern, dass sich die Regler kreuzen
        if (min > max) {
            let tmp = min; min = max; max = tmp;
            minInput.value = min; maxInput.value = max;
        }
        
        minVal.innerText = min + (isPercent ? '%' : '');
        maxVal.innerText = max + (isPercent ? '%' : '');
        
        const range = globalMax - globalMin;
        const leftPercent = ((min - globalMin) / range) * 100;
        const rightPercent = ((globalMax - max) / range) * 100;
        sliderRange.style.left = leftPercent + '%';
        sliderRange.style.right = rightPercent + '%';
    }

    minInput.addEventListener('input', update);
    maxInput.addEventListener('input', update);
    update();
}

function setupFilters() {
    // 1. Jahr-Slider initialisieren
    const years = songs.map(s => s.year).filter(y => y);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    initDualSlider('year-min', 'year-max', 'year-min-val', 'year-max-val', 'slider-range', minYear, maxYear, false);

    // 2. Popularitäts-Slider initialisieren
    initDualSlider('pop-abs-min', 'pop-abs-max', 'pop-abs-min-val', 'pop-abs-max-val', 'slider-range-abs', 1, 100, false);
    initDualSlider('pop-rel-min', 'pop-rel-max', 'pop-rel-min-val', 'pop-rel-max-val', 'slider-range-rel', 0, 100, true);

    // 3. Genres laden
    const genres = [...new Set(songs.map(s => s.genre).filter(g => g))].sort();
    const genreContainer = document.getElementById('genre-filters');
    genreContainer.innerHTML = '';
    genres.forEach(genre => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = genre;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + genre));
        genreContainer.appendChild(label);
    });

    // Initialisiere das Radar
    drawRadar();
}

function applyFiltersAndStart() {
    adminMode = document.getElementById('admin-mode-toggle').checked;
    const adminBtn = document.getElementById('admin-reveal-btn');
    const debugConsole = document.getElementById('ui-debug-console');

    if (adminMode) {
        adminBtn.classList.remove('hidden');
        debugConsole.classList.remove('hidden');
        uiLog("Admin-Modus aktiviert.");
    } else {
        adminBtn.classList.add('hidden');
        debugConsole.classList.add('hidden');
    }

    // --- STUFE 1: Grundfilter (Jahr & Genre) ---
    const minYear = parseInt(document.getElementById('year-min-val').innerText);
    const maxYear = parseInt(document.getElementById('year-max-val').innerText);
    const selectedGenres = Array.from(document.querySelectorAll('#genre-filters input:checked')).map(cb => cb.value);

    let baseFiltered = songs.filter(song => {
        // 1. Check: Master-Slider für Jahre
        if (!song.year || song.year < minYear || song.year > maxYear) return false;

        // 2. Check: Radar-Diagramm / Jahrzehnte (Werte aus radar.js)
        if (typeof radarValues !== 'undefined') {
            let y = song.year;
            let radarIndex = 0;
            if (y < 1970) radarIndex = 0;
            else if (y < 1980) radarIndex = 1;
            else if (y < 1990) radarIndex = 2;
            else if (y < 2000) radarIndex = 3;
            else if (y < 2010) radarIndex = 4;
            else if (y < 2020) radarIndex = 5;
            else radarIndex = 6;

            // Wenn das Jahrzehnt im Radar auf 0 steht (oder die Checkbox aus ist), fliegt der Song raus!
            if (radarValues[radarIndex] === 0) return false;
        }

        // 3. Check: Genre
        if (selectedGenres.length > 0 && !selectedGenres.includes(song.genre)) return false;
        
        return true;
    });

    if (baseFiltered.length === 0) {
        alert("Keine Songs für diese Basis-Filter (Jahre/Genre/Jahrzehnt) gefunden!");
        return;
    }

    // --- STUFE 2: Popularitäts-Filter ---
    const absMin = parseInt(document.getElementById('pop-abs-min').value);
    const absMax = parseInt(document.getElementById('pop-abs-max').value);
    const relMin = parseInt(document.getElementById('pop-rel-min').value);
    const relMax = parseInt(document.getElementById('pop-rel-max').value);

    filteredSongs = baseFiltered.filter(song => {
        // Fallback: Wenn 0 oder undefiniert -> Immer durchwinken!
        if (!song.popularity || song.popularity === 0) return true;

        if (activePopFilter === 'absolute') {
            return song.popularity >= absMin && song.popularity <= absMax;
        } else {
            // Relativer Modus: Wir holen alle GÜLTIGEN Popularitätswerte der aktuellen Auswahl
            let validPops = baseFiltered.map(s => s.popularity).filter(p => p > 0);
            
            // Wenn alle Songs in diesem Genre "0" haben, winken wir sie logischerweise durch
            if (validPops.length === 0) return true; 

            let actualMin = Math.min(...validPops);
            let actualMax = Math.max(...validPops);
            let range = actualMax - actualMin;
            
            // Die Prozentwerte in echte Score-Zahlen umrechnen
            let targetMin = actualMin + (range * (relMin / 100));
            let targetMax = actualMin + (range * (relMax / 100));

            return song.popularity >= targetMin && song.popularity <= targetMax;
        }
    });

    // Fehlermeldung, wenn der Pop-Filter zu streng war
    if (filteredSongs.length === 0) {
        alert("Die Popularitäts-Filter sind zu streng. Für diese Auswahl wurden keine Songs gefunden!");
        return;
    }

    // --- START ---
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('game-controls').classList.remove('hidden');
    startGame();
}

function startGame() {
    if (filteredSongs.length === 0) return;

    // --- NEU: GEWICHTETE ZUFALLSAUSWAHL ---
    // 1. Songs nach Jahrzehnt sortieren
    let pools = [[], [], [], [], [], [], []]; // 7 Arrays für 7 Jahrzehnte
    
    filteredSongs.forEach(song => {
        let y = song.year;
        if (y < 1970) pools[0].push(song);
        else if (y < 1980) pools[1].push(song);
        else if (y < 1990) pools[2].push(song);
        else if (y < 2000) pools[3].push(song);
        else if (y < 2010) pools[4].push(song);
        else if (y < 2020) pools[5].push(song);
        else pools[6].push(song);
    });

    // 2. Nur Gewichte von Jahrzehnten zulassen, die AUCH WIRKLICH SONGS haben!
    let activeWeights = radarValues.map((weight, i) => pools[i].length > 0 ? weight : 0);
    let totalWeight = activeWeights.reduce((a, b) => a + b, 0);

    // Fallback: Wenn durch absurde Filter-Kombinationen das Gewicht 0 ist, puren Zufall nehmen
    if (totalWeight === 0) {
        currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
    } else {
        // 3. Lose ziehen!
        let randomVal = Math.random() * totalWeight;
        let selectedDecadeIndex = 0;
        let cumulativeWeight = 0;
        
        for (let i = 0; i < activeWeights.length; i++) {
            cumulativeWeight += activeWeights[i];
            if (randomVal <= cumulativeWeight) {
                selectedDecadeIndex = i;
                break;
            }
        }
        
        // 4. Einen zufälligen Song aus dem nun gezogenen Jahrzehnt wählen
        let winningPool = pools[selectedDecadeIndex];
        currentSong = winningPool[Math.floor(Math.random() * winningPool.length)];
    }
    // --- ENDE NEU ---

    document.getElementById('curtain').classList.remove('hidden');
    
    const coverArt = document.getElementById('cover-art');
    coverArt.classList.add('hidden');
    coverArt.src = currentSong.coverUrl;
    if (currentSong.spotifyUri) {
        const spotifyUrl = currentSong.spotifyUri.replace('spotify:track:', 'https://open.spotify.com/track/');
        coverArt.onclick = () => window.open(spotifyUrl, '_blank');
        coverArt.style.cursor = 'pointer';
        coverArt.title = "Klicke hier, um den Song auf Spotify zu öffnen";
    } else {
        coverArt.onclick = null;
        coverArt.style.cursor = 'default';
        coverArt.title = "";
    }
    
    const randomGif = gifListe[Math.floor(Math.random() * gifListe.length)];
    document.getElementById('curtain-gif').src = `GIFs/${randomGif}`;
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('guess-area').classList.remove('hidden');
    document.getElementById('status').innerText = "Song läuft...";
    document.getElementById('admin-debug').innerText = "";
    
    document.getElementById('guess-title').value = "";
    document.getElementById('guess-artist').value = "";
    document.getElementById('guess-title').readOnly = false;
    document.getElementById('guess-artist').readOnly = false;
    document.getElementById('guess-title').style.backgroundColor = "";
    document.getElementById('guess-artist').style.backgroundColor = "";
    document.getElementById('tipp-container').style.display = 'none';
    document.getElementById('tipp-container').innerHTML = '';
    revealedTitleCount = 0;
    revealedArtistCount = 0;
    document.getElementById('tipp-display-interpret').innerText = "";
    document.getElementById('tipp-display-titel').innerText = "";
    document.getElementById('tipp-btn-allgemein').innerText = "Allg. Tipp 🤖";
    document.getElementById('tipp-btn-interpret').innerText = "Tipp zum Interpret 👤";
    document.getElementById('tipp-btn-titel').innerText = "Tipp zum Titel 🎵";

    // --- NEUE WIEDERGABE-LOGIK ---
    const mode = document.querySelector('input[name="start-mode"]:checked').value;
    let startSec = 0;

    if (mode === 'random') {
        // Deine bisherige Logik: Startet irgendwo zwischen Sekunde 20 und 80
        startSec = Math.floor(Math.random() * 60) + 20;
    } else if (mode === 'start') {
        // Startet exakt bei 0:00
        startSec = 0;
    }

    if (currentSong.spotifyUri) {
        uiLog(`Spiele: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}) | Start bei: ${startSec}s`);
        spieleSong(currentSong.spotifyUri, startSec);
        
        if (playTimeout) clearTimeout(playTimeout); 
        
        const durationInput = document.getElementById('play-duration').value;
        const playDuration = parseInt(durationInput);
        
        // --- NEU: Timer-Balken Logik ---
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');

        if (!isNaN(playDuration) && playDuration > 0) {
            // Zeige den Balken
            progressContainer.classList.remove('hidden');
            
            // 1. Balken sofort auf volle 100% setzen (ohne Animation)
            progressBar.style.transition = 'none';
            progressBar.style.width = '100%';
            
            // 2. Browser zwingen, die 100% sofort zu zeichnen (Reflow-Trick)
            void progressBar.offsetWidth;
            
            // 3. Animation starten! (Balken schrumpft in exakt 'playDuration' Sekunden linear auf 0%)
            progressBar.style.transition = `width ${playDuration}s linear`;
            progressBar.style.width = '0%';

            // Dein normaler Backend-Timer, der die Musik stoppt
            playTimeout = setTimeout(() => {
                if (typeof stoppeSpotify === "function") stoppeSpotify();
                document.getElementById('status').innerText = "Songausschnitt beendet! Zeit zum Raten.";
            }, playDuration * 1000); 
        } else {
            // Wenn kein Timer eingestellt ist, verstecken wir den Balken
            progressContainer.classList.add('hidden');
        }
    }
}

function cleanTitleString(str) {
    return str
        .replace(/\(.*?\)/g, '')   // Entfernt alles in ( )
        .replace(/\[.*?\]/g, '')   // Entfernt alles in [ ]
        .replace(/\s-.*$/, '')     // Entfernt " - " und alles danach
        .trim()                    // Entfernt Leerzeichen am Rand
        //.toLowerCase();
}

function checkArtistMatch(guessRaw, artistString) {
    const guess = guessRaw.trim().toLowerCase();
    const fullArtistRaw = artistString.trim().toLowerCase();

    // Versuch 1: Passt die Eingabe auf den komplett ungeteilten String? (Distanz <= 2)
    if (levenshtein(guess, fullArtistRaw) <= 2) return true;

    // Versuch 2: Wir teilen den String auf
    // RegEx trennt bei " & ", " feat. ", " ft. " oder Kommas
    const artists = artistString.split(/\s*(?:&|feat\.|ft\.|,\s+)\s+/i);
    
    for (let artist of artists) {
        const cleanArtist = artist.trim().toLowerCase();
        if (cleanArtist.length > 0 && levenshtein(guess, cleanArtist) <= 2) {
            return true; // Treffer bei einem der Teil-Künstler!
        }
    }
    return false;
}

function checkAnswer() {
    const guessTitleRaw = document.getElementById('guess-title').value;
    const guessArtistRaw = document.getElementById('guess-artist').value;

    // Wir waschen sowohl die Eingabe als auch die Lösung
    const cleanGuessTitle = cleanTitleString(guessTitleRaw);
    const cleanActualTitle = cleanTitleString(currentSong.title);

    // Titel vergleichen
    const titleCorrect = levenshtein(cleanGuessTitle.toLowerCase(), cleanActualTitle.toLowerCase()) <= 2;
    // Interpret vergleichen
    const artistCorrect = checkArtistMatch(guessArtistRaw, currentSong.artist);

    if (titleCorrect) { 
        document.getElementById('guess-title').style.backgroundColor = "#28a745"; 
        document.getElementById('guess-title').readOnly = true; 
    }
    if (artistCorrect) { 
        document.getElementById('guess-artist').style.backgroundColor = "#28a745"; 
        document.getElementById('guess-artist').readOnly = true; 
    }
    if (titleCorrect && artistCorrect) { reveal(false); }
}

function reveal(updateStatus = true) {
    if (playTimeout) clearTimeout(playTimeout);
    
    // --- NEU: Balken einfrieren ---
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
        // Liest die exakte aktuelle Breite im Browser aus und friert sie ein
        progressBar.style.width = window.getComputedStyle(progressBar).width;
        progressBar.style.transition = 'none';
    }
    
    document.getElementById('curtain').classList.add('hidden');
    //if (typeof stoppeSpotify === "function") stoppeSpotify();
    document.getElementById('curtain').classList.add('hidden');
    document.getElementById('cover-art').classList.remove('hidden');
    if (updateStatus) document.getElementById('status').innerText = `Lösung: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album})`;
    else document.getElementById('status').innerText = `Richtig gelöst! Es war: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album})`;
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "Nächster Song";
    document.getElementById('guess-area').classList.add('hidden');
}

function goHome() {
    if (playTimeout) clearTimeout(playTimeout);
    if (typeof stoppeSpotify === "function") stoppeSpotify();
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('player-container').classList.add('hidden');
    document.getElementById('game-controls').classList.add('hidden');
    document.getElementById('song-list-screen').classList.add('hidden');
    uiLog("Zurück zum Menü.");
}

function uiLog(message) {
    if (!adminMode) return;
    const logList = document.getElementById('debug-log-list');
    const entry = document.createElement('div');
    entry.style.borderBottom = "1px solid #222";
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logList.prepend(entry);
}

function adminReveal() {
    if (!currentSong) return;
    document.getElementById('admin-debug').innerText = `Admin-Info: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album}, Pop: ${currentSong.popularity})`;
    uiLog("Lösung per Admin-Button angezeigt.");
}

function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

// --- BUCHSTABEN RATE-LOGIK---
function zeigeBuchstabe(typ) {
    if (!currentSong) return;
    
    let targetString = "";
    let currentCount = 0;
    let displayElementId = "";
    let prefix = "";

    if (typ === 'titel') {
        revealedTitleCount++;
        targetString = cleanTitleString(currentSong.title); 
        currentCount = revealedTitleCount;
        displayElementId = "tipp-display-titel";
        prefix = "Titel: ";
    } else {
        revealedArtistCount++;
        targetString = currentSong.artist.trim();
        currentCount = revealedArtistCount;
        displayElementId = "tipp-display-interpret";
        prefix = "Interpret: ";
    }

    if (currentCount > targetString.length) currentCount = targetString.length;

    let masked = "";
    for (let i = 0; i < targetString.length; i++) {
        const char = targetString[i];
        // Leerzeichen, Bindestriche, Punkte & Co IMMER zeigen
        // Alles andere nur, wenn der Zähler es erreicht hat
        if (char === ' ' || char === '-' || char === '&' || char === '.' || i < currentCount) {
            masked += char;
        } else {
            masked += '_';
        }
    }

    // Wir setzen Leerzeichen zwischen die Zeichen für bessere Lesbarkeit
    // Ein echtes Leerzeichen im Wort machen wir zu drei Leerzeichen, 
    // damit man die Wortgrenzen deutlich sieht.
    const displayString = masked.split('').map(char => char === ' ' ? ' \u00A0 ' : char).join(' ');
    
    document.getElementById(displayElementId).innerText = prefix + displayString;
}

// --- EVENT LISTENERS FÜR DIE ENTER-TASTE ---
document.getElementById('guess-title').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        checkAnswer();
    }
});

document.getElementById('guess-artist').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        checkAnswer();
    }
});

// --- ENTER-TASTE FÜR NÄCHSTEN SONG ---
// --- GLOBALE TASTEN-EVENTS (Enter & Shift+Enter) ---
document.addEventListener('keydown', function (e) {
    
    // FALL 1: Shift + Enter wird gedrückt -> AUFLÖSEN
    if (e.key === 'Enter' && e.shiftKey) {
        const guessArea = document.getElementById('guess-area');
        
        // Nur auflösen, wenn die Rate-Area gerade sichtbar ist
        if (guessArea && !guessArea.classList.contains('hidden')) {
            e.preventDefault(); // Verhindert z.B. das Einfügen von Zeilenumbrüchen
            console.log("Auflösen per Tastenkombination!");
            reveal(); // Ruft deine bestehende Auflösen-Funktion auf
        }
    }
    
    // FALL 2: NUR Enter wird gedrückt -> NÄCHSTER SONG
    else if (e.key === 'Enter' && !e.shiftKey) {
        const startBtn = document.getElementById('start-btn');
        const guessArea = document.getElementById('guess-area');
        
        // Wir prüfen: Ist der Button sichtbar UND die Rate-Area versteckt?
        if (startBtn && !startBtn.classList.contains('hidden') && guessArea && guessArea.classList.contains('hidden')) {
            e.preventDefault();
            startGame(); // Nächste Runde starten!
        }
    }
});

loadSongs();