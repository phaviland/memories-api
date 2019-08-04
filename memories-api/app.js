const mongoose = require('mongoose'),
    express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    multer = require('multer'),
    multerS3 = require('multer-s3'),
    aws = require('aws-sdk'),
    mime = require('mime'),
    bcrypt = require('bcrypt'),
    jwt = require('jsonwebtoken');

app.listen(3000);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(process.env.CONNECTION_STRING, { useNewUrlParser: true, dbName: 'app' });
mongoose.set('useFindAndModify', false);

const saltRounds = 10;

const memorySchema = {
    username: String,
    title: String,
    info: String,
    photos: [String],
    creationTimestamp: Date
};
const userSchema = {
    username: {
        type: String, unique: true
    },
    hash: String
};
const memoryModel = mongoose.model("memories", memorySchema);
const userModel = mongoose.model("users", userSchema);

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

const ProtectedRoutes = express.Router();
app.use('/secure', ProtectedRoutes);

ProtectedRoutes.use((req, res, next) => {
    var token = req.headers['access-token'];
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ Error: 'Invalid token.' });
        } else {
            req.decoded = decoded;
            next();
        }
    });
});

app.post('/register', function (req, res, next) {
    if (req.body.username == null || !req.body.username.trim())
        return res.status(400).send({ Error: 'Missing username.' });
    if (req.body.password == null || !req.body.password.trim())
        return res.status(400).send({ Error: 'Missing password.' });

    bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
        let user = new userModel({
            username: req.body.username,
            hash: hash            
        });

        user.save(function (err) {
            if (err && err.code == 11000)
                return res.status(200).send({ Error: 'Username already exists.' });
            else if (err)
                return res.status(500).send(err);
            else
                return res.status(201).send(user);
        });
    });
});

app.post('/login', function (req, res, next) {
    userModel.findOne({ username: req.body.username }, function (err, user) {
        if (err)
            return res.status(500).send(err);
        else if (user == null)
            return res.status(401).json({ Error: 'Invalid password/username.' });
        else {
            bcrypt.compare(req.body.password, user.hash, function (err, cryptres) {
                if (err)
                    return res.status(500).send(err);
                else if (cryptres == false)
                    return res.status(401).json({ Error: 'Invalid password/username.' });
                else {
                    const payload = {
                        username: req.body.username
                    };

                    var token = jwt.sign(payload, process.env.SECRET, {
                        //expiresIn: 1440 // expires in 24 hours
                    });

                    return res.status(200).json({ Token: token });
                }
            });
        }
    });    
});

app.post('/secure/memory', upload.array('photo', 4), function (req, res, next) {
    let memory = new memoryModel({
        username: req.decoded.username,
        title: req.body.title,
        info: req.body.info,
        photos: req.files.map(({ key }) => key),
        creationTimestamp: new Date()
    });

    memory.save(function (err) {
        if (err)
            return res.status(500).send(err);
        else
            return res.status(201).send(memory);
    });
});

app.get("/secure/memory", function (req, res, next) {
    memoryModel.find({ username: req.decoded.username }, null, { skip: parseInt(req.query.offset), sort: { creationTimestamp: -1 }, limit: 5 }, function (err, memories) {
        if (err)
            return res.status(500).send(err);
        else
            return res.status(200).send(memories);
    });
});

app.put('/secure/memory/:memoryId', upload.array('photo', 4), function (req, res, next) {
    memoryModel.findOneAndUpdate({ _id: req.params.memoryId, username: req.decoded.username}, {
        $set: {
            title: req.body.title,
            info: req.body.info,
            photos: req.files.map(({ key }) => key)
        }
    }, function (err, memory) {
        if (err)
            return res.status(500).send(err);
        else if (memory == null)
            return res.status(410).json({ Error: 'Memory does not exist.' });
        else
            return res.status(200).send({});
    });
});

app.delete('/secure/memory/:memoryId', function (req, res, next) {
    memoryModel.findOneAndDelete({ _id: req.params.memoryId, username: req.decoded.username }, function (err, memory) {
        if (err)
            return res.status(500).send(err);
        else if (memory == null)
            return res.status(410).json({ Error: 'Memory does not exist.' });
        else if (memory.photos.length != 0) {
            let photos = [];
            memory.photos.forEach(function (fileName) {
                photos.push({ Key: fileName });
            });
            let params = {
                Bucket: 'memories-api', Delete: { Objects: photos }
            };
            s3.deleteObjects(params, function (err, data) {
                if (err)
                    return res.status(500).send(err);
                else
                    return res.status(200).json({});
            });
        } else {
            return res.status(200).json({});
        }
    });
});

