export default function PublicListsPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Public Lists</h1>
        <p className="text-gray-600">This is the public lists section.</p>
        <p className="text-gray-600 mt-2">Use /public/lists/[id] to access specific shared lists.</p>
      </div>
    </div>
  );
}
