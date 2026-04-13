import json
import urllib.request
import urllib.parse
import time
import re
import sys
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# --- KONFIGURATION ---
YOUTUBE_API_KEY = "AIzaSyATcXivuyDCt4Us26qGoe36dZgTcX-SfOc"

def get_youtube_id(artist, title):
    try:
        youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        search_query = f"{artist} {title} Official Audio"
        request = youtube.search().list(
            q=search_query,
            part="id",
            maxResults=1,
            type="video"
        )
        response = request.execute()
        if response["items"]:
            return response["items"][0]["id"]["videoId"]
    except HttpError as e:
        if e.resp.status == 403:
            print("!!! API Limit (Quota) erreicht. Speichere und beende...")
            return "QUOTA_LIMIT"
        print(f"YouTube-Fehler für {title}: {e}")
    except Exception as e:
        print(f"Allgemeiner Fehler: {e}")
    return None

# 1. Dateien laden
try:
    with open("songs.json", "r", encoding="utf-8") as f:
        all_songs = json.load(f)
except FileNotFoundError:
    all_songs = []

with open("list.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

# 2. Bestehende Songs in ein Set für schnellen Abgleich
seen_keys = {f"{s['title'].lower()} - {s['artist'].lower()}" for s in all_songs if 'title' in s}

# 3. Hauptschleife
for line in lines:
    parts = line.strip().split(" - ")
    if len(parts) != 2: continue
    
    title_raw, artist_raw = parts[0].strip(), parts[1].strip()
    key = f"{title_raw.lower()} - {artist_raw.lower()}"

    # Wenn der Song schon existiert UND eine youtubeId hat -> Überspringen
    existing_song = next((s for s in all_songs if f"{s['title'].lower()} - {s['artist'].lower()}" == key), None)
    if existing_song and "youtubeId" in existing_song:
        continue

    print(f"Verarbeite: {title_raw} - {artist_raw}...")

    try:
        # iTunes Teil (kostet keine Quota)
        query = urllib.parse.quote(f"{title_raw} {artist_raw}")
        url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
        
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            if data['resultCount'] > 0:
                result = data['results'][0]
                
                # YouTube Teil
                yt_id = get_youtube_id(result.get('artistName', artist_raw), result.get('trackName', title_raw))

                if yt_id == "QUOTA_LIMIT":
                    sys.exit() # Hart beenden, die Datei wurde im letzten Durchlauf gespeichert

                if yt_id:
                    new_entry = {
                        "title": result.get('trackName', title_raw),
                        "artist": result.get('artistName', artist_raw),
                        "youtubeId": yt_id,
                        "coverUrl": result.get('artworkUrl100', '').replace('100x100bb', '600x600bb'),
                        "year": int(re.search(r'^(\d{4})', result.get('releaseDate', '')).group(1)) if result.get('releaseDate') else None,
                        "album": result.get('collectionName', ''),
                        "genre": result.get('primaryGenreName', '')
                    }
                    
                    # Falls der Song schon in der Liste war (aber ohne YT-ID), ersetzen wir ihn
                    if existing_song:
                        all_songs.remove(existing_song)
                    
                    all_songs.append(new_entry)
                    
                    # SOFORT SPEICHERN
                    with open("songs.json", "w", encoding="utf-8") as f:
                        json.dump(all_songs, f, indent=4, ensure_all_ascii=False)
                    
                    print(f" -> Gespeichert: {yt_id}")
                else:
                    print(" -> Keine YT-ID gefunden.")
            else:
                print(" -> Nicht bei iTunes gefunden.")

    except Exception as e:
        print(f" -> Fehler: {e}")

    time.sleep(0.5)

print("\nFertig!")