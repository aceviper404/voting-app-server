const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const amqp = require('amqplib/callback_api');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');

require('dotenv').config();

const app = express();

// Enable compression
app.use(compression());

// Set security-related HTTP headers with helmet
app.use(helmet());

// Use morgan for logging
app.use(morgan('combined'));

app.use(cors())

// Connect to the MongoDB database with connection pooling
mongoose.set("strictQuery", false);
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 200,
  autoIndex: false,
  writeConcern: {
    w: 'majority',
    wtimeout: 5000
  },
  readConcern: {
    level: 'majority'
  }
});

// Define the schema for the votes collection
const voteSchema = new mongoose.Schema({
  name: String,
  votes: { type: Number, default: 1 },
});

const codeSchema = new mongoose.Schema({
  code: { type: String, unique: true },
});

// Create the model for the votes collection with connection pooling
const Vote = mongoose.model('Vote', voteSchema);
const Code = mongoose.model('Code', codeSchema);

// Parse the request body as JSON
app.use(bodyParser.json());

// Handle the POST request to add a vote
app.post('/vote', async (req, res) => {
  try {
    const names = req.body.names;

    // Check if the name exists in the database
    if (!Array.isArray(names)) {
      res.status(400).send({ error: 'Invalid request body' });
      return;
    }

        // Check if the code exists
        const code = req.query.code;
        const response = await axios.get(`http://localhost:3000/codeExists/${code}`);
        const codeExists = response.data;
        if (!codeExists) {
          res.status(400).send({ error: 'Invalid code' });
          return;
        }

    // Publish the request to the RabbitMQ queue
    amqp.connect(process.env.RABBITMQ_URI, function (error0, connection) {
      if (error0) {
        throw error0;
      }

      connection.createChannel(function (error1, channel) {
        if (error1) {
          throw error1;
        }

        const queue = 'votes_queue';
        const msg = { names };

        channel.assertQueue(queue, {
          durable: false
        });

        channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)));
        console.log("Sent %s", JSON.stringify(msg));
      });

      setTimeout(function () {
        connection.close();
      }, 500);
    });

    res.send({ message: 'Votes saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

// app.get('/codeExists/:code', async (req, res) => {
//   try {
//     const code = req.params.code;
//     const foundCode = await Code.findOne({ code: code });
//     if (foundCode) {
//       res.status(200).send(true);
//       return res;
//     } else {
//       const newCode = new Code({ code: code});
//       await newCode.save();
//       res.status(200).send(false);
//       return res;
//     }
//   } catch (error) {
//     console.error(error);
//     res.status(500).send(error);
//     return res;
//   }
// });

// Use CORS
//app.use(cors());

// Create a worker to consume messages from the RabbitMQ queue
amqp.connect(process.env.RABBITMQ_URI, function(error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }

    const queue = 'votes_queue';

    channel.assertQueue(queue, {
      durable: false
    });

    console.log("Waiting for messages in %s. To exit press CTRL+C", queue);

    channel.consume(queue, async function(msg) {
      const data = JSON.parse(msg.content.toString());
      console.log("Received %s", msg.content.toString());
    
      try {
        const names = data.names;
    
        // Check if names is an array
        if (!Array.isArray(names)) {
          throw new Error('Invalid message format: names must be an array');
        }
    
        for (const name of names) {
          // Update the vote for the given name
          await Vote.updateOne({ name: name }, { $inc: { votes: 1 } }, { upsert: true });
        }
      } catch (error) {
        console.error(error);
      }
    
      channel.ack(msg);
    }, {
      noAck: false
    });    
  });
});

// Handle the GET request to get the vote counts
app.get('/votes', async (req, res) => {
  try {
    const votes = await Vote.find().sort({ votes: -1 });
    res.send(votes);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

// Start the server
app.listen(process.env.PORT||3000, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

module.exports = app;
