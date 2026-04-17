let songs = [];
let filteredSongs = [];
let currentSong;
let adminMode = false;

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

// Filter UI Initialisierung
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

    // Genres dynamisch aus JSON laden
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

// Start-Funktion mit Filter-Check
function applyFiltersAndStart() {
    // Admin Check
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
        if (selectedGenres.length > 0) {
            if (!selectedGenres.includes(song.genre)) return false;
        }
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

    // UI Reset
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

    const randomStart = Math.floor(Math.random() * 60) + 20;

    if (currentSong.spotifyUri) {
        uiLog(`Spiele: ${currentSong.artist} - ${currentSong.title} (${currentSong.year})`);
        spieleSong(currentSong.spotifyUri, randomStart);
    } else {
        uiLog("Fehler: Keine spotifyUri gefunden!");
    }
}

function checkAnswer() {
    const titleCorrect = levenshtein(document.getElementById('guess-title').value.trim().toLowerCase(), currentSong.title.toLowerCase()) <= 2;
    const artistCorrect = levenshtein(document.getElementById('guess-artist').value.trim().toLowerCase(), currentSong.artist.toLowerCase()) <= 2;

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
    if (typeof stoppeSpotify === "function") stoppeSpotify();
    document.getElementById('curtain').classList.add('hidden');
    document.getElementById('cover-art').classList.remove('hidden');
    if (updateStatus) {
        document.getElementById('status').innerText = `Lösung: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album})`;
    } else {
        document.getElementById('status').innerText = `Richtig gelöst! ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album})`;
    }
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "Nächster Song";
    document.getElementById('guess-area').classList.add('hidden');
}

function goHome() {
    if (typeof stoppeSpotify === "function") stoppeSpotify();
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('player-container').classList.add('hidden');
    document.getElementById('game-controls').classList.add('hidden');
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
    document.getElementById('admin-debug').innerText = `Admin-Info: ${currentSong.artist} - ${currentSong.title} (${currentSong.year}, ${currentSong.album})`;
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

loadSongs();