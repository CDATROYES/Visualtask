'use client';

import dynamic from 'next/dynamic'

const CSVViewer = dynamic(
  async () => {
    const mod = await import('@/components/client/CSVViewer');
    return mod.default;
  },
  {
    ssr: false,
    loading: () => <div className="p-4">Chargement...</div>
  }
)

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <CSVViewer />
    </main>
  )
}
