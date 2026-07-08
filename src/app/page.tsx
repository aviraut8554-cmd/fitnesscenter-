export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Fitness Creator OS</h1>
      <p>
        Backend API for the multi-tenant fitness creator platform. The admin and
        client interfaces are built separately on top of these APIs.
      </p>
      <p>
        Health check: <code>/api/health</code>
      </p>
    </main>
  );
}
