import urllib.request
import urllib.parse
import urllib.error
import json
import time
import base64
import re
import sys
import os
import config_secrets
import config_yt

# Configure standard streams for UTF-8 to prevent UnicodeEncodeError in Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


# --- CONFIGURATION & PATHS ---
MAIN_JSON_FILE = 'songs_new_score_updated_popularity.json'
ERROR_JSON_FILE = 'songs_fehlend.json'
DEFAULT_INPUT_FILE = 'list.txt'

CLIENT_ID = config_secrets.SPOTIFY_CLIENT_ID
CLIENT_SECRET = config_secrets.SPOTIFY_CLIENT_SECRET

def clean_song_title(title):
    # Removes Spotify suffixes like " - Remastered 2011", " - Live", " - Radio Edit", etc.
    clean = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series).*', '', title)
    # Removes trailing parenthesis content
    clean = re.sub(r'\(.*?\)', '', clean)
    # Removes other symbols
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return clean

# --- SPOTIFY TOKEN ---
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

# --- ITUNES GENRE ---
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

# --- YOUTUBE VIEWS ---
def get_youtube_views(artist, title):
    query = urllib.parse.quote(f"{title} {artist} official music video")
    search_url = "https://www.youtube.com/results?search_query=" + query
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': 'CONSENT=YES+cb.20230101-00-p0.de+FX+123'
    }
    
    video_ids = []
    try:
        req_web = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req_web) as response:
            html = response.read().decode('utf-8')
            all_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)
            # Retain order, remove duplicates, take top 5
            video_ids = list(dict.fromkeys(all_ids))[:5]
    except Exception as e:
        print(f"      [YT Search Error] Konnte Ergebnisseite nicht laden: {e}")
        
    if not video_ids:
        return 0
        
    # Get accurate views for all 5 candidates in ONE API request (costing only 1 quota point)
    stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={','.join(video_ids)}&key={config_yt.API_KEY}"
    try:
        req_stats = urllib.request.Request(stats_url)
        with urllib.request.urlopen(req_stats) as response:
            stats_data = json.loads(response.read())
            items = stats_data.get('items', [])
            if items:
                # Find candidate with the maximum views (official music video)
                max_views = 0
                for item in items:
                    views = int(item['statistics'].get('viewCount', 0))
                    if views > max_views:
                        max_views = views
                return max_views
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print("      [YT API-Fehler] 🛑 Tageslimit (Quota) von 10.000 erreicht!")
            raise Exception("QUOTA_EXCEEDED")
        else:
            print(f"      [YT API-Fehler] HTTP {e.code}")
    except Exception as e:
        print(f"      [YT API-Fehler] {e}")
        
    return 0

# --- LAST.FM LISTENERS ---
def get_lastfm_listeners_api(artist, title):
    queries = [
        (artist, title),
        (clean_song_title(artist), clean_song_title(title))
    ]
    api_key = config_secrets.LASTFM_API_KEY
    for a, t in queries:
        a_quoted = urllib.parse.quote(a)
        t_quoted = urllib.parse.quote(t)
        url = f"http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key={api_key}&artist={a_quoted}&track={t_quoted}&format=json"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MusicQuiz/1.0'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                if 'track' in data and 'listeners' in data['track']:
                    listeners = int(data['track']['listeners'])
                    if listeners > 0:
                        return listeners
        except Exception:
            pass
    return 0

def parse_lastfm_html(html):
    blocks = re.findall(r'<li class="header-metadata-tnew-item">.*?</li>', html, re.DOTALL)
    listeners = 0
    for block in blocks:
        lbl_match = re.search(r'<h4 class="header-metadata-tnew-title">\s*(.*?)\s*</h4>', block, re.DOTALL)
        val_match = re.search(r'title="([\d.,]+)"', block)
        if lbl_match and val_match:
            lbl = lbl_match.group(1).lower().strip()
            val_str = val_match.group(1).replace('.', '').replace(',', '')
            val = int(val_str)
            if 'listener' in lbl or 'hörer' in lbl or 'h\u00f6rer' in lbl or 'h&ouml;rer' in lbl:
                listeners = val
    return listeners

def scrape_lastfm_listeners(artist, title):
    artist_quoted = urllib.parse.quote(artist).replace('%20', '+')
    title_quoted = urllib.parse.quote(title).replace('%20', '+')
    urls = [
        f"https://www.last.fm/music/{artist_quoted}/_/{title_quoted}",
        f"https://www.last.fm/de/music/{artist_quoted}/_/{title_quoted}"
    ]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8'
    }
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                html = response.read().decode('utf-8')
                listeners = parse_lastfm_html(html)
                if listeners > 0:
                    return listeners
        except Exception:
            pass
    return 0

