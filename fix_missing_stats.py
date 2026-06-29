import urllib.request
import urllib.parse
import urllib.error
import json
import time
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
VERBESSERT_JSON_FILE = 'songs_fehlend_verbessert.json'

def clean_song_title(title):
    # Removes Spotify suffixes like " - Remastered 2011", " - Live", " - Radio Edit", etc.
    clean = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series).*', '', title)
    # Removes trailing parenthesis content
    clean = re.sub(r'\(.*?\)', '', clean)
    # Removes other symbols
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return clean

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
            video_ids = list(dict.fromkeys(all_ids))[:5]
    except Exception as e:
        print(f"      [YT Search Error] Konnte Ergebnisseite nicht laden: {e}")
        
    if not video_ids:
        return 0
        
    stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={','.join(video_ids)}&key={config_yt.API_KEY}"
    try:
        req_stats = urllib.request.Request(stats_url)
        with urllib.request.urlopen(req_stats) as response:
            stats_data = json.loads(response.read())
            items = stats_data.get('items', [])
            if items:
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

def update_song_in_list(song_list, updated_song):
    """
    Updates a song in a list if it exists (by spotifyUri, or title+artist).
    If it doesn't exist, adds it.
    """
    found = False
    spotify_uri = updated_song.get('spotifyUri')
    title = updated_song.get('title')
    artist = updated_song.get('artist')
    
    for song in song_list:
        match = False
        if spotify_uri and song.get('spotifyUri') == spotify_uri:
            match = True
        elif song.get('title') == title and song.get('artist') == artist:
            match = True
            
        if match:
            song['stats_youtube'] = updated_song['stats_youtube']
            song['stats_lastfm'] = updated_song['stats_lastfm']
            song['stats_genius'] = updated_song['stats_genius']
            song['raw_data_collected'] = True
            found = True
            break
            
    if not found:
        new_entry = {
            "title": title,
            "artist": artist,
            "spotifyUri": spotify_uri or "",
            "stats_youtube": updated_song['stats_youtube'],
            "stats_lastfm": updated_song['stats_lastfm'],
            "stats_genius": updated_song['stats_genius'],
            "raw_data_collected": True
        }
        song_list.append(new_entry)

