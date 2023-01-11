const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

require('dotenv').config();

const app = express();

// Connect to the MongoDB database
mongoose.set("strictQuery", false);
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define the schema for the votes collection
const voteSchema = new mongoose.Schema({
  name: String,
  votes: { type: Number, default: 1 },
});

// Create the model for the votes collection
const Vote = mongoose.model('Vote', voteSchema);

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

      for (const name of names) {
        // Check if the name exists in the database
        const vote = await Vote.findOne({ name: name.toLowerCase() });
        if (vote) {
          // If the name exists, update the votes count
          vote.votes += 1;
          await vote.save();
          console.log(`count saved: ${vote}`);
        } else {
          // If the name does not exist, create a new record
          const newVote = new Vote({ name: name.toLowerCase() });
          await newVote.save();
          console.log(`new name saved in DB: ${newVote}`);
        }
      }

      res.send({ message: 'Votes saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});


// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
