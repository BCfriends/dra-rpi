// Google Sign In ID/Secret
var clientId = "855808759724-s2j0ru0fa4aj6cgu72p81uk8k7c61n9h.apps.googleusercontent.com";
var clientSecret = "ClientSecret";

// Send Post Data
var request = require('request');
const readline = require("readline");

// Firebase Utils
var firebase = require("firebase/app");
require("firebase/auth");
require("firebase/firestore");
var moment = require('moment');

// Google Speech
const recorder = require('node-record-lpcm16');
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();

// SSDP Server
var Server = require('node-ssdp').Server
    , ssdpServer = new Server({
    location: {
        port: 8080,
        path: '/'
    }
});

// http Server
const http = require('http');

// File System
fs = require('fs');

let displayName, email, uid, providerData;
const firebaseConfig = require('./firebase_config');

// Request to Google speech
const voiceRequest = {
    config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'ko-KR',
    },
    interimResults: false, // If you want interim results, set this to true
};


// Recognize Stream / To use Google Speech
const recognizeStream = speechClient
    .streamingRecognize(voiceRequest)
    .on('error', console.error)
    .on('data', data => {
            var db = firebase.firestore();
            var today = moment().format('YYYY[-]MM[-]DD');

            // Classification Data
            process.stdout.write(
                data.results[0] && data.results[0].alternatives[0]
                    ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
                    : '\n\nReached transcription time limit, press Ctrl+C\n'
            );
            let usr = data.results[0].alternatives[0].transcript;
            let depress = "기분";
            let music = "음악";
            let depressBad = "우울";
            let depressSad = "슬퍼";
            let depressGood = "좋아";
            let depressNice = "즐거워";
            let depressStatus = 3;

            if (usr.includes(depress)) {
                if (usr.includes(depressBad)) {
                    depressStatus = 1;
                } else if (usr.includes(depressSad)) {
                    depressStatus = 2;
                } else if (usr.includes(depressGood)) {
                    depressStatus = 4;
                } else if (usr.includes(depressNice)) {
                    depressStatus = 5;
                } else {
                    depressStatus = 3;
                }

                process.stdout.write(
                    `${depressStatus} \n`
                );

                db.collection("users").doc(uid).collection("Records").doc(today).set({
                    depressStatus: depressStatus,
                    memo: "db test"
                }).catch(function (error) {
                    console.log(error);
                }).then(function () {
                    process.exit(0);
                });
            }
        }
    );

firebase.initializeApp(firebaseConfig);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
var deviceCode;

function getUserCode() {
    var data;

    data = 'client_id=';
    data += clientId;
    data += '&scope=email%20profile';

    request.post({
        headers: {'content-type' : 'application/x-www-form-urlencoded'},
        url:     'https://oauth2.googleapis.com/device/code',
        body:    data
    }, function(error, response, body){
        const obj = JSON.parse(body);

        deviceCode = obj.device_code;
        // console.log(obj.user_code);
        startSSDP(obj.user_code);
    });
}

function getUserId() {
    var data;

    data = 'client_id=' + clientId + "&";
    data += 'client_secret=' + clientSecret + "&";
    data += 'code=' + deviceCode + '&';
    data += 'grant_type=http://oauth.net/grant_type/device/1.0';

    request.post({
        headers: {'content-type' : 'application/x-www-form-urlencoded'},
        url:     'https://oauth2.googleapis.com/token',
        body:    data
    }, function(error, response, body){
        const obj = JSON.parse(body);
        // console.log(body);
        console.log(obj.id_token);
        loginFirebase(obj.id_token);
    });
}

function loginFirebase(id_token) {
    // Build Firebase credential with the Google ID token.
    var credential = firebase.auth.GoogleAuthProvider.credential(id_token);

    firebase.auth().signInWithCredential(credential).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        console.log(errorCode);
        console.log(errorMessage);
    });

    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            // User is signed in.
            isAnonymous = user.isAnonymous;
            uid = user.uid;

            process.stdout.write(
                user.uid + "\n"
            );
            GSrecord();
        } else {
            // User is signed out.
            process.stdout.write(
                "User is signed out\n"
            );
        }
    });
}

function GSrecord() {
    recorder
        .record({
            sampleRateHertz: 16000,
            threshold: 0,
            // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
            verbose: false,
            recordProgram: 'sox', // Try also "arecord" or "sox"
            silence: '10.0',
        })
        .stream()
        .on('error', console.error)
        .pipe(recognizeStream);
}

function startSSDP(user_code) {
    var string;
    string = `<root>` + `<key>` + user_code + `</key>` + `</root>`;

    console.log(string);

    fs.writeFile('./user_code.xml', string, 'utf8', function(error, data){
        if (error) {
            throw error
        }
    });

    ssdpServer.addUSN('upnp:rootdevice');
    ssdpServer.addUSN('urn:schemas-upnp-org:device:MediaServer:1');
    ssdpServer.addUSN('urn:schemas-upnp-org:service:ContentDirectory:1');
    ssdpServer.addUSN('urn:schemas-upnp-org:service:ConnectionManager:1');

    ssdpServer.on('advertise-alive', function (headers) {
        // Expire old devices from your cache.
        // Register advertising device somewhere (as designated in http headers heads)
        // console.log('advertise-alive', headers);
    });

    ssdpServer.on('advertise-bye', function (headers) {
        // Remove specified device from cache.
    });

    // start the server
    ssdpServer.start()
        .catch(e => {
            console.log('Failed to start server:', e)
        })
        .then(() => {
            console.log('Server started.')
        })

    process.on('exit', function(){
        ssdpServer.stop() // advertise shutting down and stop listening
    })

    http.createServer((request, response) => {
        return request
            .on('error', (err) => {
                console.error(err);
            })
            .on('data', (data) => {
                console.log(data);
            })
            .on('end', () => {
                response.on('error', (err) => {
                    console.error(err);
                });
                fs.readFile('user_code.xml', function(err, data) {
                    if (err) {
                        // 만약 file read 에 실패했을 경우 console.log('file read error');
                    } else {
                        // file read 에 성공하면 data 에 .html 파일의 내용이 전달됨
                        response.writeHead(200, {'Content-Type': 'application/xml'});
                        response.end(data);
                    }
                });
                });
    }).listen(8080);

}


getUserCode();

rl.on("line", function(line) {
    getUserId();
    rl.close();
});