def main():
    # 1. Load files
    try:
        with open(ERROR_JSON_FILE, 'r', encoding='utf-8') as f:
            songs_fehlend = json.load(f)
    except FileNotFoundError:
        print(f"❌ '{ERROR_JSON_FILE}' nicht gefunden. Keine Songs zu fixen.")
        return

    if not songs_fehlend:
        print(f"ℹ️ '{ERROR_JSON_FILE}' ist leer. Keine Songs zu fixen.")
        return

    try:
        with open(MAIN_JSON_FILE, 'r', encoding='utf-8') as f:
            main_db = json.load(f)
        print(f"📂 Haupt-Datenbank geladen ({len(main_db)} Songs).")
    except FileNotFoundError:
        print(f"❌ Haupt-Datenbank '{MAIN_JSON_FILE}' nicht gefunden!")
        return

    try:
        with open(VERBESSERT_JSON_FILE, 'r', encoding='utf-8') as f:
            songs_verbessert = json.load(f)
            if not isinstance(songs_verbessert, list):
                songs_verbessert = []
    except (FileNotFoundError, json.JSONDecodeError):
        songs_verbessert = []

    total_songs = len(songs_fehlend)
    print(f"🚀 Starte Korrektur von {total_songs} Songs aus '{ERROR_JSON_FILE}'...\n")

    updated_count = 0
    new_songs_fehlend = []

    for idx, song in enumerate(songs_fehlend):
        title = song.get('title', '')
        artist = song.get('artist', '')
        spotify_uri = song.get('spotifyUri', '')

        print(f"[{idx+1}/{total_songs}] Bearbeite: '{title}' - '{artist}'")

        # Get current stats (some might already be correct)
        yt_views = song.get('stats_youtube', 0)
        lastfm_listeners = song.get('stats_lastfm', 0)
        genius_views = song.get('stats_genius', 0)

        # Nutzen unseres schlauen Titel-Wäschers
        clean_title = clean_song_title(title)
        clean_artist = clean_song_title(artist)

        # Retrieve missing stats
        has_updates = False

        if yt_views == 0:
            print("   📺 YouTube Views fehlen. Suche...")
            try:
                new_yt = get_youtube_views(clean_artist, clean_title)
                if new_yt > 0:
                    yt_views = new_yt
                    print(f"      ✅ Gefunden: {yt_views:,} Views")
                    has_updates = True
                else:
                    print("      ❌ Keine Views gefunden.")
            except Exception as e:
                if str(e) == "QUOTA_EXCEEDED":
                    print("🛑 YouTube Quota überschritten. Breche ab...")
                    new_songs_fehlend.extend(songs_fehlend[idx:])
                    break
                print(f"      ❌ Fehler bei YouTube Suche: {e}")

        if lastfm_listeners == 0:
            print("   📻 Last.fm Hörer fehlen. Suche...")
            try:
                new_fm = get_lastfm_listeners(clean_artist, clean_title)
                if new_fm > 0:
                    lastfm_listeners = new_fm
                    print(f"      ✅ Gefunden: {lastfm_listeners:,} Hörer")
                    has_updates = True
                else:
                    print("      ❌ Keine Hörer gefunden.")
            except Exception as e:
                print(f"      ❌ Fehler bei Last.fm Suche: {e}")

        if genius_views == 0:
            print("   📖 Genius Aufrufe fehlen. Suche...")
            try:
                new_ge = get_genius_views(clean_artist, clean_title)
                if new_ge > 0:
                    genius_views = new_ge
                    print(f"      ✅ Gefunden: {genius_views:,} Aufrufe")
                    has_updates = True
                else:
                    print("      ❌ Keine Aufrufe gefunden.")
            except Exception as e:
                print(f"      ❌ Fehler bei Genius Suche: {e}")

        # Update stats inside the song object
        song['stats_youtube'] = yt_views
        song['stats_lastfm'] = lastfm_listeners
        song['stats_genius'] = genius_views

        # Check if the song still has any zero
        still_has_zeros = (yt_views == 0 or lastfm_listeners == 0 or genius_views == 0)

        if has_updates:
            updated_count += 1
            # Update inside main database (matching by spotifyUri or title+artist)
            main_match = None
            if spotify_uri:
                main_match = next((s for s in main_db if s.get('spotifyUri') == spotify_uri), None)
            if not main_match:
                main_match = next((s for s in main_db if s.get('title') == title and s.get('artist') == artist), None)

            if main_match:
                main_match['stats_youtube'] = max(1, yt_views)
                main_match['stats_lastfm'] = max(1, lastfm_listeners)
                main_match['stats_genius'] = max(1, genius_views)
                main_match['raw_data_collected'] = True
                print("   🔄 Haupt-Datenbank aktualisiert.")

        if still_has_zeros:
            print("   ⚠️ Song hat immer noch fehlende Werte. Bleibt in der Fehler-Datei.")
            new_songs_fehlend.append(song)
        else:
            print("   ✨ Erfolgreich repariert! Wird in 'verbessert'-Datei verschoben.")
            update_song_in_list(songs_verbessert, song)

        # Autosave every 5 songs
        if updated_count > 0 and updated_count % 5 == 0:
            with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(new_songs_fehlend + songs_fehlend[idx+1:], f, indent=4, ensure_ascii=False)
            with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(main_db, f, indent=4, ensure_ascii=False)
            with open(VERBESSERT_JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(songs_verbessert, f, indent=4, ensure_ascii=False)
            print("   💾 [Autosave erfolgreich]")

        # Sleep to avoid rate limiting
        time.sleep(1.2)

    # 3. Save final state
    print(f"\n💾 Speichere alle Dateien...")
    with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_songs_fehlend, f, indent=4, ensure_ascii=False)
    with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(main_db, f, indent=4, ensure_ascii=False)
    with open(VERBESSERT_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(songs_verbessert, f, indent=4, ensure_ascii=False)
    print("🎉 Speichern beendet!")

    # 4. Recalculate popularity scores if any updates happened
    if updated_count > 0:
        print("\n🔄 Berechne Popularity Scores neu...")
        try:
            from calculate_popularity_score_v2 import calc_score
            calc_score(MAIN_JSON_FILE, 0.25, 0.1, 0.65)
            print("✅ Popularity Scores erfolgreich neu berechnet!")
        except Exception as e:
            print(f"⚠️ Fehler bei der Neuberechnung: {e}")
    else:
        print("\nℹ️ Keine Updates durchgeführt. Keine Neuberechnung nötig.")

if __name__ == '__main__':
    main()
