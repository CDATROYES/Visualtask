'use client';

import dynamic from 'next/dynamic';

const CSVViewer = dynamic(() => import('@/components/client/CSVViewer'), {
  ssr: false,
  loading: () => <p>Chargement...</p>
});

export default function Page() {
  return <CSVViewer />;
}
