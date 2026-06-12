import urllib.request
import urllib.error
import urllib.parse
import json
import math
import time
import re
import config_secrets
import config_yt

# --- DATEINAMEN & EINSTELLUNGEN ---
MAIN_JSON_FILE = 'songs_new_score.json'
ERROR_JSON_FILE = 'songs_fehlend.json' # <--- HIER DEN NAMEN DEINER NEUEN DATEI EINTRAGEN

WEIGHT_YOUTUBE = 0.5
WEIGHT_LASTFM = 0.3
WEIGHT_GENIUS = 0.2
MAX_RAW_SCORE = (WEIGHT_YOUTUBE * 9.5) + (WEIGHT_LASTFM * 6.3) + (WEIGHT_GENIUS * 6.7)

def clean_song_title(title):
    # Entfernt nervige Spotify-Anhänge wie " - Remastered 2011", " - Live", " - Radio Edit"
    # Der Text wird ab dem Bindestrich abgeschnitten, wenn bestimmte Wörter folgen
    clean = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus).*', '', title)
    # Entfernt zusätzlich störende Klammern am Ende
    clean = re.sub(r'\(.*?\)', '', clean)
    # Entfernt restliche komische Sonderzeichen
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return clean

def get_lastfm_listeners(artist, title):
    a = urllib.parse.quote(artist)
    t = urllib.parse.quote(title)
    url = f"http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key={config_secrets.LASTFM_API_KEY}&artist={a}&track={t}&format=json"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'MusicQuiz/1.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            if 'track' in data and 'listeners' in data['track']:
                return int(data['track']['listeners'])
    except Exception:
        pass
    return 0

def get_genius_views(artist, title):
    query = urllib.parse.quote(f"{title} {artist}")
    url = f"https://api.genius.com/search?q={query}"
    
    try:
        token = config_secrets.GENIUS_ACCESS_TOKEN
    except AttributeError:
        print("❌ FEHLER: GENIUS_ACCESS_TOKEN fehlt in der config_secrets.py!")
        return 0

    try:
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            hits = data.get('response', {}).get('hits', [])
            if hits:
                stats = hits[0].get('result', {}).get('stats', {})
                return int(stats.get('pageviews', 0))
    except Exception:
        pass
    return 0

def get_youtube_views(artist, title):
    # Schritt 1: Video-ID kostenlos über die Webseite abgreifen (mit Cookie-Bypass!)
    query = urllib.parse.quote(f"{title} {artist} official music video")
    search_url = "https://" + "www.youtube" + ".com/results?search_query=" + query
    
    video_id = None
    try:
        # DER TRICK: Wir senden ein "CONSENT=YES" Cookie mit, um die Cookie-Wand zu überspringen!
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cookie': 'CONSENT=YES+cb.20230101-00-p0.de+FX+123'
        }
        req_web = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req_web) as response:
            html = response.read().decode('utf-8')
            
            # Wir suchen die 11-stellige Video-ID
            video_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)
            if video_ids:
                video_id = video_ids[0]
    except Exception as e:
        print(f"      [YT Such-Fehler] Konnte Seite nicht laden: {e}")
        
    if not video_id:
        return 0
        
    # Schritt 2: Die exakten Views über deine API abfragen (Kosten: 1 mickriger Quota-Punkt!)
    import config_yt # Stellt sicher, dass dein API Key geladen ist
    stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={video_id}&key={config_yt.API_KEY}"
    
    try:
        req_stats = urllib.request.Request(stats_url)
        with urllib.request.urlopen(req_stats) as response:
            stats_data = json.loads(response.read())
            if stats_data.get('items'):
                # Hier holen wir die bombensicheren View-Zahlen direkt aus der API
                return int(stats_data['items'][0]['statistics'].get('viewCount', 0))
                
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print("      [YT API-Fehler] 🛑 Tageslimit (Quota) von 10.000 erreicht!")
            # Wirft einen echten Fehler, damit das Skript stoppt und morgen weitergemacht werden kann
            raise Exception("QUOTA_EXCEEDED")
    except Exception as e:
        print(f"      [YT API-Fehler] {e}")
        
    return 0

