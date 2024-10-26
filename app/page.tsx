'use client';

import dynamic from 'next/dynamic'

const CSVViewer = dynamic(() => import('@/components/CSVViewer'), { 
  ssr: false,
  loading: () => <div>Chargement...</div>
})

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <CSVViewer />
    </main>
  )
}
