import 'dotenv/config';
import express from 'express';
import { MongoClient } from 'mongodb';
import cloudinary from 'cloudinary';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();


// cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


// middleware
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { collectName } = req.params;
        let folder;
        if (collectName === 'Project-Part') {
            folder = 'project';
        }
        else if (collectName === 'Certificate-Part') {
            folder = 'certif';
        }

        const folderPath = path.join(__dirname, 'upload', folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage })

//up to cloudinary
const uploadToCloudinary = (filePath) => {
    return cloudinary.v2.uploader.upload(filePath, {
        folder: 'uploads',  // Folder di Cloudinary untuk menyimpan gambar
    });
};


// connect to MongoDB
const client = new MongoClient(process.env.uri, { 
    ssl: true,
    tlsAllowInvalidCertificates: true 
});
let db;
const connection = async (dbName) => {
    if (!db) {
        try {
            await client.connect();
            console.log(`Connected to ${dbName} database.`);
            db = client.db(dbName);
        }
        catch (e) {
            console.error(`Error connecting to ${dbName} database:`, e);
            process.exit(1);
        }
    }
    return db;
}


// get endpoint
app.get('/api/:dbName/:collectName', async (req, res) => {
    const { dbName, collectName } = req.params;
    try {
        const database = await connection(dbName);
        const collectionName = await database.collection(collectName);
        const result = await collectionName.find().toArray();
        res.json(result);
    }
    catch (e) {
        console.error(`Error retrieving data from ${dbName}.${collectName}:`, e);
        res.status(500).json({ error: 'Failed to retrieve data.' });
    }
});


// post endpoint
app.post('/api/:dbName/:collectName', upload.single('image'), async (req, res) => {
    const { dbName, collectName } = req.params;
    try {
        const database = await connection(dbName);
        const collectionName = await database.collection(collectName);
        let result;

        if (req.file) {
            // Upload gambar ke Cloudinary
            const uploadResult = await uploadToCloudinary(req.file.path);
            
            // Simpan URL gambar dari Cloudinary di MongoDB
            const additionalData = req.body;
            result = await collectionName.insertOne({
                imagePath: uploadResult.secure_url, // Path Cloudinary yang aman
                additionalData
            });
        } else {
            const data = req.body;
            result = await collectionName.insertOne(data);
        }
        
        res.json({ message: 'Data saved successfully.', insertedId: result.insertedId });
    } catch (e) {
        console.error(`Error saving data to ${dbName}.${collectName}:`, e);
        res.status(500).json({ error: 'Failed to save data.' });
    }
});


// run server
app.listen(5000, () => {
    console.log("Server running...");
});

