const mongoose = require('mongoose');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');
const mime = require('mime');

app.listen(3000);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(process.env.CONNECTION_STRING, { useNewUrlParser: true, dbName: 'app' });

const memorySchema = {
    userId: Number,
    title: String,
    info: String,
    photos: [String],
    creationTimestamp: Date
};
const memoryModel = mongoose.model("memories", memorySchema);

aws.config.update({
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    accessKeyId: process.env.ACCESS_KEY_ID
});

const s3 = new aws.S3();

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: 'memories-api',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname })
        },
        key: function (req, file, cb) {
            cb(null, 'photos/' + Date.now().toString() + '.' + mime.getExtension(file.mimetype))
        }
    })
});

// Register

// Login

// Logout

// Create
app.post('/creatememory', upload.array('photo', 4), function (req, res, next) {
    let memory = new memoryModel({
        userId: 1,
        title: req.body.title,
        info: req.body.info,
        photos: req.files.map(({ key }) => key),
        creationTimestamp: new Date()
    });
    memory.save(function (err) {
        if (err)
            res.status(500).send(err);
        else
            res.status(201).send(memory);
    });
})

// Read
app.get("/getmemory", function (req, res) {
    memoryModel.find({ userId: req.query.userid }, null, { skip: parseInt(req.query.offset), sort: { creationTimestamp: -1 } }, function (err, foundMemories) {
        if (err)
            res.status(500).send(err);
        else
            res.status(200).send(foundMemories);
    });
});

// Update
app.post('/updatememory', upload.array('photo', 4), function (req, res, next) {
    memoryModel.updateOne({ _id: req.body._id }, {
        $set: {
            userId: 1,
            title: req.body.title,
            info: req.body.info,
            photos: req.files.map(({ key }) => key)
        }
    } , { upsert: true }, function (err, results) {
        if (err)
            res.status(500).send(err);
        else
            res.status(200).send(results);
    })
})

// Delete
app.post('/deletememory', function (req, res, next) {
    console.log(req.body._id)
    memoryModel.deleteOne({ _id: req.body._id }, function (err, results) {
        if (err)
            res.status(500).send(err);
        else
            res.status(200).send(results);
    })
})

