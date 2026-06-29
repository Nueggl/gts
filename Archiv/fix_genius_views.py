import urllib.request
import urllib.parse
import json
import math
import time
import re
import config_secrets

# --- CONFIGURATION & WEIGHTS (matched with spotify_score_updater.py) ---
WEIGHT_YOUTUBE = 0.5
WEIGHT_LASTFM = 0.3
WEIGHT_GENIUS = 0.2
MAX_RAW_SCORE = (WEIGHT_YOUTUBE * 9.5) + (WEIGHT_LASTFM * 6.3) + (WEIGHT_GENIUS * 6.7)

SONGS_FEHLEND_FILE = 'songs_fehlend.json'
SONGS_ZU_FIXEN_FILE = 'songs_zu_fixen.json'
SONGS_FEHLEND_VERBESSERT_FILE = 'songs_fehlend_verbessert.json'

def clean_song_title(title):
    # Removes Spotify suffixes like " - Remastered 2011", " - Live", etc.
    clean = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus).*', '', title)
    clean = re.sub(r'\(.*?\)', '', clean)
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return clean

def calculate_popularity(yt_views, lastfm_listeners, genius_views):
    score_yt = WEIGHT_YOUTUBE * math.log10(max(1, yt_views))
    score_fm = WEIGHT_LASTFM * math.log10(max(1, lastfm_listeners))
    score_ge = WEIGHT_GENIUS * math.log10(max(1, genius_views))
    
    raw_score = score_yt + score_fm + score_ge
    final_score = max(1, min(100, int((raw_score / MAX_RAW_SCORE) * 100)))
    return final_score

def get_genius_path_and_views_api(artist, title):
    # Try searching with clean title and artist first
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
        except Exception as e:
            print(f"      [Genius API Search Error] query='{query}': {e}")
            
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
            
            # Method 1: Parse const rawData = JSON.parse('...')
            match = re.search(r"const\s+rawData\s*=\s*JSON\.parse\('(.*?)'\);", html)
            if match:
                json_str = match.group(1)
                # Unescape quotes
                json_str = json_str.replace('\\"', '"')
                try:
                    data = json.loads(json_str)
                    views = data.get('pageviews')
                    if views is not None:
                        return int(views)
                except Exception:
                    pass
            
            # Method 2: Direct regex for pageviews in HTML
            match_pv = re.search(r'\\?"pageviews\\?":\s*(\d+)', html)
            if match_pv:
                return int(match_pv.group(1))
                
    except Exception as e:
        print(f"      [Genius Scrape Error] for path '{path}': {e}")
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
    
    # 1. Recalculate popularity
    popularity = calculate_popularity(
        updated_song['stats_youtube'],
        updated_song['stats_lastfm'],
        updated_song['stats_genius']
    )
    
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
            song['popularity'] = popularity
            song['raw_data_collected'] = True
            # Keep other existing keys if any
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
            "popularity": popularity,
            "raw_data_collected": True
        }
        song_list.append(new_entry)

