import type { TagVocabulary } from './model';

/**
 * The vocabulary the server offers (`GET /api/assist/music-tags`), copied so the in-memory adapter and the specs have one
 * to work with. A running dashboard always asks the server; this is only a fixture and may lag behind it.
 */
export const VOCABULARY_FIXTURE: TagVocabulary = {
  categories: [
    { id: 'genre', tags: ['pop', 'rock', 'jazz', 'electronic', 'classical', 'hip-hop', 'r&b', 'country', 'reggae', 'blues', 'folk', 'metal', 'punk', 'disco', 'funk', 'soul', 'indie', 'edm', 'house', 'techno', 'ambient', 'lo-fi', 'k-pop', 'j-pop', 'c-pop', 'latin', 'reggaeton', 'bossa nova'] },
    { id: 'mood', tags: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'melancholic', 'uplifting', 'dark', 'dreamy', 'aggressive', 'peaceful', 'nostalgic', 'hopeful', 'mysterious', 'playful', 'epic', 'chill', 'intense'] },
    { id: 'instrument', tags: ['piano', 'guitar', 'acoustic guitar', 'electric guitar', 'bass', 'drums', 'violin', 'cello', 'saxophone', 'trumpet', 'flute', 'synth', 'strings', 'orchestra', 'choir', '808', 'harp', 'organ', 'ukulele', 'harmonica'] },
    { id: 'tempo', tags: ['slow', 'moderate', 'fast', 'very fast', 'ballad', 'uptempo', 'mid-tempo', 'groovy'] },
    { id: 'vocal', tags: ['male vocal', 'female vocal', 'duet', 'rap', 'whisper', 'powerful vocals', 'falsetto', 'soprano', 'baritone', 'tenor', 'alto', 'harmonies', 'a cappella'] },
    { id: 'era', tags: ['80s', '90s', '2000s', 'modern', 'retro', 'vintage', '70s', '60s', 'futuristic'] },
    { id: 'production', tags: ['cinematic', 'hi-fi', 'acoustic', 'live', 'studio', 'raw', 'polished', 'minimalist', 'layered', 'atmospheric'] },
  ],
  combos: [
    { id: 'chill-lofi', name: 'Chill Lo-fi', tags: ['lo-fi', 'chill', 'piano', 'slow'] },
    { id: 'epic-cinematic', name: 'Epic Cinematic', tags: ['cinematic', 'epic', 'orchestra', 'strings'] },
    { id: 'upbeat-pop', name: 'Upbeat Pop', tags: ['pop', 'happy', 'energetic', 'female vocal'] },
    { id: 'dark-electronic', name: 'Dark Electronic', tags: ['electronic', 'dark', 'synth', 'modern'] },
    { id: 'acoustic-ballad', name: 'Acoustic Ballad', tags: ['acoustic', 'ballad', 'guitar', 'romantic'] },
    { id: 'retro-synthwave', name: 'Retro Synthwave', tags: ['80s', 'synth', 'electronic', 'retro'] },
    { id: 'jazz-cafe', name: 'Jazz Cafe', tags: ['jazz', 'piano', 'saxophone', 'calm'] },
    { id: 'hiphop-beat', name: 'Hip-Hop Beat', tags: ['hip-hop', '808', 'bass', 'rap'] },
    { id: 'rock-anthem', name: 'Rock Anthem', tags: ['rock', 'electric guitar', 'drums', 'powerful vocals'] },
    { id: 'ambient-meditation', name: 'Ambient Meditation', tags: ['ambient', 'peaceful', 'atmospheric', 'slow'] },
  ],
};
