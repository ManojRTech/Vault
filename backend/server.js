import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import vaultRoutes from './routes/vault.js';
import documentRoutes from "./routes/documents.js";
import consentRoutes from "./routes/consent.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultRoutes);
app.use("/documents", documentRoutes);
app.use("/api/consent", consentRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