def collect_raw_data():
    # 1. Haupt-Datenbank laden
    try:
        with open(MAIN_JSON_FILE, 'r', encoding='utf-8') as f:
            songs_db = json.load(f)
        print(f"📂 Haupt-Datenbank geladen ({len(songs_db)} Songs).")
    except FileNotFoundError:
        print(f"❌ {MAIN_JSON_FILE} nicht gefunden!")
        return

    # 2. Fehler-Datenbank laden (oder neu erstellen, falls leer)
    try:
        with open(ERROR_JSON_FILE, 'r', encoding='utf-8') as f:
            error_db = json.load(f)
            # Falls die Datei leer ist, setze eine leere Liste
            if not error_db:
                error_db = []
    except FileNotFoundError:
        error_db = []

    updated_count = 0

    for idx, song in enumerate(songs_db):
        if song.get('raw_data_collected') == True:
            continue

        original_title = song.get('title', '')
        artist = song.get('artist', '')
        
        # Nutzen unseres neuen, schlauen Titel-Wäschers!
        clean_title = clean_song_title(original_title)
        clean_artist = clean_song_title(artist)

        print(f"\n🔍 Sammle Daten für: {original_title} - {artist} ({idx+1}/{len(songs_db)})")
        if clean_title != original_title:
            print(f"   🧹 Gekürzt zu: '{clean_title}'")
        
        # --- ROHDATEN ABRUFEN ---
        yt_views = get_youtube_views(clean_artist, clean_title)
        lastfm_listeners = get_lastfm_listeners(clean_artist, clean_title)
        genius_views = get_genius_views(clean_artist, clean_title)

        print(f"   📺 YouTube Views:   {yt_views:,}")
        print(f"   📻 Last.fm Hörer:   {lastfm_listeners:,}")
        print(f"   📖 Genius Aufrufe:  {genius_views:,}")
        
        # --- ROHDATEN SPEICHERN ---
        song['stats_youtube'] = yt_views
        song['stats_lastfm'] = lastfm_listeners
        song['stats_genius'] = genius_views
        
        score_yt = WEIGHT_YOUTUBE * math.log10(max(1, yt_views))
        score_fm = WEIGHT_LASTFM * math.log10(max(1, lastfm_listeners))
        score_ge = WEIGHT_GENIUS * math.log10(max(1, genius_views))
        
        raw_score = score_yt + score_fm + score_ge
        final_score = max(1, min(100, int((raw_score / MAX_RAW_SCORE) * 100)))
        song['popularity'] = final_score
        
        # Haken setzen
        song['raw_data_collected'] = True
        updated_count += 1
        
        # --- NEU: QUARANTÄNE-CHECK ---
        # Wenn irgendein Wert 0 ist, wird der Song kopiert
        if yt_views == 0 or lastfm_listeners == 0 or genius_views == 0:
            print("   ⚠️ ACHTUNG: Ein Wert ist 0. Song wird in die Fehler-Datei kopiert!")
            error_entry = {
                "title": original_title,
                "artist": artist,
                "spotifyUri": song.get('spotifyUri', ''),
                "stats_youtube": yt_views,
                "stats_lastfm": lastfm_listeners,
                "stats_genius": genius_views
            }
            error_db.append(error_entry)

        
        # Auto-Save alle 10 Songs für BEIDE Dateien
        if updated_count % 10 == 0:
            with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as file:
                json.dump(songs_db, file, indent=4, ensure_ascii=False)
            with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as file:
                json.dump(error_db, file, indent=4, ensure_ascii=False)
            print("   💾 [Zwischenspeicherung beider Dateien erfolgreich]")

        time.sleep(1)

    # Letzte Speicherung
    print(f"\n💾 Speichere final alle aktualisierten Songs...")
    with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as file:
        json.dump(songs_db, file, indent=4, ensure_ascii=False)
    with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as file:
        json.dump(error_db, file, indent=4, ensure_ascii=False)
    print("🎉 Skript komplett beendet!")

if __name__ == "__main__":
    collect_raw_data()