def main():
    # Load files
    try:
        with open(SONGS_FEHLEND_FILE, 'r', encoding='utf-8') as f:
            songs_fehlend = json.load(f)
    except FileNotFoundError:
        print(f"[Error] {SONGS_FEHLEND_FILE} not found!")
        return

    try:
        with open(SONGS_ZU_FIXEN_FILE, 'r', encoding='utf-8') as f:
            songs_zu_fixen = json.load(f)
    except FileNotFoundError:
        songs_zu_fixen = []

    try:
        with open(SONGS_FEHLEND_VERBESSERT_FILE, 'r', encoding='utf-8') as f:
            songs_fehlend_verbessert = json.load(f)
    except FileNotFoundError:
        songs_fehlend_verbessert = []

    # Filter songs with stats_genius == 0
    songs_to_process = [s for s in songs_fehlend if s.get('stats_genius') == 0]
    total_to_process = len(songs_to_process)
    print(f"[Info] Found {total_to_process} songs with 'stats_genius' = 0 out of {len(songs_fehlend)} total songs.")

    if total_to_process == 0:
        print("[Info] No songs need updates. Exiting.")
        return

    updated_in_session = 0
    new_songs_fehlend = list(songs_fehlend)

    for idx, song in enumerate(songs_to_process):
        title = song.get('title')
        artist = song.get('artist')
        print(f"\n[{idx+1}/{total_to_process}] Processing: '{title}' - '{artist}'")

        # 1. Find the song page path using Genius API
        path, api_views = get_genius_path_and_views_api(artist, title)
        views = 0
        
        if path:
            print(f"   [Path] Found Genius Path: {path}")
            # 2. Scrape page views
            views = scrape_genius_pageviews(path)
            if views > 0:
                print(f"   [Scraped] Scraped Views: {views:,}")
            else:
                # Fallback to API views if scraping returned 0 but API had views
                if api_views > 0:
                    views = api_views
                    print(f"   [Warning] Scraped 0 views, using API fallback views: {views:,}")
                else:
                    print("   [Error] Scraping returned 0 views and no API fallback views found.")
        else:
            print("   [Error] Could not find song on Genius.")

        # Update the song views
        song['stats_genius'] = views
        updated_in_session += 1

        # Check if the song still has any zero in any stats
        has_zeros = (
            song.get('stats_youtube', 0) == 0 or 
            song.get('stats_lastfm', 0) == 0 or 
            song.get('stats_genius', 0) == 0
        )

        if not has_zeros:
            print("   [Success] Song is now fully updated (no 0 values remaining).")
            # Remove from songs_fehlend
            new_songs_fehlend = [s for s in new_songs_fehlend if not (
                s.get('spotifyUri') == song.get('spotifyUri') if song.get('spotifyUri') 
                else (s.get('title') == title and s.get('artist') == artist)
            )]
            
            # Add/update in songs_zu_fixen
            update_song_in_list(songs_zu_fixen, song)
            # Add/update in songs_fehlend_verbessert
            update_song_in_list(songs_fehlend_verbessert, song)
            print("   [Move] Moved to songs_zu_fixen.json and songs_fehlend_verbessert.json")
        else:
            print("   [Warning] Song still has 0 value(s) in stats. Keeping in songs_fehlend.json but updating genius views.")
            # Update inside new_songs_fehlend
            for s in new_songs_fehlend:
                if (song.get('spotifyUri') and s.get('spotifyUri') == song.get('spotifyUri')) or \
                   (not song.get('spotifyUri') and s.get('title') == title and s.get('artist') == artist):
                    s['stats_genius'] = views
                    break

        # Periodic autosave every 5 songs
        if updated_in_session % 5 == 0:
            with open(SONGS_FEHLEND_FILE, 'w', encoding='utf-8') as f:
                json.dump(new_songs_fehlend, f, indent=4, ensure_ascii=False)
            with open(SONGS_ZU_FIXEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(songs_zu_fixen, f, indent=4, ensure_ascii=False)
            with open(SONGS_FEHLEND_VERBESSERT_FILE, 'w', encoding='utf-8') as f:
                json.dump(songs_fehlend_verbessert, f, indent=4, ensure_ascii=False)
            print("   [Save] [Autosave completed]")

        # Sleep to avoid rate limiting
        time.sleep(1.5)

    # Final Save
    with open(SONGS_FEHLEND_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_songs_fehlend, f, indent=4, ensure_ascii=False)
    with open(SONGS_ZU_FIXEN_FILE, 'w', encoding='utf-8') as f:
        json.dump(songs_zu_fixen, f, indent=4, ensure_ascii=False)
    with open(SONGS_FEHLEND_VERBESSERT_FILE, 'w', encoding='utf-8') as f:
        json.dump(songs_fehlend_verbessert, f, indent=4, ensure_ascii=False)
    
    print("\n[Done] Completed processing all songs successfully!")

if __name__ == '__main__':
    main()
