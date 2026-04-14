import json
import random
import urllib.request
import urllib.parse
import time
import re
from youtubesearchpython import VideosSearch


def get_youtube_id_scraper(artist, title):
    try:
        # Suchbegriff für URLs formatieren (Leerzeichen zu %20 etc.)
        search_query = urllib.parse.quote(f"{artist} {title} lyrics")
        url = f"https://www.youtube.com/results?search_query={search_query}"
        
        # Wir tun so, als wären wir ein normaler Chrome-Browser
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        
        # HTML der Suchseite herunterladen
        with urllib.request.urlopen(req) as response:
            html = response.read().decode()
            
            # Im HTML nach dem Muster "videoId":"..." suchen
            video_ids = re.findall(r'"videoId":"(.{11})"', html)
            
            if video_ids:
                # Den ersten Treffer zurückgeben
                return video_ids[0]
                
    except Exception as e:
        print(f"Scraper-Fehler für {title}: {e}")
    return None

# 1. Dateien laden
# 1. Dateien laden (Kugelsichere Version)
import os

all_songs = []
# Prüfen, ob die Datei existiert und nicht komplett leer ist
if os.path.exists("songs_lyrics.json") and os.path.getsize("songs_lyrics.json") > 0:
    try:
        with open("songs_lyrics.json", "r", encoding="utf-8") as f:
            all_songs = json.load(f)
    except json.JSONDecodeError:
        print("Warnung: songs_lyrics.json war beschädigt/leer. Fange mit neuer Liste an.")
        all_songs = []

with open("list1.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

# 2. Hauptschleife
for line in lines:
    parts = line.strip().split(" - ")
    if len(parts) != 2: continue
    
    title_raw, artist_raw = parts[0].strip(), parts[1].strip()
    key = f"{title_raw.lower()} - {artist_raw.lower()}"

    # Überspringen, wenn Song schon in JSON ist UND eine YouTube ID hat
    existing_song = next((s for s in all_songs if f"{s['title'].lower()} - {s['artist'].lower()}" == key), None)
    if existing_song and "youtubeId" in existing_song:
        continue

    print(f"Verarbeite: {title_raw} - {artist_raw}...")

    try:
        # iTunes Teil (für saubere Metadaten, Cover und Jahr)
        query = urllib.parse.quote(f"{title_raw} {artist_raw}")
        url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
        
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            if data['resultCount'] > 0:
                result = data['results'][0]
                
                # YOUTUBE SCRAPER TEIL
                clean_artist = result.get('artistName', artist_raw)
                clean_title = result.get('trackName', title_raw)
                yt_id = get_youtube_id_scraper(clean_artist, clean_title)

                if yt_id:
                    new_entry = {
                        "title": clean_title,
                        "artist": clean_artist,
                        "youtubeId": yt_id,
                        "coverUrl": result.get('artworkUrl100', '').replace('100x100bb', '600x600bb'),
                        "year": int(re.search(r'^(\d{4})', result.get('releaseDate', '')).group(1)) if result.get('releaseDate') else None,
                        "album": result.get('collectionName', ''),
                        "genre": result.get('primaryGenreName', '')
                    }
                    
                    # Alten Eintrag entfernen, falls vorhanden
                    if existing_song:
                        all_songs.remove(existing_song)
                    
                    all_songs.append(new_entry)
                    
                    # SOFORT SPEICHERN
                    with open("songs_lyrics.json", "w", encoding="utf-8") as f:
                        json.dump(all_songs, f, indent=4, ensure_ascii=False)
                    
                    print(f" -> Gespeichert: {yt_id}")
                else:
                    print(" -> Keine YT-ID gefunden.")
            else:
                print(" -> Nicht bei iTunes gefunden.")

    except Exception as e:
        print(f" -> Fehler: {e}")

    # WICHTIG: Kurze Pause, um einen IP-Bann durch YouTube zu vermeiden    
    wartezeit = random.uniform(1.2, 3.5)
    print(f" -> Warte {wartezeit:.2f} Sekunden wie ein echter Mensch...")
    time.sleep(wartezeit)

print("\nFertig! Deine Jukebox ist komplett aufgefüllt, ganz ohne Limits.")