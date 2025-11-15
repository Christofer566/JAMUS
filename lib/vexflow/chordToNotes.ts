// lib/vexflow/chordToNotes.ts
export interface Note {
  key: string;      // e.g., "C/4", "E/4", "G/4"
  duration: string; // e.g., "w" (whole note), "h" (half note)
}

export function chordToNotes(chord: string): Note[] {
  // Simple chord to notes mapping
  // We'll use whole notes for MVP
  const chordMap: Record<string, string[]> = {
    'C': ['C/4', 'E/4', 'G/4'],
    'G': ['G/4', 'B/4', 'D/5'],
    'Am': ['A/4', 'C/5', 'E/5'],
    'F': ['F/4', 'A/4', 'C/5'],
    'Dm': ['D/4', 'F/4', 'A/4'],
    'Em': ['E/4', 'G/4', 'B/4'],
    // Add more chords as needed
  };

  const notes = chordMap[chord] || ['C/4', 'E/4', 'G/4']; // Default to C major
  
  return notes.map(key => ({
    key,
    duration: 'w' // whole note
  }));
}
