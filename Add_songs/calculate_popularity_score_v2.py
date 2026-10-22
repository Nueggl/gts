import json
import math
from numpy import std

def mean(list):
    return sum(list) / len(list)

def calc_score(json_file, w_yt, w_genius, w_lastfm):
    with open(json_file, 'r', encoding='utf-8') as f:
        songs = json.load(f)
    list_log_yt = []
    list_log_genius = []
    list_log_lastfm = []
    for song in songs:
        list_log_yt.append(math.log(song['stats_youtube']))
        list_log_genius.append(math.log(song['stats_genius']))
        list_log_lastfm.append(math.log(song['stats_lastfm']))
    
    raw_scores = []
    for song in songs:
        log_yt = math.log(song['stats_youtube'])
        log_genius = math.log(song['stats_genius'])
        log_lastfm = math.log(song['stats_lastfm'])

        z_yt = (log_yt - mean(list_log_yt)) / std(list_log_yt)
        z_genius = (log_genius - mean(list_log_genius)) / std(list_log_genius)
        z_lastfm = (log_lastfm - mean(list_log_lastfm)) / std(list_log_lastfm)

        raw_score = (w_yt * z_yt) + (w_genius * z_genius) + (w_lastfm * z_lastfm)
        raw_scores.append(raw_score)
    
    for song, raw_score in zip(songs, raw_scores):
        ratio = ((raw_score - min(raw_scores)) / (max(raw_scores) - min(raw_scores)))
        popularity_score =  (ratio ** 2) * 99 + 1
        song['popularity'] = int(round(popularity_score, 0))
        
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(songs, f, indent=4, ensure_ascii=False)