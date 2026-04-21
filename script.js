let songs = [];
let filteredSongs = [];
let currentSong;
let revealedTitleCount = 0;
let revealedArtistCount = 0;
let adminMode = false;
let currentSort = { column: null, direction: 'asc' };


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
        const response = await fetch('songs.json');
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
function setupFilters() {
    const years = songs.map(s => s.year).filter(y => y);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');
    const sliderRange = document.getElementById('slider-range');

    yearMinInput.min = minYear; yearMinInput.max = maxYear; yearMinInput.value = minYear;
    yearMaxInput.min = minYear; yearMaxInput.max = maxYear; yearMaxInput.value = maxYear;

    function updateSlider() {
        let min = parseInt(yearMinInput.value);
        let max = parseInt(yearMaxInput.value);
        if (min > max) { [min, max] = [max, min]; }
        yearMinVal.innerText = min;
        yearMaxVal.innerText = max;
        const range = maxYear - minYear;
        const leftPercent = ((min - minYear) / range) * 100;
        const rightPercent = ((maxYear - max) / range) * 100;
        sliderRange.style.left = leftPercent + '%';
        sliderRange.style.right = rightPercent + '%';
    }

    yearMinInput.addEventListener('input', updateSlider);
    yearMaxInput.addEventListener('input', updateSlider);
    updateSlider();

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

    const minYear = parseInt(document.getElementById('year-min-val').innerText);
    const maxYear = parseInt(document.getElementById('year-max-val').innerText);
    const selectedDecades = Array.from(document.querySelectorAll('#decade-filters input:checked')).map(cb => parseInt(cb.value));
    const selectedGenres = Array.from(document.querySelectorAll('#genre-filters input:checked')).map(cb => cb.value);

    filteredSongs = songs.filter(song => {
        if (!song.year || song.year < minYear || song.year > maxYear) return false;
        if (selectedDecades.length > 0) {
            const songDecade = Math.floor(song.year / 10) * 10;
            if (!selectedDecades.includes(songDecade)) return false;
        }
        if (selectedGenres.length > 0 && !selectedGenres.includes(song.genre)) return false;
        return true;
    });

    if (filteredSongs.length === 0) {
        alert("Keine Songs für diese Filter gefunden!");
        return;
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('game-controls').classList.remove('hidden');
    startGame();
}

function startGame() {
    if (filteredSongs.length === 0) return;
    currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
    
    document.getElementById('curtain').classList.remove('hidden');
    document.getElementById('curtain').innerText = "🔊 Hör gut zu...";
    document.getElementById('cover-art').classList.add('hidden');
    document.getElementById('cover-art').src = currentSong.coverUrl;
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

    const randomStart = Math.floor(Math.random() * 60) + 20;
    if (currentSong.spotifyUri) {
        uiLog(`Spiele: ${currentSong.artist} - ${currentSong.title} (${currentSong.year})`);
        spieleSong(currentSong.spotifyUri, randomStart);
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
    document.getElementById('admin-debug').innerText = `Admin-Info: ${currentSong.artist} - ${currentSong.title}`;
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

loadSongs();