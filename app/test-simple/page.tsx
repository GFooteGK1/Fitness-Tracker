export default function SimpleTest() {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      color: 'black', 
      padding: '20px',
      minHeight: '100vh'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
        Simple Test Page - No Tailwind
      </h1>
      <p style={{ fontSize: '16px', marginBottom: '10px' }}>
        If you can see this, React and Next.js are working fine.
      </p>
      <p style={{ fontSize: '16px', color: 'green' }}>
        ✅ Basic rendering is functional
      </p>
      <div style={{ 
        backgroundColor: '#f0f0f0', 
        padding: '10px', 
        marginTop: '20px',
        border: '1px solid #ccc'
      }}>
        <p>This box should be visible with a gray background and border.</p>
      </div>
    </div>
  );
}