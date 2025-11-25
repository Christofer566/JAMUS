// lib/vexflow/chordToNotes.ts
export interface Note {
  key: string;      // e.g., "C/4", "E/4", "G/4"
  duration: string; // e.g., "w" (whole note), "h" (half note)
}

export function chordToNotes(chord: string): Note[] {
  // Simple chord to notes mapping
  // Return single note representing the chord root
  const rootNoteMap: Record<string, string> = {
    'C': 'C/4',
    'G': 'G/4',
    'Am': 'A/4',
    'F': 'F/4',
    'Dm': 'D/4',
    'Em': 'E/4',
    // Add more chords as needed
  };

  const rootNote = rootNoteMap[chord] || 'C/4'; // Default to C

  // Return single whole note (4 beats in 4/4 time)
  // This prevents "Too many ticks" error
  return [{
    key: rootNote,
    duration: 'w' // whole note (4 beats)
  }];
}
