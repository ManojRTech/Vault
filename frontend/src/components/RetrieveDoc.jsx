import { useState } from "react";

const RetrieveDoc = () => {
  const [ipfsHash, setIpfsHash] = useState("");
  const [shares, setShares] = useState(["", ""]); // threshold shares (2 of 3)
  const [iv, setIv] = useState("");

  const handleRetrieve = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/documents/retrieve`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ ipfsHash, shares, ivHex: iv }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "decrypted.doc"; // you can replace with original filename if available
        a.click();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to retrieve document");
      }
    } catch (error) {
      console.error(error);
      alert("Error retrieving document. Check console for details.");
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto flex flex-col gap-4">
      <input
        value={ipfsHash}
        onChange={(e) => setIpfsHash(e.target.value)}
        placeholder="IPFS Hash"
        className="p-2 border rounded"
      />
      <input
        value={shares[0]}
        onChange={(e) => setShares([e.target.value, shares[1]])}
        placeholder="Share 1"
        className="p-2 border rounded"
      />
      <input
        value={shares[1]}
        onChange={(e) => setShares([shares[0], e.target.value])}
        placeholder="Share 2"
        className="p-2 border rounded"
      />
      <input
        value={iv}
        onChange={(e) => setIv(e.target.value)}
        placeholder="IV (hex)"
        className="p-2 border rounded"
      />
      <button
        onClick={handleRetrieve}
        className="bg-green-600 text-white py-2 rounded hover:bg-green-700"
      >
        Retrieve & Decrypt
      </button>
    </div>
  );
};

export default RetrieveDoc;
