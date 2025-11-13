import { useState } from "react";

const UploadDoc = () => {
  const [file, setFile] = useState(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert("Select a file first!");

    const formData = new FormData();
    formData.append("document", file);

    const res = await fetch(`${import.meta.env.VITE_API_URL}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: formData,
    });

    const data = await res.json();
    alert(data.message || "Uploaded successfully!");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">Upload Aadhar / Credential</h1>
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="p-2 border rounded"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
        >
          Upload
        </button>
      </form>
    </div>
  );
};

export default UploadDoc;
