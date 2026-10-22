# gts
Das hier ist ein kleines "Errate den Song" Spiel. Zum Spielen wird ein Spotify Premium Account benötigt.
Die Auswahl der Songs befindet sich in der songs.json Datei und kann dort auch beliebig erweitert oder angepasst werden.
spotify_scraper.py erweitert die json Datei mit einer entsprechenden txt Datei im Format "Titel - Interpret" automatisch. Dazu wird die Spotify API benötigt.
Jeder Song verfügt über einen Popularity-Score. Dieser hilft die Schwierigkeit des Spiels festzulegen. Songs mit niedrigem Score sind schwieriger zu erraten. Standardmäßig ist dieser auf "0" gesetzt und kann mit "spotify_score_updater.py" aktualisiert werden. Dazu werden die Youtube API, Genius API und LastFM API benötigt. Alternativ kann der Popularity-Score manuell in der songs.json Datei eingetragen werden (0-100).
Das Spiel bietet Möglichkeiten nach dem Popularity-Score sowie Genre, Jahrzehnt oder einem Jahrintervall zu filtern. Außerdem kann ein Zeitlimit pro Song oder der Startpunkt des Songsnippets vor Beginn der Runde festgelegt werden. Es gibt auch einen Admin-Modus der zu Debugzwecken dient und die Lösung im Spiel direkt anzeigt.
Im Spiel gibt es auch Tipp-Funktionen. Darunter klassische Tipps für die ersten Buchstaben bei Titel oder Interpret und KI-Tipps zum Titel, Interpret oder Allgemein. Dazu wird die Google AI Studios API benötigt.

---

## 🎵 Neue Songs hinzufügen (Workflow)

Wenn du neue Lieder ins Spiel bringen willst, ist der Ablauf wie folgt:

1. **Songs in `list.txt` eintragen**:
   Neue Songs zeilenweise eintragen im Format:
   ```text
   Interpret - Titel
   Queen - Bohemian Rhapsody
   Michael Jackson - Billie Jean
   ```

2. **Haupt-Scraper starten**:
   ```powershell
   python add_songs_scraper.py
   ```
   - Sucht die Songs auf **Spotify** (Cover, Album, Jahr, URI).
   - Holt das Genre über **iTunes**.
   - Sammelt Rohdaten: **YouTube** Views, **Genius** Hits und **Last.fm** Hörer.
   - Fügt alles in `song_list.json` ein.
   - **Automatischer Score**: Am Ende ruft das Skript automatisch `calculate_popularity_score_v2.py` auf und berechnet den Popularity-Score für alle Songs neu!

3. **Lyrics nachziehen (für den Lyrics-Modus)**:
   ```powershell
   python add_lyrics_scraper.py
   ```
   - Holt für alle neuen Songs die Lyrics von Genius und speichert sie in der JSON.
   - *Optional:* Falls ein Songtext automatisiert nicht gefunden wird, kann mit `python manual_lyrics_adder.py` gezielt nachgebessert werden.

---

## 📊 Der Popularity-Score & `calculate_popularity_score_v2.py`

Jeder Song verfügt über einen Popularity-Score (1–100), der die Schwierigkeit im Spiel festlegt (niedrig = schwerer).

- **Wie wird er berechnet?**
  Er basiert auf den logarithmischen Rohwerten von:
  - **Last.fm** (Standard: 65% Gewichtung)
  - **YouTube** (Standard: 25% Gewichtung)
  - **Genius** (Standard: 10% Gewichtung)
  Die Werte werden normalisiert (Z-Score über den Gesamtdurchschnitt aller Songs), gewichtet und per quadratischer Min-Max-Skalierung auf 1–100 abgebildet.
- **Wichtig**: Der Score ist ein relativer Wert über **alle Songs der Datenbank gleichzeitig**. Wenn das Skript läuft, wird nicht nur ein einzelner Song berechnet, sondern die gesamte `song_list.json` bekommt konsistente Scores.
- **Gewichtungen anpassen**:
  Die Gewichtungen sind beim Aufruf definiert (z. B. in `add_songs_scraper.py` Zeile 432: `calc_score(MAIN_JSON_FILE, 0.25, 0.1, 0.65)`).
  Möchte man ohne neue Songs einfach alle Scores in der Datenbank neu mit anderen Prozenten durchrechnen, genügen diese 2 Zeilen in Python (oder der Aufruf von `Add_songs/score_updater.py`):
  ```python
  from calculate_popularity_score_v2 import calc_score
  calc_score('song_list.json', 0.25, 0.1, 0.65)
  ```
  Da alle Rohdaten (`stats_youtube`, `stats_genius`, `stats_lastfm`) bereits in der JSON liegen, dauert das Durchrechnen aller Songs nur einen Sekundenbruchteil.

