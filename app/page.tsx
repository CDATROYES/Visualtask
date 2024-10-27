'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic'

const CSVViewer = dynamic(
  async () => {
    const module = await import('@/components/client/CSVViewer');
    return module.default;
  },
  {
    ssr: false,
    loading: () => <div className="p-4">Chargement...</div>
  }
)

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="p-4">Chargement...</div>}>
        <CSVViewer />
      </Suspense>
    </div>
  )
}
