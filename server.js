import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from 'dotenv'
dotenv.config();

const port = process.env.PORT || 4001;

const app = express();

app.use(bodyParser.json({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

const corsOrigin = ["http://localhost:5173","http://20.192.28.44"]
app.use(
    cors({
      origin: corsOrigin,
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

app.post("/syncData", async (req,res) => {
    await copyCollectionFromSource('chapters');
    await copyCollectionFromSource('subjects');
    await copyCollectionFromSource('questions');
    await copyCollectionFromSource('syllabuses');
    await copyCollectionFromSource('tests');
    await copyCollectionFromSource('media');

    res.send('Transfer initiated')
})



  app.listen(port, (req, res) => {
    console.log(`Server is listening on port ${port}`);
  });
