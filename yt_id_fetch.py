import json
import time
from googleapiclient.discovery import build

# DEIN API KEY HIER EINTRAGEN
API_KEY = "AIzaSyATcXivuyDCt4Us26qGoe36dZgTcX-SfOc"

def get_youtube_id(artist, title):
    youtube = build("youtube", "v3", developerKey=API_KEY)
    
    # Wir suchen nach Interpret + Titel + "Official Audio" für beste Qualität
    search_query = f"{artist} {title} Official Audio"
    
    try:
        request = youtube.search().list(
            q=search_query,
            part="id",
            maxResults=1,
            type="video"
        )
        response = request.execute()

        if response["items"]:
            video_id = response["items"][0]["id"]["videoId"]
            return video_id
    except Exception as e:
        print(f"Fehler bei der Suche nach {title}: {e}")
    
    return None

# 1. songs.json laden
with open("songs.json", "r", encoding="utf-8") as f:
    songs = json.load(f)

# 2. Songs durchgehen und IDs ergänzen
for song in songs:
    if "youtubeId" not in song or not song["youtubeId"]:
        print(f"Suche YouTube ID für: {song['artist']} - {song['title']}...")
        yid = get_youtube_id(song['artist'], song['title'])
        if yid:
            song["youtubeId"] = yid
            print(f"Gefunden: {yid}")
        
        # Kleiner Sleep, um das API-Kontingent zu schonen
        time.sleep(0.5)

# 3. Aktualisierte Liste speichern
with open("songs.json", "w", encoding="utf-8") as f:
    json.dump(songs, f, indent=4, ensure_all_ascii=False)

print("Fertig! Alle YouTube IDs wurden aktualisiert.")