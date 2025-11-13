import { create } from 'ipfs-http-client';

const client = create({
  host: 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization:
      'Basic ' +
      Buffer.from(
        process.env.IPFS_PROJECT_ID + ':' + process.env.IPFS_PROJECT_SECRET
      ).toString('base64'),
  },
});

export async function uploadBuffer(buffer) {
  const { cid } = await client.add(buffer);
  return cid.toString();
}
