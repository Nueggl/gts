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

def get_lastfm_listeners_api(artist, title):
    # Try with original first, then clean
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
        except Exception as e:
            print(f"      [Last.fm API Error] artist='{a}', track='{t}': {e}")
            
    return 0

def parse_lastfm_html(html):
    blocks = re.findall(r'<li class="header-metadata-tnew-item">.*?</li>', html, re.DOTALL)
    listeners = 0
    scrobbles = 0
    for block in blocks:
        lbl_match = re.search(r'<h4 class="header-metadata-tnew-title">\s*(.*?)\s*</h4>', block, re.DOTALL)
        val_match = re.search(r'title="([\d.,]+)"', block)
        if lbl_match and val_match:
            lbl = lbl_match.group(1).lower().strip()
            val_str = val_match.group(1).replace('.', '').replace(',', '')
            val = int(val_str)
            # Check labels for listeners or scrobbles
            if 'listener' in lbl or 'hörer' in lbl or 'h\u00f6rer' in lbl or 'h&ouml;rer' in lbl:
                listeners = val
            elif 'scrobbel' in lbl or 'scrobble' in lbl:
                scrobbles = val
    return listeners, scrobbles

def scrape_lastfm_listeners(artist, title):
    # Formulate path using plus instead of %20 for spaces
    artist_quoted = urllib.parse.quote(artist).replace('%20', '+')
    title_quoted = urllib.parse.quote(title).replace('%20', '+')
    
    # Try English page first, then German page
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
                listeners, scrobbles = parse_lastfm_html(html)
                if listeners > 0:
                    return listeners
        except Exception as e:
            print(f"      [Last.fm Scrape Error] url='{url}': {e}")
            
    return 0

def update_song_in_list(song_list, updated_song):
    found = False
    spotify_uri = updated_song.get('spotifyUri')
    title = updated_song.get('title')
    artist = updated_song.get('artist')
    
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

    # Filter songs with stats_lastfm == 0
    songs_to_process = [s for s in songs_fehlend if s.get('stats_lastfm') == 0]
    total_to_process = len(songs_to_process)
    print(f"[Info] Found {total_to_process} songs with 'stats_lastfm' = 0 out of {len(songs_fehlend)} total songs.")

    if total_to_process == 0:
        print("[Info] No songs need Last.fm updates. Exiting.")
        return

    updated_in_session = 0
    new_songs_fehlend = list(songs_fehlend)

    for idx, song in enumerate(songs_to_process):
        title = song.get('title')
        artist = song.get('artist')
        print(f"\n[{idx+1}/{total_to_process}] Processing: '{title}' - '{artist}'")

        # 1. Try to get listeners from Last.fm API
        listeners = get_lastfm_listeners_api(artist, title)
        
        if listeners > 0:
            print(f"   [API] Found Listeners via API: {listeners:,}")
        else:
            print("   [API] Could not find listeners via API. Trying web scraping...")
            # 2. Fall back to web scraping
            listeners = scrape_lastfm_listeners(artist, title)
            if listeners > 0:
                print(f"   [Scraped] Found Listeners via Web Scraping: {listeners:,}")
            else:
                print("   [Error] Could not find listeners via API or Web Scraping.")

        # Update the song's lastfm stats
        song['stats_lastfm'] = listeners
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
            print("   [Warning] Song still has 0 value(s) in stats. Keeping in songs_fehlend.json but updating lastfm stats.")
            # Update inside new_songs_fehlend
            for s in new_songs_fehlend:
                if (song.get('spotifyUri') and s.get('spotifyUri') == song.get('spotifyUri')) or \
                   (not song.get('spotifyUri') and s.get('title') == title and s.get('artist') == artist):
                    s['stats_lastfm'] = listeners
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
