import os
import sys
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from calculate_popularity_score_v2 import calc_score

SONGS_FILE = os.path.join(PROJECT_ROOT, 'song_list.json')

calc_score(SONGS_FILE, 0.25, 0.1, 0.65)
#                      yt  genius lastfm

with open(SONGS_FILE, 'r', encoding='utf-8') as f:
    songs = json.load(f)

for song in songs:
    if song['title'] == 'Bohemian Rhapsody - Remastered 2011':
        print(song['title'], song['popularity'], " | Yt: ", song['stats_youtube'], " | LastFM: ", song['stats_lastfm'], " | Genius: ", song['stats_genius'])
    elif song['title'] == 'Billie Jean':
        print(song['title'], song['popularity'], " | Yt: ", song['stats_youtube'], " | LastFM: ", song['stats_lastfm'], " | Genius: ", song['stats_genius'])
    elif song['title'] == 'Smells Like Teen Spirit':
        print(song['title'], song['popularity'], " | Yt: ", song['stats_youtube'], " | LastFM: ", song['stats_lastfm'], " | Genius: ", song['stats_genius'])
    elif song['title'] == 'Poker Face':
        print(song['title'], song['popularity'], " | Yt: ", song['stats_youtube'], " | LastFM: ", song['stats_lastfm'], " | Genius: ", song['stats_genius'])
    elif song['title'] == 'Shape of You':
        print(song['title'], song['popularity'], " | Yt: ", song['stats_youtube'], " | LastFM: ", song['stats_lastfm'], " | Genius: ", song['stats_genius'])

print("\n")

for song in songs:
    if song['popularity'] >= 95:
        print(song['title'],"|", song['artist'],"|", song['popularity'], "| Yt:", song['stats_youtube'], "| LastFM:", song['stats_lastfm'], "| Genius:", song['stats_genius'])