def get_lastfm_listeners(artist, title):
    listeners = get_lastfm_listeners_api(artist, title)
    if listeners > 0:
        return listeners
    return scrape_lastfm_listeners(artist, title)

# --- GENIUS VIEWS ---
def get_genius_path_and_views_api(artist, title):
    queries = [
        f"{title} {artist}",
        f"{clean_song_title(title)} {clean_song_title(artist)}"
    ]
    token = config_secrets.GENIUS_ACCESS_TOKEN
    for query in queries:
        url = f"https://api.genius.com/search?q={urllib.parse.quote(query)}"
        try:
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                hits = data.get('response', {}).get('hits', [])
                if hits:
                    result = hits[0].get('result', {})
                    path = result.get('path')
                    stats = result.get('stats', {})
                    api_views = stats.get('pageviews', 0)
                    if path:
                        return path, api_views
        except Exception:
            pass
    return None, 0

def scrape_genius_pageviews(path):
    url = f"https://genius.com{path}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            match = re.search(r"const\s+rawData\s*=\s*JSON\.parse\('(.*?)'\);", html)
            if match:
                json_str = match.group(1)
                json_str = json_str.replace('\\"', '"')
                try:
                    data = json.loads(json_str)
                    views = data.get('pageviews')
                    if views is not None:
                        return int(views)
                except Exception:
                    pass
            match_pv = re.search(r'\\?"pageviews\\?":\s*(\d+)', html)
            if match_pv:
                return int(match_pv.group(1))
    except Exception:
        pass
    return 0

def get_genius_views(artist, title):
    path, api_views = get_genius_path_and_views_api(artist, title)
    if path:
        views = scrape_genius_pageviews(path)
        if views > 0:
            return views
        if api_views > 0:
            return api_views
    return 0

