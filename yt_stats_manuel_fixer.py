import urllib.request
import urllib.parse
import urllib.error
import json
import re
import config_yt

MAIN_DB_FILE = 'songs_new_score.json'
FIX_LIST_FILE = 'songs_vergessen_ki.txt'

def load_fix_list_from_txt(filepath):
    fix_list = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue # Leere Zeilen überspringen
                
                try:
                    # 1. Von hinten am ersten Komma abtrennen (für die Views)
                    name_part, views_part = line.rsplit(',', 1)
                    
                    # 2. Den restlichen Text von hinten am " - " abtrennen (für Artist/Title)
                    artist, title = name_part.rsplit(' – ', 1)
                    
                    fix_list.append({
                        'title': title.strip(),
                        'artist': artist.strip(),
                        'stats_youtube': int(views_part.strip())
                    })
                except Exception:
                    print(f"⚠️ Konnte Zeile nicht sauber lesen und überspringe sie: '{line}'")
        return fix_list
    except FileNotFoundError:
        return []

def get_candidate_videos(artist, title):
    # 1. Scraper holt die ersten 5 Video-IDs kostenlos
    query = urllib.parse.quote(f"{title} {artist} official music video")
    search_url = "https://" + "www.youtube" + ".com/results?search_query=" + query
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': 'CONSENT=YES+cb.20230101-00-p0.de+FX+123'
    }
    
    try:
        req_web = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req_web) as response:
            html = response.read().decode('utf-8')
            
            # Alle Video-IDs finden
            all_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)
            
            # Duplikate entfernen, aber Reihenfolge beibehalten (max 5 Stück)
            unique_ids = list(dict.fromkeys(all_ids))[:5]
            
            if not unique_ids:
                return []
                
    except Exception as e:
        print(f"❌ Scraper-Fehler: {e}")
        return []

    # 2. Die 5 IDs in EINEM Rutsch bei der API abfragen (Kosten: 1 Quota)
    ids_string = ','.join(unique_ids)
    # part=snippet,statistics holt uns Titel, Kanalnamen UND Klickzahlen auf einmal
    stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={ids_string}&key={config_yt.API_KEY}"
    
    candidates = []
    try:
        req_stats = urllib.request.Request(stats_url)
        with urllib.request.urlopen(req_stats) as response:
            api_data = json.loads(response.read())
            
            for item in api_data.get('items', []):
                snippet = item.get('snippet', {})
                stats = item.get('statistics', {})
                
                candidates.append({
                    'id': item['id'],
                    'video_title': snippet.get('title', 'Unbekannt'),
                    'channel': snippet.get('channelTitle', 'Unbekannt'),
                    'views': int(stats.get('viewCount', 0))
                })
        return candidates
        
    except urllib.error.HTTPError as e:
        print(f"❌ API-Fehler: {e.code}")
        return []

def interactive_fix():
    # Datenbanken laden
    try:
        with open(MAIN_DB_FILE, 'r', encoding='utf-8') as f:
            main_db = json.load(f)
    except FileNotFoundError:
        print(f"❌ Hauptdatenbank {MAIN_DB_FILE} nicht gefunden!")
        return

    print(f"📂 Lade Fehlerliste aus Textdatei '{FIX_LIST_FILE}'...")
    fix_list = load_fix_list_from_txt(FIX_LIST_FILE)
    
    if not fix_list:
        print(f"❌ Fehlerliste ist leer oder '{FIX_LIST_FILE}' wurde nicht gefunden!")
        return
        
    print(f"✅ {len(fix_list)} Songs erfolgreich eingelesen. Starte manuellen Fix...\n")

    fixed_count = 0

    for idx, fix_song in enumerate(fix_list):
        title = fix_song.get('title', '')
        artist = fix_song.get('artist', '')
        old_views = fix_song.get('stats_youtube', 'Unbekannt')
        
        # Den exakten Song in der Hauptdatenbank finden
        main_song = next((s for s in main_db if s.get('title') == title and s.get('artist') == artist), None)
        
        if not main_song:
            print(f"⚠️ {title} - {artist} in Haupt-DB nicht gefunden. Überspringe...")
            continue
            
        print("-" * 60)
        print(f"🎵 SONG ({idx+1}/{len(fix_list)}): {title} - {artist}")
        print(f"📉 Aktueller (falscher) Wert: {old_views:,} Views")
        print("🔍 Suche Kandidaten auf YouTube...")
        
        candidates = get_candidate_videos(artist, title)
        
        if not candidates:
            print("❌ Keine Kandidaten gefunden.")
            continue
            
        # Kandidaten anzeigen
        for i, cand in enumerate(candidates):
            print(f"  [{i+1}] {cand['views']:>14,} Views | {cand['channel'][:20]:<20} | {cand['video_title'][:50]}")
            
        print(f"  [0] NICHTS DAVON (Überspringen / manuell prüfen)")
        
        # User Input Loop
        while True:
            choice = input(f"\n👉 Wähle das richtige Video (0-{len(candidates)}): ").strip()
            
            if choice.isdigit() and 0 <= int(choice) <= len(candidates):
                choice = int(choice)
                break
            else:
                print("❌ Ungültige Eingabe. Bitte eine Zahl aus der Liste wählen.")
                
        if choice == 0:
            print("⏭️ Nichts Passendes dabei.")
            manual_input = input("   👉 Gib die manuell recherchierten Views ein (oder drücke nur ENTER zum echten Überspringen): ").strip()
            
            if manual_input.isdigit():
                new_views = int(manual_input)
                main_song['stats_youtube'] = new_views
                fixed_count += 1
                print(f"✅ Manuell korrigiert auf {new_views:,} Views!")
                
                # Direkt speichern
                with open(MAIN_DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(main_db, f, indent=4, ensure_ascii=False)
            else:
                print("⏭️ Echt übersprungen.")
        else:
            selected_video = candidates[choice - 1]
            new_views = selected_video['views']
            
            # Wert in der Hauptdatenbank überschreiben
            main_song['stats_youtube'] = new_views
            fixed_count += 1
            print(f"✅ Korrigiert auf {new_views:,} Views!")
            
            # Direkt speichern
            with open(MAIN_DB_FILE, 'w', encoding='utf-8') as f:
                json.dump(main_db, f, indent=4, ensure_ascii=False)

    print("-" * 60)
    print(f"🎉 Fertig! Du hast erfolgreich {fixed_count} Songs manuell repariert.")

if __name__ == "__main__":
    interactive_fix()