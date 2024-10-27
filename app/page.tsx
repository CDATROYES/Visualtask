import dynamic from 'next/dynamic'

const CSVViewer = dynamic(
  () => import('@/components/client/CSVViewer'),
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
