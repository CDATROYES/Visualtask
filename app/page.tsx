'use client';

import dynamic from 'next/dynamic';

const CSVViewer = dynamic(() => import('../components/client/CSVViewer'), {
  ssr: false
});

export default function Page() {
  return (
    <div>
      <CSVViewer />
    </div>
  );
}
