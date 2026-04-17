import urllib.request
import urllib.parse
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
    """Fragt gezielt bei iTunes nach dem Genre für genau diesen einen Song."""
    try:
        # Suchanfrage für iTunes bauen
        query = urllib.parse.quote(f"{artist} {title}")
        url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
        
        # iTunes mag Anfragen ohne User-Agent nicht, deshalb tarnen wir uns kurz als Browser
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            if data['resultCount'] > 0:
                # Wir geben das exakte Genre von iTunes zurück!
                return data['results'][0].get('primaryGenreName', 'Pop')
    except Exception:
        pass
        
    return "Pop" # Fallback, falls iTunes komplett abstürzt oder den Song nicht kennt

def build_database():
    token = get_spotify_token()
    if not token:
        return

    print("🧹 Lese list1.txt...")
    try:
        with open('list1.txt', 'r', encoding='utf-8') as f:
            song_lines = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print("❌ list1.txt nicht gefunden!")
        return

    songs_db = []
    not_found = []

    print(f"🚀 Starte Spotify/iTunes-Suche für {len(song_lines)} Songs...\n")
    
    for index, line in enumerate(song_lines):
        if '-' not in line:
            continue
            
        parts = line.split('-', 1)
        title_query = parts[0].strip()
        artist_query = parts[1].strip()
        
        print(f"[{index + 1}/{len(song_lines)}] Suche: {artist_query} - {title_query}...")
        
        # 1. AUDIO & COVER VON SPOTIFY HOLEN
        query = urllib.parse.quote(f"track:{title_query} artist:{artist_query}")
        url = f"https://api.spotify.com/v1/search?q={query}&type=track&limit=1"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                tracks = data.get('tracks', {}).get('items', [])
                
                if tracks:
                    track = tracks[0]
                    
                    # 2. GENRE VON ITUNES HOLEN
                    echtes_genre = get_itunes_genre(artist_query, title_query)
                    
                    # 3. Jahr sicher extrahieren
                    release_date = track['album']['release_date']
                    year = int(release_date[:4]) if release_date else 2000

                    # 4. Das perfekte JSON Objekt bauen
                    new_song = {
                        "title": track['name'],
                        "artist": track['artists'][0]['name'],
                        "spotifyUri": track['uri'], 
                        "coverUrl": track['album']['images'][0]['url'],
                        "year": year,
                        "album": track['album']['name'],
                        "genre": echtes_genre  # <-- Hier landet jetzt das saubere iTunes-Genre!
                    }
                    songs_db.append(new_song)
                    print(f"   ✅ Gefunden! (Genre: {echtes_genre})")
                else:
                    print("   ❌ Nicht auf Spotify gefunden.")
                    not_found.append(line)
        except Exception as e:
            print(f"   ❌ API Fehler: {e}")
            
        # Kurze Pause, damit uns weder Spotify noch iTunes blockieren
        time.sleep(0.2)

    print("\n💾 Speichere neue songs.json...")
    with open('songs.json', 'w', encoding='utf-8') as file:
        json.dump(songs_db, file, indent=4, ensure_ascii=False)
        
    print(f"\n🎉 Fertig. {len(songs_db)} Songs erfolgreich mit Spotify-Audio und iTunes-Genres generiert!")

if __name__ == "__main__":
    build_database()