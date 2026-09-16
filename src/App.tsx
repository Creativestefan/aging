import { useState } from 'react';
import { TimelineScrubber } from './TimelineScrubber';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

export function App() {
  const [, setActiveDay] = useState<number>(8);

  return (
    <main style={{ width: '100%', maxWidth: '720px', position: 'relative' }}>
      <TimelineScrubber
        totalDays={21}
        initialDay={8}
        onDayChange={setActiveDay}
      />
      {/* DialKit Root for live parameter tuning */}
      <DialRoot />
    </main>
  );
}

export default App;