---

## 🛠️ Weitere Hilfsskripte

- `fix_missing_stats.py`: Sucht für Songs aus `songs_fehlend.json` gezielt nach fehlenden YouTube/Genius/Last.fm Stats.
- `yt_stats_manuel_fixer.py`: Interaktive CLI zur Überprüfung und manuellen Auswahl von YouTube-Musikvideos bei unplausiblen Viewzahlen.
- `mismatches.json`: Temporäre Logging-Datei früherer Genius-Scraper-Läufe (kann in `Add_songs` aufbewahrt oder gelöscht werden).

---

# English Version
This is a small "Guess the Song" game. A Spotify Premium account is required to play.
The song selection is stored in the "songs.json" file, which can be expanded or customized as desired.
"spotify_scraper.py" automatically updates the JSON file using a corresponding text file formatted as "Title - Artist"; the Spotify API is required for this.
Each song has a popularity score, which helps determine the game's difficulty level; songs with lower scores are harder to guess. The score defaults to "0" but can be updated using "spotify_score_updater.py", which requires the YouTube, Genius, and Last.fm APIs. Alternatively, the popularity score can be entered manually in the "songs.json" file (on a scale of 0–100).
The game allows for filtering by popularity score, genre, decade, or a specific year range. Additionally, users can set a time limit per song or define the starting point of the song snippet before the round begins. An admin mode is also available for debugging purposes, displaying the answer directly within the game.
The game includes hint features, ranging from classic hints (revealing the first letters of the title or artist) to AI-generated hints regarding the title, artist, or general information. The Google AI Studio API is required for these AI hints.

---

## 🎵 Adding New Songs (Workflow)

To add new songs to the game, follow this workflow:

1. **Add songs to `list.txt`**:
   Add new songs line-by-line using the format:
   ```text
   Artist - Title
   Queen - Bohemian Rhapsody
   Michael Jackson - Billie Jean
   ```

2. **Run the main scraper**:
   ```powershell
   python add_songs_scraper.py
   ```
   - Searches tracks on **Spotify** (Cover, Album, Year, URI).
   - Fetches genres via **iTunes**.
   - Collects raw statistics: **YouTube** views, **Genius** hits, and **Last.fm** listeners.
   - Appends all data to `song_list.json`.
   - **Automatic Score Calculation**: At the end, the script automatically executes `calculate_popularity_score_v2.py` and recalculates the popularity score for all songs!

3. **Fetch Lyrics (for Lyrics Mode)**:
   ```powershell
   python add_lyrics_scraper.py
   ```
   - Fetches lyrics from Genius for all newly added songs and saves them into the JSON.
   - *Optional:* If a song text is not automatically found, you can manually add it using `python manual_lyrics_adder.py`.

---

## 📊 The Popularity Score & `calculate_popularity_score_v2.py`

Each song has a popularity score (1–100) determining the in-game difficulty (lower = harder).

- **How is it calculated?**
  It is based on the logarithmic raw counts from:
  - **Last.fm** (default: 65% weight)
  - **YouTube** (default: 25% weight)
  - **Genius** (default: 10% weight)
  Values are normalized (Z-score based on the mean and standard deviation across all songs), weighted, and scaled using quadratic min-max mapping to a range of 1–100.
- **Important**: The score is a relative metric evaluated across **all songs in the database simultaneously**. When the script runs, it updates the entire `song_list.json` to ensure consistent scores.
- **Adjusting Weights**:
  Weights are defined when calling the function (e.g. in `add_songs_scraper.py` line 432: `calc_score(MAIN_JSON_FILE, 0.25, 0.1, 0.65)`).
  To recalculate all scores across the database with new weight percentages without scraping new tracks, run these 2 lines in Python (or execute `Add_songs/score_updater.py`):
  ```python
  from calculate_popularity_score_v2 import calc_score
  calc_score('song_list.json', 0.25, 0.1, 0.65)
  ```
  Since all raw metrics (`stats_youtube`, `stats_genius`, `stats_lastfm`) are already stored in the JSON, recalculating the entire database takes only a fraction of a second.

---

## 🛠️ Additional Helper Scripts

- `fix_missing_stats.py`: Specifically queries missing YouTube/Genius/Last.fm stats for entries in `songs_fehlend.json`.
- `yt_stats_manuel_fixer.py`: Interactive CLI to review and manually select music videos on YouTube in case of mismatched view counts.
- `mismatches.json`: Temporary logging output from previous Genius scraper runs (can be kept in `Add_songs` or deleted).