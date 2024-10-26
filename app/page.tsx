import dynamic from 'next/dynamic'

const CSVViewer = dynamic(() => import('@/components/CSVViewer'), {
  ssr: false,
  loading: () => <p>Loading...</p>
})

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <CSVViewer />
    </main>
  )
}
