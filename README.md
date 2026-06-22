# gts
Das hier ist ein kleines "Errate den Song" Spiel. Zum Spielen wird ein Spotify Premium Account benötigt.
Die Auswahl der Songs befindet sich in der songs.json Datei und kann dort auch beliebig erweitert oder angepasst werden.
spotify_scraper.py erweitert die json Datei mit einer entsprechenden txt Datei im Format "Titel - Interpret" automatisch. Dazu wird die Spotify API benötigt.
Jeder Song verfügt über einen Popularity-Score. Dieser hilft die Schwierigkeit des Spiels festzulegen. Songs mit niedrigem Score sind schwieriger zu erraten. Standardmäßig ist dieser auf "0" gesetzt und kann mit "spotify_score_updater.py" aktualisiert werden. Dazu werden die Youtube API, Genius API und LastFM API benötigt. Alternativ kann der Popularity-Score manuell in der songs.json Datei eingetragen werden (0-100).
Das Spiel bietet Möglichkeiten nach dem Popularity-Score sowie Genre, Jahrzehnt oder einem Jahrintervall zu filtern. Außerdem kann ein Zeitlimit pro Song oder der Startpunkt des Songsnippets vor Beginn der Runde festgelegt werden. Es gibt auch einen Admin-Modus der zu Debugzwecken dient und die Lösung im Spiel direkt anzeigt.
Im Spiel gibt es auch Tipp-Funktionen. Darunter klassische Tipps für die ersten Buchstaben bei Titel oder Interpret und KI-Tipps zum Titel, Interpret oder Allgemein. Dazu wird die Google AI Studios API benötigt.

#English Version
This is a small "Guess the Song" game. A Spotify Premium account is required to play.
The song selection is stored in the "songs.json" file, which can be expanded or customized as desired.
"spotify_scraper.py" automatically updates the JSON file using a corresponding text file formatted as "Title - Artist"; the Spotify API is required for this.
Each song has a popularity score, which helps determine the game's difficulty level; songs with lower scores are harder to guess. The score defaults to "0" but can be updated using "spotify_score_updater.py", which requires the YouTube, Genius, and Last.fm APIs. Alternatively, the popularity score can be entered manually in the "songs.json" file (on a scale of 0–100).
The game allows for filtering by popularity score, genre, decade, or a specific year range. Additionally, users can set a time limit per song or define the starting point of the song snippet before the round begins. An admin mode is also available for debugging purposes, displaying the answer directly within the game.
The game includes hint features, ranging from classic hints (revealing the first letters of the title or artist) to AI-generated hints regarding the title, artist, or general information. The Google AI Studio API is required for these AI hints.