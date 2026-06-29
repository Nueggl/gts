from calculate_popularity_score_v2 import calc_score
import json

calc_score('songs_new_score_updated_popularity.json', 0.25, 0.1, 0.65)
#                                                     yt  genius lastfm

with open('songs_new_score_updated_popularity.json', 'r', encoding='utf-8') as f:
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