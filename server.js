import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from 'dotenv'
dotenv.config();
import axios from "axios";
import fs from 'fs';
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.PORT || 4001;

const app = express();

app.use(bodyParser.json({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

const corsOrigin = ["http://localhost:5173","http://20.192.28.44"]
app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    })
  );

const localClient = new MongoClient(process.env.LOCAL_DB);
const mainClient = new MongoClient(process.env.MAIN_DB);

async function copyCollectionFromSource(collection) {
    try {
        await localClient.connect();
        await mainClient.connect();

        const db1 = localClient.db('test'); 
        const db2 = mainClient.db('test'); 

        const sourceCollection = db2.collection(collection);
        const targetCollection = db1.collection(collection);

        targetCollection.drop();

        const dataToTransfer = await sourceCollection.find({}).toArray();

        if (dataToTransfer.length > 0) {
            await targetCollection.insertMany(dataToTransfer);
        }

        console.log('Data transferred successfully');

    } catch (error) {
        console.error('Error transferring data:', error);
    }finally{
        await localClient.close();
        await mainClient.close();
    }
}

async function transferChapterAndTests() {
    try {
        await localClient.connect();
        await mainClient.connect();

        const db1 = localClient.db('test'); 
        const db2 = mainClient.db('test'); 

        // Adjust these collection names as needed
        const sourceCollection = db2.collection('chapters');
        const targetCollection = db1.collection('chapters');

        const dataToTransfer = await sourceCollection.find({}).toArray();

        if (dataToTransfer.length > 0) {
            await targetCollection.insertMany(dataToTransfer);
        }

        console.log('Data transferred successfully');
    } catch (error) {
        console.error('Error transferring data:', error);
    } finally {
        await localClient.close();
        await mainClient.close();
    }
}

async function chapterSyncFromCollection(){
    try {
        await localClient.connect();
        await mainClient.connect();

        const db1 = localClient.db('test'); 
        const db2 = mainClient.db('test'); 

        const sourceCollection = db2.collection("chapters"); // main 
        const targetCollection = db1.collection("chapters"); // local

        const cursor = sourceCollection.find({});

        while (await cursor.hasNext()) {
            const doc = await cursor.next();

              // Get the existing document from the target collection
              const existingDoc = await targetCollection.findOne({ _id: doc._id });
            
              // If the existing document has a filePath, preserve it
              if (existingDoc && existingDoc.filePath) {
                  doc.filePath = existingDoc.filePath;
              }

            await targetCollection.updateOne(
                { _id: doc._id }, // Match document by its _id
                { $set: doc },   // Update with new document data
                { upsert: true } // Insert if it doesn't exist
            );
        }

        console.log('Reverse Data synchronized successfully for collection:', "Chapters");


    } catch (error) {
        console.error('Error synchronizing data:', error);
    }finally{
        await localClient.close();
        await mainClient.close();
    }
}

async function syncCollectionFromSource(collection) {
    try {
        await localClient.connect();
        await mainClient.connect();

        const db1 = localClient.db('test'); 
        const db2 = mainClient.db('test'); 

        const sourceCollection = db1.collection(collection); // local 
        const targetCollection = db2.collection(collection); // main

        const cursor = sourceCollection.find({});
        
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            await targetCollection.updateOne(
                { _id: doc._id }, // Match document by its _id
                { $set: doc },   // Update with new document data
                { upsert: true } // Insert if it doesn't exist
            );
        }

        console.log('Data synchronized successfully for collection:', collection);

    } catch (error) {
        console.error('Error synchronizing data:', error);
    } finally {
        await localClient.close();
        await mainClient.close();
    }
}

app.post("/syncData", async (req,res) => {
    // await copyCollectionFromSource('chapters');
    await chapterSyncFromCollection();
    await downloadPdfsFromSource();
    await copyCollectionFromSource('subjects');
    await copyCollectionFromSource('questions');
    await copyCollectionFromSource('syllabuses');
    await copyCollectionFromSource('tests');
    await copyCollectionFromSource('media');

    await syncCollectionFromSource('schools');
    await syncCollectionFromSource('instructors');
    await syncCollectionFromSource('users');
    await syncCollectionFromSource('students');
    await syncCollectionFromSource('studenttests');
    await syncCollectionFromSource('subject-times');
    await syncCollectionFromSource('chapter-times');
    

    res.send('Transfer initiated')
})

app.post('/downloadPdfs', async (req, res) => {
    try {
        await localClient.connect();
        const db1 = localClient.db('test'); 
        const chapterCollection = db1.collection('chapters'); // local 

        const cursor = chapterCollection.find({});

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const url = doc.chapterUrl;
            const filename = path.basename(url);
            const filePath = path.resolve(__dirname, 'books', filename);

            try {
                const response = await axios({
                    url,
                    method: 'GET',
                    responseType: 'stream'
                });

                const writer = fs.createWriteStream(filePath);

                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                console.log(`Downloaded: ${filename}`);

                // Update the document with the file path
                await chapterCollection.updateOne(
                    { _id: doc._id },
                    { $set: { filePath:"/books/"+filename } }
                );

            } catch (downloadError) {
                console.error(`Error downloading ${filename}:`, downloadError);
            }
        }

        res.status(200).json({
            success: true,
            msg: "Downloaded PDFs and updated file paths"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error downloading the PDFs');
    } finally {
        await localClient.close();
    }
});

const downloadPdfsFromSource = async () => {
    try {
        await localClient.connect();
        const db1 = localClient.db('test'); 
        const chapterCollection = db1.collection('chapters'); // local 

        const cursor = chapterCollection.find({});

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const url = doc.chapterUrl;
            const filename = path.basename(url);
            const filePath = path.resolve(__dirname, 'books', filename);

            if(doc.filePath){
                console.log('Skipping chapter download for:'+doc.name);
                continue;
            }else{
                try {
                    const response = await axios({
                        url,
                        method: 'GET',
                        responseType: 'stream'
                    });
    
                    const writer = fs.createWriteStream(filePath);
    
                    response.data.pipe(writer);
    
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
    
                    console.log(`Downloaded: ${filename}`);
    
                    // Update the document with the file path
                    await chapterCollection.updateOne(
                        { _id: doc._id },
                        { $set: { filePath:'\books\\'+filename } }
                    );
    
                } catch (downloadError) {
                    console.error(`Error downloading ${filename}:`, downloadError);
                }
            }

           
        }

    } catch (error) {
        console.error(error);
    } finally {
        await localClient.close();
    }
}

app.get('/download-pdf', async (req, res) => {
    const url = 'https://neodealsstorageaccount.blob.core.windows.net/neodealscontainer/sns/8554ff13-abc2-4558-ba56-00b1d5ef7f36iemh107.pdf';
    const filename = path.basename(url);
    const filePath = path.resolve(__dirname, 'books', filename);

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        writer.on('finish', () => {
            res.send('PDF downloaded successfully');
        });

        writer.on('error', (err) => {
            console.log(err);
            res.status(500).send('Error downloading the PDF');
        });
    } catch (error) {
        console.log(error);
        res.status(500).send('Error downloading the PDF');
    }
});


  app.listen(port, (req, res) => {
    console.log(`Server is listening on port ${port}`);
  });
