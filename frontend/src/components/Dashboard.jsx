const Dashboard = () => {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold">Welcome to DID Vault</h1>
      <p className="mt-2 text-gray-600">
        Manage and share your verified identity credentials securely.
      </p>
      <a
        href="/upload"
        className="inline-block mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Upload Document
      </a>
    </div>
  );
};

export default Dashboard;
