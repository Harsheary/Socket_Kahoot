const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let quizzesCollection, usersCollection;

client.connect()
  .then(() => {
    console.log("Connected to MongoDB");
    const db = client.db("quizApp");
    quizzesCollection = db.collection("quizzes");
    usersCollection = db.collection("users");
  })

const server = http.createServer(app);

// Set up Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

let lobbies;


//scoring system
let scores = []; 
let pointsAvailable = 1000; 
let currentQuestionIndex = 0; 

io.on("connection", (socket) => {
  console.log(`User is connected: ${socket.id}`);

  //quiz lobby creation by the teacher (student also joins with this)
  socket.on('create-quiz-lobby', async ({ quizCode }) => {

    if (!quizCode) {
      console.error('Invalid data received for create-quiz-lobby:', quizCode);
      return;
    }


    // initialize the lobby if it doesn't exist (teacher)
    // if (!lobbies[quizCode]) {
    //   lobbies[quizCode] = [];
    //   console.log(`new lobby created with code ${quizCode}`);
    //   socket.join(quizCode);
    // }
    // else {
    //   console.log(`lobby already exists for code ${quizCode}`);
    //   socket.join(quizCode);
    // }

    // lobbies = socket.id;
    lobbies = quizCode;
    

    socket.join(lobbies);



    console.log(`lobbies in teacher: ${lobbies}`);
    console.log(`Sockets in room ${lobbies}:`, Array.from(io.sockets.adapter.rooms.get(lobbies) || [])); // user joins the room

  });



  // student joins the quiz lobby  
  socket.on('join-quiz-lobby', ({ quizCode, username }) => {
    socket.username = username;
    if (!quizCode || !username) {
      console.error('Invalid data received for join-quiz-lobby:', { quizCode, username });
      return;
    }

    console.log(`Player joined quiz ${quizCode}: ${username}`);
    // const playerData = { id: socket.id, username };

    // if (lobbies[quizCode]) {
    //   // lobbies[quizCode].push(playerData); // add player to the lobby
    //   socket.join(quizCode); // join the room for real-time updates

    //   console.log(`Sockets in room ${quizCode}:`, Array.from(io.sockets.adapter.rooms.get(quizCode) || [])); //harsh log

    //   console.log(`Lobbies in student: ${lobbies}`); 
    //   console.log(`lobbies.length: ${lobbies.length}`); 
    //   // notify the teacher and other connected players in the lobby
    //   io.to(quizCode).emit('player-joined', { username, playerCount: lobbies[quizCode].length });   //harsh, emitting num of players as well
    // } else {
    //   // quiz lobby does not exist
    //   socket.emit('error', { message: 'Quiz lobby does not exist.' });
    // }




    socket.join(lobbies)
    io.to(lobbies).emit('player-joined', { username, playerCount: Array.from(io.sockets.adapter.rooms.get(lobbies)).length });   //harsh, emitting num of players as well
    console.log(`Sockets in room ${lobbies}:`, Array.from(io.sockets.adapter.rooms.get(lobbies) || [])); // user joins the room





  });

  // start the quiz
  socket.on('start-quiz', ({ quizCode, quizData }) => {
    if (!quizCode) {
      console.error('Quiz code missing for start-quiz event');
      return;
    }
    
    console.log(typeof(quizData))
    console.log(`quizData in socket: ${JSON.stringify(quizData)}`); 
    
    console.log(`Quiz started for code: ${quizCode}, lobbies: ${lobbies}`);
    // notify all users in the quiz room
    io.to(lobbies).emit('quiz-started', { message: 'The quiz has started!', quizCode, quizData });
  });

  

  //handling send-question event coming TeacherQuiz (for next question) and then emitting question to sockets in lobby (to StudentQuiz)   (h add)
  socket.on("send-question", ({ quizCode, question }) => {
    if (!quizCode || !question) {
      console.error("Invalid data received for send-question:", { quizCode, question });
      return;
    }
    
    //scoring system
    console.log(`moving to next question`); 
    currentQuestionIndex++
    pointsAvailable = 1000

    console.log(typeof(question)); 
    console.log(`Broadcasting question for quiz ${quizCode}:`," question",  question);

    // Emit the question to all users in the quiz room
    io.to(lobbies).emit("send-question", { question });
  });


  //handling student-response received from StudentQuiz and emitting it
  socket.on("student-response", ({ studentId, questionIndex, answer, isCorrect }) => {
    console.log(`heard student-response`); 
    if (!studentId  || !answer || !isCorrect) {
      console.error("Invalid data received for student-response:", { studentId, questionIndex, answer, isCorrect});
      return;
    }
    let response = { username: socket.username, studentId, questionIndex, answer, isCorrect}
    console.log(response); 

    //checking if response is for latestquestion (although not necessary cuz we lock answer as soon it is clicked)
    console.log(`currentQuestionIndex: `, currentQuestionIndex); 
    console.log(`questionIndex: `, questionIndex); 

    if (questionIndex !== currentQuestionIndex) {
      console.log("Ignoring response for an old question.");
      return;
    }

    const existingUser = scores.find((user) => user.socketId === studentId);

    if (existingUser) {
      existingUser.finalscore += isCorrect ? pointsAvailable : 0;
    } else {
      //new user in array (they never )
      scores.push({
        socketId: studentId,
        username: socket.username,
        finalscore: isCorrect ? pointsAvailable : 0,
      });
    }

    console.log("Updated Scores:", scores);
    pointsAvailable = Math.max(pointsAvailable - 100, 0); //prevent negative scores
  });


  socket.on('quiz-done',()=>{
    console.log(`quiz-done`); 

    io.to(lobbies).emit("final-score", ({scores}))
  })


  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    //remove players from lobby
    // for (const [code, players] of Object.entries(lobbies)) {
    //   const index = players.findIndex((player) => player.id === socket.id);
    //   if (index !== -1) {
    //     players.splice(index, 1); // remove player
    //     io.to(code).emit('player-left', { id: socket.id, playerCount: lobbies[code].length });
    //     break;
    //   }
    // }
  });
});

// Start the server
server.listen(3001, () => {
  console.log('Socket server is running on port 3001!');
});