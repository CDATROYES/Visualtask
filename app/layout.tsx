import '@/styles/globals.css'

export const metadata = {
  title: 'CSV Viewer App',
  description: 'Application de visualisation de fichiers CSV',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
