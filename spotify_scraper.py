import urllib.request
import urllib.parse
import urllib.error  # <-- NEU: Damit wir die Fehlercodes (wie 429) und Header genau auslesen können
import json
import base64
import time
import config_secrets

# --- DEINE SPOTIFY DATEN ---
CLIENT_ID = config_secrets.SPOTIFY_CLIENT_ID
CLIENT_SECRET = config_secrets.SPOTIFY_CLIENT_SECRET

def get_spotify_token():
    print("🔐 Hole Spotify Token...")
    url = "https://accounts.spotify.com/api/token"
    auth_string = f"{CLIENT_ID}:{CLIENT_SECRET}"
    auth_base64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
    
    headers = {
        "Authorization": f"Basic {auth_base64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = "grant_type=client_credentials".encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())['access_token']
    except Exception as e:
        print(f"❌ Fehler beim Token-Abruf: {e}")
        return None

def get_itunes_genre(artist, title):
    try:
        query = urllib.parse.quote(f"{artist} {title}")
        url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            if data['resultCount'] > 0:
                return data['results'][0].get('primaryGenreName', 'Pop')
    except Exception:
        pass
    return "Pop"

def build_database():
    token = get_spotify_token()
    if not token:
        return

    # --- 1. Bestehende Songs laden ---
    try:
        with open('songs.json', 'r', encoding='utf-8') as f:
            songs_db = json.load(f)
        print(f"📂 Bestehende Datenbank geladen ({len(songs_db)} Songs).")
    except (FileNotFoundError, json.JSONDecodeError):
        songs_db = []
        print("🆕 Keine Datenbank gefunden. Erstelle eine neue.")

    vorhandene_uris = set()
    for song in songs_db:
        if 'spotifyUri' in song and song['spotifyUri']:
            vorhandene_uris.add(song['spotifyUri'])

    # --- 2. Neue Liste einlesen ---
    print("🧹 Lese list90s.txt...")
    try:
        with open('listx.txt', 'r', encoding='utf-8') as f:
            song_lines = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print("❌ list90s.txt nicht gefunden!")
        return
    
    if not song_lines:
        print("❌ Keine Songs in der Liste gefunden.")
        return

    not_found = []
    hinzugefuegt = 0

    print(f"🚀 Prüfe {len(song_lines)} Einträge aus der Liste...\n")
    
    # --- 3. Songs abarbeiten ---
    for index, line in enumerate(song_lines):
        if '-' not in line:
            continue
            
        parts = line.split('-', 1)
        title_query = parts[0].strip()
        artist_query = parts[1].strip()
        
        print(f"[{index + 1}/{len(song_lines)}] Suche: {artist_query} - {title_query}...")
        
        query = urllib.parse.quote(f"track:{title_query} artist:{artist_query}")
        url = f"https://api.spotify.com/v1/search?q={query}&type=track&limit=1"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                tracks = data.get('tracks', {}).get('items', [])
                
                if tracks:
                    track = tracks[0]
                    gefunde_uri = track['uri']

                    if gefunde_uri in vorhandene_uris:
                        print(f"   ⏩ Überspringe: Ist als '{track['name']}' schon in der Datenbank!")
                        time.sleep(0.1) 
                        continue

                    echtes_genre = get_itunes_genre(artist_query, title_query)
                    
                    release_date = track['album']['release_date']
                    year = int(release_date[:4]) if release_date else 2000

                    new_song = {
                        "title": track['name'],
                        "artist": track['artists'][0]['name'],
                        "spotifyUri": gefunde_uri, 
                        "coverUrl": track['album']['images'][0]['url'],
                        "year": year,
                        "album": track['album']['name'],
                        "genre": echtes_genre
                    }
                    
                    songs_db.append(new_song)
                    vorhandene_uris.add(gefunde_uri) 
                    hinzugefuegt += 1
                    print(f"   ✅ Hinzugefügt! (Genre: {echtes_genre})")
                else:
                    print("   ❌ Nicht auf Spotify gefunden.")
                    not_found.append(line)
                    
        # --- NEU: Hier fangen wir den 429 Fehler ab und lesen den Header ---
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wartezeit = e.headers.get('Retry-After', 'Unbekannt')
                print(f"   🛑 LIMIT ERREICHT (429)! Spotify fordert eine Pause von: {wartezeit} Sekunden.")
            else:
                print(f"   ❌ API HTTP-Fehler: {e}")
        except Exception as e:
            print(f"   ❌ Allgemeiner Fehler: {e}")
            
        time.sleep(1.2)

    # --- 4. Speichern ---
    if hinzugefuegt > 0:
        print(f"\n💾 Speichere {hinzugefuegt} neue Songs in songs.json...")
        with open('songs.json', 'w', encoding='utf-8') as file:
            json.dump(songs_db, file, indent=4, ensure_ascii=False)
        print(f"🎉 Fertig! Datenbank enthält jetzt insgesamt {len(songs_db)} Songs.")
    else:
        print("\n✅ Keine neuen Songs zum Hinzufügen gefunden.")

if __name__ == "__main__":
    build_database()