# --- MAIN SCRAPER LOGIC ---
def run_scraper():
    # Detect input file
    input_file = DEFAULT_INPUT_FILE
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        
    print(f"📖 Lese Input-Datei '{input_file}'...")
    if not os.path.exists(input_file):
        print(f"❌ Datei '{input_file}' wurde nicht gefunden!")
        return

    # Load input songs
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            song_lines = [line.strip() for line in f if line.strip()]
    except Exception as e:
        print(f"❌ Fehler beim Lesen der Input-Datei: {e}")
        return

    if not song_lines:
        print("ℹ️ Keine Songs in der Input-Datei gefunden.")
        return

    # Load main database
    try:
        with open(MAIN_JSON_FILE, 'r', encoding='utf-8') as f:
            songs_db = json.load(f)
        print(f"📂 Haupt-Datenbank geladen ({len(songs_db)} Songs).")
    except (FileNotFoundError, json.JSONDecodeError):
        songs_db = []
        print(f"🆕 '{MAIN_JSON_FILE}' nicht gefunden oder beschädigt. Erstelle eine neue.")

    # Track existing URIs in database
    vorhandene_uris = {song['spotifyUri'] for song in songs_db if song.get('spotifyUri')}

    # Load quarantine error database
    try:
        with open(ERROR_JSON_FILE, 'r', encoding='utf-8') as f:
            error_db = json.load(f)
            if not isinstance(error_db, list):
                error_db = []
    except (FileNotFoundError, json.JSONDecodeError):
        error_db = []

    # Get Spotify token
    token = get_spotify_token()
    if not token:
        print("❌ Konnte kein Spotify Token generieren. Abbruch.")
        return

    hinzugefuegt = 0
    not_found_count = 0

    print(f"🚀 Starte Verarbeitung von {len(song_lines)} Songs...\n")

    for index, line in enumerate(song_lines):
        if '-' not in line:
            print(f"⚠️ Überspringe ungültige Zeile [{index + 1}]: '{line}' (Format 'Titel - Interpret' erwartet)")
            continue

        parts = line.split('-', 1)
        title_query = parts[0].strip()
        artist_query = parts[1].strip()

        print(f"\n[{index + 1}/{len(song_lines)}] Suche: {artist_query} - {title_query}...")

        # Search Spotify
        query = urllib.parse.quote(f"track:{title_query} artist:{artist_query}")
        url = f"https://api.spotify.com/v1/search?q={query}&type=track&limit=1"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read())
                tracks = data.get('tracks', {}).get('items', [])

                if not tracks:
                    print("   ❌ Nicht auf Spotify gefunden.")
                    not_found_count += 1
                    continue

                track = tracks[0]
                gefunde_uri = track['uri']
                official_title = track['name']
                official_artist = track['artists'][0]['name']

                # Check for duplicates
                if gefunde_uri in vorhandene_uris:
                    print(f"   ⏩ Überspringe: Ist als '{official_title}' ({gefunde_uri}) bereits in der Datenbank!")
                    continue

                # Get iTunes Genre
                genre = get_itunes_genre(artist_query, title_query)
                print(f"   🏷️ iTunes Genre:    {genre}")

                # Fetch statistics
                clean_title = clean_song_title(official_title)
                clean_artist = clean_song_title(official_artist)

                yt_views = get_youtube_views(clean_artist, clean_title)
                lastfm_listeners = get_lastfm_listeners(clean_artist, clean_title)
                genius_views = get_genius_views(clean_artist, clean_title)

                print(f"   📺 YouTube Views:   {yt_views:,}")
                print(f"   📻 Last.fm Hörer:   {lastfm_listeners:,}")
                print(f"   📖 Genius Aufrufe:  {genius_views:,}")

                # Quarantine Check: If any value is 0, copy to error db and write fallback value of 1 to main db
                has_missing_stats = (yt_views == 0 or lastfm_listeners == 0 or genius_views == 0)
                
                if has_missing_stats:
                    print("   ⚠️ ACHTUNG: Ein Wert ist 0. Song wird in die Fehler-Datei kopiert!")
                    error_entry = {
                        "title": official_title,
                        "artist": official_artist,
                        "spotifyUri": gefunde_uri,
                        "stats_youtube": yt_views,
                        "stats_lastfm": lastfm_listeners,
                        "stats_genius": genius_views
                    }
                    error_db.append(error_entry)

                # Prepare database entry
                # Fallback values of 1 to prevent log(0) domain error crash in calc_score
                new_song = {
                    "title": official_title,
                    "artist": official_artist,
                    "spotifyUri": gefunde_uri,
                    "coverUrl": track['album']['images'][0]['url'] if track['album']['images'] else '',
                    "year": int(track['album']['release_date'][:4]) if track['album']['release_date'] else 2000,
                    "album": track['album']['name'],
                    "genre": genre,
                    "popularity": 0,
                    "stats_youtube": max(1, yt_views),
                    "stats_lastfm": max(1, lastfm_listeners),
                    "stats_genius": max(1, genius_views),
                    "raw_data_collected": True
                }

                songs_db.append(new_song)
                vorhandene_uris.add(gefunde_uri)
                hinzugefuegt += 1
                print(f"   ✅ Erfolgreich hinzugefügt!")

        except urllib.error.HTTPError as e:
            if e.code == 429:
                wartezeit = e.headers.get('Retry-After', 'Unbekannt')
                print(f"   🛑 LIMIT ERREICHT (429)! Spotify fordert eine Pause von: {wartezeit} Sekunden.")
                time.sleep(int(wartezeit) if wartezeit.isdigit() else 10)
            else:
                print(f"   ❌ API HTTP-Fehler: {e}")
        except Exception as e:
            if str(e) == "QUOTA_EXCEEDED":
                print("🛑 YouTube Quota überschritten. Speichere und breche ab...")
                break
            print(f"   ❌ Allgemeiner Fehler bei Verarbeitung: {e}")

        # Autosave every 5 added songs
        if hinzugefuegt > 0 and hinzugefuegt % 5 == 0:
            with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(songs_db, f, indent=4, ensure_ascii=False)
            with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(error_db, f, indent=4, ensure_ascii=False)
            print("   💾 [Autosave erfolgreich]")

        # Sleep to be polite to APIs and scraping endpoints
        time.sleep(1.2)

    # Save final databases
    if hinzugefuegt > 0:
        print(f"\n💾 Speichere {hinzugefuegt} neue Songs in '{MAIN_JSON_FILE}'...")
        with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(songs_db, f, indent=4, ensure_ascii=False)
        with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(error_db, f, indent=4, ensure_ascii=False)
        print("🎉 Speichern abgeschlossen!")

        # Recalculate popularity scores using calculate_popularity_score_v2.py
        print("\n🔄 Berechne Popularity Scores neu...")
        try:
            from calculate_popularity_score_v2 import calc_score
            calc_score(MAIN_JSON_FILE, 0.25, 0.1, 0.65)
            print("✅ Popularity Scores erfolgreich neu berechnet!")
        except Exception as e:
            print(f"⚠️ Fehler bei der Neuberechnung der Popularity Scores: {e}")
    else:
        print("\n✅ Keine neuen Songs hinzugefügt.")

    if not_found_count > 0:
        print(f"⚠️ {not_found_count} Songs konnten nicht auf Spotify gefunden werden.")

if __name__ == "__main__":
    run_scraper()
